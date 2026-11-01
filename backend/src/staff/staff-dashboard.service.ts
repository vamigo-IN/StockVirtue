import { Injectable } from '@nestjs/common';
import { StaffStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey, SUPER_ADMIN } from '../rbac/rbac.catalog';
import { StaffPrincipal } from './staff-request';
import { StaffSecurityService } from './staff-security.service';

const DAY_MS = 86_400_000;

/**
 * Figures for the portal home page. Each section is computed only when the
 * caller holds the permission that would let them see the underlying list,
 * so the dashboard never reveals more than the pages behind it.
 */
@Injectable()
export class StaffDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: StaffSecurityService,
  ) {}

  async overview(actor: StaffPrincipal) {
    const can = (p: PermissionKey) =>
      actor.roles.includes(SUPER_ADMIN) || actor.permissions.has(p);
    const [mySessions, people, users, activity, security] = await Promise.all([
      this.prisma.staffSession.count({
        where: { staffId: actor.staffId, ...this.security.liveSessionFilter() },
      }),
      can('staff.read') ? this.people() : null,
      can('users.read') ? this.users() : null,
      can('audit.read')
        ? this.prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 8,
          })
        : null,
      can('security.manage') ? this.securityFigures() : null,
    ]);
    return { mySessions, people, users, activity, security };
  }

  private async people() {
    const [active, suspended, pendingInvitations] = await Promise.all([
      this.prisma.staffProfile.count({ where: { status: StaffStatus.ACTIVE } }),
      this.prisma.staffProfile.count({
        where: { status: StaffStatus.SUSPENDED },
      }),
      this.prisma.staffInvitation.count({
        where: {
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
    ]);
    return { active, suspended, pendingInvitations };
  }

  private async users() {
    const [total, joinedLast7Days, blocked] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * DAY_MS) } },
      }),
      this.prisma.user.count({ where: { status: UserStatus.BLOCKED } }),
    ]);
    return { total, joinedLast7Days, blocked };
  }

  private async securityFigures() {
    const [activeSessions, failedSignIns24h] = await Promise.all([
      this.prisma.staffSession.count({
        where: this.security.liveSessionFilter(),
      }),
      this.prisma.auditLog.count({
        where: {
          action: { in: ['staff.login.failed', 'staff.login.code_failed'] },
          createdAt: { gte: new Date(Date.now() - DAY_MS) },
        },
      }),
    ]);
    return { activeSessions, failedSignIns24h };
  }
}
