import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { paiseToRupees } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { maskPhone } from './mask-phone';

const ROW_SELECT = {
  id: true,
  displayName: true,
  emailAlias: true,
  phone: true,
  firebaseUid: true,
  passwordHash: true,
  emailVerified: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  staffProfile: { select: { id: true } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof ROW_SELECT }>;

/**
 * App accounts as the newsroom's moderators see them: find someone, fix an
 * offensive display name, block or unblock. Blocking is the same hard cut-off
 * the ops admin uses (status BLOCKED + every refresh token dropped).
 */
@Injectable()
export class AppUsersService {
  private readonly logger = new Logger(AppUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  async list(opts: {
    q?: string;
    status?: UserStatus;
    cursor?: string;
    limit: number;
  }) {
    const where: Prisma.UserWhereInput = {};
    if (opts.status) where.status = opts.status;
    const term = opts.q?.trim();
    if (term) {
      const or: Prisma.UserWhereInput[] = [
        { displayName: { contains: term, mode: 'insensitive' } },
        { emailAlias: { contains: term, mode: 'insensitive' } },
        { referralCode: term.toUpperCase() },
        { id: term },
      ];
      const digits = term.replace(/\D/g, '');
      if (digits.length >= 4) or.push({ phone: { contains: digits } });
      where.OR = or;
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: ROW_SELECT,
    });
    const hasMore = rows.length > opts.limit;
    const items = (hasMore ? rows.slice(0, opts.limit) : rows).map((r) =>
      this.rowView(r),
    );
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...ROW_SELECT,
        avatarUrl: true,
        referralCode: true,
        wallet: { select: { balanceP: true } },
        _count: {
          select: { orders: true, roomMemberships: true, referrals: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    const moderation = await this.prisma.auditLog.findMany({
      where: { entityType: 'User', entityId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        action: true,
        actorEmail: true,
        before: true,
        after: true,
        meta: true,
        createdAt: true,
      },
    });
    return {
      ...this.rowView(user),
      avatarUrl: user.avatarUrl,
      referralCode: user.referralCode,
      walletBalance: user.wallet ? paiseToRupees(user.wallet.balanceP) : null,
      orders: user._count.orders,
      rooms: user._count.roomMemberships,
      referrals: user._count.referrals,
      moderation,
    };
  }

  /** Moderation rename, e.g. an offensive name on the public leaderboard. */
  async rename(
    actor: StaffPrincipal,
    id: string,
    displayName: string,
    client: ClientInfo,
  ) {
    const name = displayName.trim();
    if (name.length < 2) {
      throw new BadRequestException('Name must be at least 2 characters');
    }
    const user = await this.find(id);
    if (user.displayName !== name) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { displayName: name } });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'user.rename',
            entityType: 'User',
            entityId: id,
            before: { displayName: user.displayName },
            after: { displayName: name },
            ...client,
          },
          tx,
        );
      });
    }
    return this.detail(id);
  }

  async block(
    actor: StaffPrincipal,
    id: string,
    reason: string | undefined,
    client: ClientInfo,
  ) {
    const user = await this.find(id);
    if (user.id === actor.userId) {
      throw new BadRequestException("You can't block your own account.");
    }
    if (user.staffProfile && !actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenException(
        'This account belongs to newsroom staff. Only a Super Admin can block it.',
      );
    }
    if (user.status === UserStatus.BLOCKED) return this.detail(id);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: UserStatus.BLOCKED },
      });
      // A blocked account can't keep a newsroom session either.
      await tx.staffSession.updateMany({
        where: { staff: { userId: id }, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'blocked' },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'user.block',
          entityType: 'User',
          entityId: id,
          before: { status: user.status },
          after: { status: UserStatus.BLOCKED },
          meta: { reason: reason?.trim() || null },
          ...client,
        },
        tx,
      );
    });
    // Same cut-off as the ops admin: a still-valid 30-day refresh token must
    // not keep minting access tokens. Every request re-checks the status too.
    try {
      await this.auth.revokeAllUserSessions(id);
    } catch (err) {
      this.logger.error(
        `Refresh-token revoke failed for ${id}: ${(err as Error).message}`,
      );
    }
    return this.detail(id);
  }

  async unblock(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const user = await this.find(id);
    if (user.status !== UserStatus.BLOCKED) {
      throw new BadRequestException("This account isn't blocked.");
    }
    if (user.staffProfile && !actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenException(
        'This account belongs to newsroom staff. Only a Super Admin can unblock it.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: UserStatus.ACTIVE },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'user.unblock',
          entityType: 'User',
          entityId: id,
          before: { status: UserStatus.BLOCKED },
          after: { status: UserStatus.ACTIVE },
          ...client,
        },
        tx,
      );
    });
    return this.detail(id);
  }

  private async find(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: ROW_SELECT,
    });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  private rowView(r: Row) {
    const signIn: string[] = [];
    if (r.passwordHash) signIn.push('password');
    if (r.firebaseUid) signIn.push(r.phone ? 'phone' : 'google');
    return {
      id: r.id,
      displayName: r.displayName,
      email: r.emailAlias,
      phone: maskPhone(r.phone),
      emailVerified: r.emailVerified,
      signIn,
      status: r.status,
      isStaff: !!r.staffProfile,
      createdAt: r.createdAt,
      lastLoginAt: r.lastLoginAt,
    };
  }
}
