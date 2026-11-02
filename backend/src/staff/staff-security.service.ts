import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { ClientInfo, StaffPrincipal } from './staff-request';

/**
 * Portal-wide session oversight for people with security.manage: see every
 * signed-in staff session and end any of them (a lost laptop, a leaver).
 */
@Injectable()
export class StaffSecurityService {
  private readonly idleMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.idleMs =
      config.get('newsroom', { infer: true }).sessionIdleMinutes * 60_000;
  }

  /** Sessions that could still be used right now, most recently active first. */
  liveSessionFilter(now = new Date()) {
    return {
      revokedAt: null,
      expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime() - this.idleMs) },
    };
  }

  async listSessions(actor: StaffPrincipal) {
    const rows = await this.prisma.staffSession.findMany({
      where: this.liveSessionFilter(),
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
      include: {
        staff: {
          select: {
            id: true,
            displayName: true,
            user: { select: { emailAlias: true } },
          },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      staffId: s.staff.id,
      displayName: s.staff.displayName,
      email: s.staff.user.emailAlias,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      current: s.id === actor.sessionId,
    }));
  }

  async revokeSession(
    actor: StaffPrincipal,
    sessionId: string,
    client: ClientInfo,
  ) {
    const session = await this.prisma.staffSession.findUnique({
      where: { id: sessionId },
      select: {
        revokedAt: true,
        staff: { select: { id: true, userId: true } },
      },
    });
    if (!session || session.revokedAt) {
      throw new NotFoundException('That session has already ended.');
    }
    await this.assertMaySignOut(actor, session.staff.userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'signed_out_by_admin' },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.session.revoke_admin',
          entityType: 'StaffSession',
          entityId: sessionId,
          meta: { staffId: session.staff.id },
          ...client,
        },
        tx,
      );
    });
  }

  /** Ends every session a staff member has, on every device. */
  async signOutEverywhere(
    actor: StaffPrincipal,
    staffId: string,
    client: ClientInfo,
  ) {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: staffId },
      select: { id: true, userId: true },
    });
    if (!staff) throw new NotFoundException('Staff member not found.');
    if (staff.userId === actor.userId) {
      throw new BadRequestException(
        'To sign yourself out elsewhere, use "Sign out other sessions" under Security.',
      );
    }
    await this.assertMaySignOut(actor, staff.userId);
    const signedOut = await this.prisma.$transaction(async (tx) => {
      const result = await tx.staffSession.updateMany({
        where: { staffId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'signed_out_by_admin' },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'staff.session.sign_out_all',
          entityType: 'StaffProfile',
          entityId: staffId,
          meta: { sessions: result.count },
          ...client,
        },
        tx,
      );
      return result.count;
    });
    return { signedOut };
  }

  private async assertMaySignOut(actor: StaffPrincipal, targetUserId: string) {
    if (actor.roles.includes(SUPER_ADMIN)) return;
    const targetIsSuper = await this.prisma.userRole.count({
      where: { userId: targetUserId, role: { key: SUPER_ADMIN } },
    });
    if (targetIsSuper > 0) {
      throw new ForbiddenException(
        'Only a Super Admin can sign out another Super Admin.',
      );
    }
  }
}
