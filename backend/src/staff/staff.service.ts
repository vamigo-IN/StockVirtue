import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StaffStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyPassword } from '../common/password';
import { enforceRateLimit } from '../common/rate-limit';
import { AppConfig, NewsroomConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERMISSIONS,
  permissionGroup,
  SUPER_ADMIN,
} from '../rbac/rbac.catalog';
import { RbacService } from '../rbac/rbac.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';
import { newOpaqueToken, normalizeEmail, sha256Hex } from './staff-crypto';
import { ClientInfo, StaffPrincipal } from './staff-request';

const INVITE_INVALID =
  'This invitation link is no longer valid. Ask a newsroom admin for a new one.';

type RoleWithPermissions = Prisma.RoleGetPayload<{
  include: { permissions: true };
}>;

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);
  private readonly cfg: NewsroomConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly users: UsersService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cfg = config.get('newsroom', { infer: true });
  }

  // ── Members ─────────────────────────────────────────────────────────

  async listMembers() {
    const rows = await this.prisma.staffProfile.findMany({
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
      include: {
        user: {
          select: {
            emailAlias: true,
            status: true,
            roles: { select: { role: { select: { key: true, name: true } } } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayName: r.displayName,
      title: r.title,
      email: r.user.emailAlias,
      accountBlocked: r.user.status === UserStatus.BLOCKED,
      status: r.status,
      suspendedAt: r.suspendedAt,
      suspendedReason: r.suspendedReason,
      lastPortalLoginAt: r.lastPortalLoginAt,
      createdAt: r.createdAt,
      roles: r.user.roles.map((x) => x.role),
    }));
  }

  async setRoles(
    actor: StaffPrincipal,
    staffId: string,
    roleKeys: string[],
    client: ClientInfo,
  ) {
    const target = await this.findStaff(staffId);
    if (target.userId === actor.userId) {
      throw new BadRequestException(
        "You can't change your own roles. Ask another admin.",
      );
    }
    const next = [...new Set(roleKeys)];
    const current = target.user.roles.map((r) => r.role.key);
    const added = next.filter((k) => !current.includes(k));
    const removed = current.filter((k) => !next.includes(k));
    if (added.length === 0 && removed.length === 0) {
      return this.memberView(staffId);
    }
    const roles = await this.assertCanGrant(actor, [...added, ...removed]);
    if (removed.includes(SUPER_ADMIN)) {
      await this.assertNotLastSuperAdmin(target.userId);
    }
    const addedIds = roles
      .filter((r) => added.includes(r.key))
      .map((r) => r.id);
    await this.prisma.$transaction(async (tx) => {
      if (removed.length > 0) {
        await tx.userRole.deleteMany({
          where: { userId: target.userId, role: { key: { in: removed } } },
        });
      }
      if (addedIds.length > 0) {
        await tx.userRole.createMany({
          data: addedIds.map((roleId) => ({
            userId: target.userId,
            roleId,
            grantedById: actor.userId,
          })),
          skipDuplicates: true,
        });
      }
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.roles.set',
          entityType: 'StaffProfile',
          entityId: target.id,
          before: { roles: current },
          after: { roles: next },
          ...client,
        },
        tx,
      );
    });
    await this.rbac.bumpVersion();
    return this.memberView(staffId);
  }

  async suspend(
    actor: StaffPrincipal,
    staffId: string,
    reason: string | undefined,
    client: ClientInfo,
  ) {
    const target = await this.findStaff(staffId);
    if (target.userId === actor.userId) {
      throw new BadRequestException("You can't suspend yourself.");
    }
    this.assertCanManageTarget(actor, target);
    if (target.user.roles.some((r) => r.role.key === SUPER_ADMIN)) {
      await this.assertNotLastSuperAdmin(target.userId);
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: target.id },
        data: {
          status: StaffStatus.SUSPENDED,
          suspendedAt: now,
          suspendedReason: reason?.trim() || null,
        },
      });
      // Suspension takes effect immediately: every open session ends now.
      await tx.staffSession.updateMany({
        where: { staffId: target.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'suspended' },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.suspend',
          entityType: 'StaffProfile',
          entityId: target.id,
          meta: { reason: reason ?? null },
          ...client,
        },
        tx,
      );
    });
    return this.memberView(staffId);
  }

  async reactivate(actor: StaffPrincipal, staffId: string, client: ClientInfo) {
    const target = await this.findStaff(staffId);
    this.assertCanManageTarget(actor, target);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: target.id },
        data: {
          status: StaffStatus.ACTIVE,
          suspendedAt: null,
          suspendedReason: null,
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.reactivate',
          entityType: 'StaffProfile',
          entityId: target.id,
          ...client,
        },
        tx,
      );
    });
    return this.memberView(staffId);
  }

  // ── Roles & permissions ─────────────────────────────────────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        permissions: { select: { permissionKey: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      memberCount: r._count.users,
      permissions: r.permissions.map((p) => p.permissionKey).sort(),
    }));
  }

  listPermissions() {
    return PERMISSIONS.map((p) => ({
      key: p.key,
      group: permissionGroup(p.key),
      description: p.description,
    }));
  }

  // ── Invitations ─────────────────────────────────────────────────────

  async createInvitation(
    actor: StaffPrincipal,
    rawEmail: string,
    roleKeys: string[],
    client: ClientInfo,
  ) {
    const email = normalizeEmail(rawEmail);
    const keys = [...new Set(roleKeys)];
    const roles = await this.assertCanGrant(actor, keys);

    const existing = await this.prisma.user.findUnique({
      where: { emailAlias: email },
      select: { staffProfile: { select: { status: true } } },
    });
    if (existing?.staffProfile) {
      throw new ConflictException(
        existing.staffProfile.status === StaffStatus.SUSPENDED
          ? 'This person is in the newsroom but suspended. Reactivate them instead.'
          : 'This person is already in the newsroom. Change their roles instead.',
      );
    }

    const token = newOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.cfg.inviteTtlHours * 3_600_000,
    );
    const invitation = await this.prisma.$transaction(async (tx) => {
      // A fresh invitation replaces any earlier unused one for this email.
      await tx.staffInvitation.updateMany({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      const created = await tx.staffInvitation.create({
        data: {
          email,
          roleKeys: keys,
          tokenHash: sha256Hex(token),
          invitedById: actor.userId,
          expiresAt,
        },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.invite',
          entityType: 'StaffInvitation',
          entityId: created.id,
          after: { email, roles: keys },
          ...client,
        },
        tx,
      );
      return created;
    });

    // The token travels in the URL fragment, which browsers never send to a
    // server, so it can't land in access logs.
    const acceptUrl = `${this.cfg.portalUrl}/invite#token=${token}`;
    try {
      await this.mail.sendStaffInvitation(email, {
        inviterName: actor.displayName,
        roleNames: roles.map((r) => r.name),
        acceptUrl,
        expiresAt,
      });
    } catch (err) {
      this.logger.error(`Invitation email failed: ${(err as Error).message}`);
      await this.prisma.staffInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        "We couldn't send the invitation email. Try again in a minute.",
      );
    }
    return this.invitationView(invitation);
  }

  async listInvitations() {
    const rows = await this.prisma.staffInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.invitationView(r));
  }

  async revokeInvitation(
    actor: StaffPrincipal,
    invitationId: string,
    client: ClientInfo,
  ) {
    const result = await this.prisma.staffInvitation.updateMany({
      where: { id: invitationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('No open invitation with that id.');
    }
    await this.audit.recordSafely({
      actor: { userId: actor.userId, email: actor.email },
      action: 'staff.invite.revoke',
      entityType: 'StaffInvitation',
      entityId: invitationId,
      ...client,
    });
  }

  /** What the accept page shows before the invitee sets a password. */
  async previewInvitation(token: string) {
    const inv = await this.openInvitation(token);
    const [roles, user] = await Promise.all([
      this.prisma.role.findMany({
        where: { key: { in: inv.roleKeys } },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { emailAlias: inv.email },
        select: { passwordHash: true },
      }),
    ]);
    return {
      email: inv.email,
      roles: roles.map((r) => r.name),
      expiresAt: inv.expiresAt,
      hasAccount: !!user,
      // An existing email/password account signs in with its current
      // password; a new or Google-only account chooses one now.
      needsNewPassword: !user?.passwordHash,
    };
  }

  async acceptInvitation(
    token: string,
    password: string,
    displayName: string | undefined,
    client: ClientInfo,
  ) {
    await enforceRateLimit(
      this.redis.client,
      `staff:invite:ip:${client.ip ?? 'unknown'}`,
      10,
      15 * 60,
      'Too many attempts. Try again in a few minutes.',
    );
    const inv = await this.openInvitation(token);
    const roles = await this.prisma.role.findMany({
      where: { key: { in: inv.roleKeys } },
    });
    if (roles.length === 0) throw new BadRequestException(INVITE_INVALID);

    // The emailed link proves the invitee controls this address.
    let user = await this.users.findByEmail(inv.email);
    if (user) {
      if (user.status === UserStatus.BLOCKED) {
        throw new ForbiddenException('This account is blocked.');
      }
      if (user.passwordHash) {
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) {
          throw new BadRequestException(
            `Enter your existing StockVirtue password for ${inv.email}.`,
          );
        }
        if (!user.emailVerified) await this.users.markEmailVerified(user.id);
      } else {
        // Google- or phone-only account: this becomes its first password.
        await this.users.setPassword(user.id, await hashPassword(password));
        if (!user.emailVerified) await this.users.markEmailVerified(user.id);
      }
    } else {
      user = await this.users.createEmailUser({
        email: inv.email,
        passwordHash: await hashPassword(password),
      });
      await this.users.markEmailVerified(user.id);
    }

    const name =
      displayName?.trim() ||
      (user.displayName && !user.displayName.startsWith('Trader-')
        ? user.displayName
        : inv.email.split('@')[0]);
    const userId = user.id;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.staffInvitation.updateMany({
        where: {
          id: inv.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date(), acceptedUserId: userId },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVITE_INVALID);
      const profile = await tx.staffProfile.findUnique({ where: { userId } });
      if (profile?.status === StaffStatus.SUSPENDED) {
        throw new ForbiddenException(
          'Your newsroom access is suspended. Ask a newsroom admin to restore it.',
        );
      }
      if (!profile) {
        await tx.staffProfile.create({ data: { userId, displayName: name } });
      }
      await tx.userRole.createMany({
        data: roles.map((r) => ({
          userId,
          roleId: r.id,
          grantedById: inv.invitedById,
        })),
        skipDuplicates: true,
      });
      await this.audit.record(
        {
          actor: { userId, email: inv.email },
          action: 'staff.invite.accept',
          entityType: 'StaffInvitation',
          entityId: inv.id,
          after: { roles: roles.map((r) => r.key) },
          ...client,
        },
        tx,
      );
    });
    await this.rbac.bumpVersion();
    return { email: inv.email, roles: roles.map((r) => r.name) };
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async findStaff(staffId: string) {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: staffId },
      include: {
        user: {
          select: {
            emailAlias: true,
            roles: { select: { role: { select: { key: true } } } },
          },
        },
      },
    });
    if (!staff) throw new NotFoundException('Staff member not found.');
    return staff;
  }

  private async memberView(staffId: string) {
    const all = await this.listMembers();
    const found = all.find((m) => m.id === staffId);
    if (!found) throw new NotFoundException('Staff member not found.');
    return found;
  }

  /**
   * No privilege escalation: you can only grant or take away roles whose
   * permissions you hold yourself, and only a Super Admin can grant or remove
   * the Super Admin role.
   */
  private async assertCanGrant(
    actor: StaffPrincipal,
    roleKeys: string[],
  ): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      where: { key: { in: roleKeys } },
      include: { permissions: true },
    });
    const found = new Set(roles.map((r) => r.key));
    const unknown = roleKeys.filter((k) => !found.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown role: ${unknown.join(', ')}.`);
    }
    const actorIsSuper = actor.roles.includes(SUPER_ADMIN);
    for (const role of roles) {
      if (role.key === SUPER_ADMIN && !actorIsSuper) {
        throw new ForbiddenException(
          'Only a Super Admin can grant or remove the Super Admin role.',
        );
      }
      if (actorIsSuper) continue;
      const beyond = role.permissions.some(
        (p) => !actor.permissions.has(p.permissionKey),
      );
      if (beyond) {
        throw new ForbiddenException(
          `You can't grant or remove the ${role.name} role: it includes permissions you don't have.`,
        );
      }
    }
    return roles;
  }

  /** Non-super-admins can't suspend or reactivate a Super Admin. */
  private assertCanManageTarget(
    actor: StaffPrincipal,
    target: { user: { roles: { role: { key: string } }[] } },
  ) {
    const targetIsSuper = target.user.roles.some(
      (r) => r.role.key === SUPER_ADMIN,
    );
    if (targetIsSuper && !actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenException(
        'Only a Super Admin can suspend or reactivate another Super Admin.',
      );
    }
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const others = await this.prisma.userRole.count({
      where: {
        role: { key: SUPER_ADMIN },
        userId: { not: userId },
        user: { staffProfile: { status: StaffStatus.ACTIVE } },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'This is the only active Super Admin. Make someone else a Super Admin first.',
      );
    }
  }

  private async openInvitation(token: string) {
    const inv = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (
      !inv ||
      inv.acceptedAt ||
      inv.revokedAt ||
      inv.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(INVITE_INVALID);
    }
    return inv;
  }

  private invitationView(inv: {
    id: string;
    email: string;
    roleKeys: string[];
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    const status = inv.acceptedAt
      ? 'ACCEPTED'
      : inv.revokedAt
        ? 'REVOKED'
        : inv.expiresAt.getTime() <= Date.now()
          ? 'EXPIRED'
          : 'PENDING';
    return {
      id: inv.id,
      email: inv.email,
      roleKeys: inv.roleKeys,
      status,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
      acceptedAt: inv.acceptedAt,
    };
  }
}
