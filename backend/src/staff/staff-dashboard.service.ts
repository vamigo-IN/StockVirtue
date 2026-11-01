import { Injectable } from '@nestjs/common';
import {
  NewsAssignmentStatus,
  NewsStatus,
  Prisma,
  StaffStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionKey, SUPER_ADMIN } from '../rbac/rbac.catalog';
import { StaffPrincipal } from './staff-request';
import { StaffSecurityService } from './staff-security.service';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;
/// A scheduled story this late means the worker isn't publishing.
const OVERDUE_MS = 3 * 60_000;

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
    const [mySessions, people, users, activity, security, articles] =
      await Promise.all([
        this.prisma.staffSession.count({
          where: {
            staffId: actor.staffId,
            ...this.security.liveSessionFilter(),
          },
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
        can('news.read')
          ? this.articleFigures(actor, can('news.read_all'))
          : null,
      ]);
    return { mySessions, people, users, activity, security, articles };
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

  /** Newsroom-wide with news.read_all; otherwise the person's own and assigned stories. */
  private async articleFigures(actor: StaffPrincipal, all: boolean) {
    const scope: Prisma.NewsArticleWhereInput = all
      ? {}
      : {
          OR: [
            { createdById: actor.staffId },
            {
              assignments: {
                some: {
                  assigneeId: actor.staffId,
                  status: { not: NewsAssignmentStatus.CANCELLED },
                },
              },
            },
          ],
        };
    const now = Date.now();
    const ist = new Date(now + IST_OFFSET_MS);
    const startOfIstDay = new Date(
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) -
        IST_OFFSET_MS,
    );
    const [groups, publishedToday, overdueScheduled] = await Promise.all([
      this.prisma.newsArticle.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
      this.prisma.newsArticle.count({
        where: {
          AND: [
            scope,
            {
              status: NewsStatus.PUBLISHED,
              publishedAt: { gte: startOfIstDay },
            },
          ],
        },
      }),
      all
        ? this.prisma.newsArticle.count({
            where: {
              status: NewsStatus.SCHEDULED,
              scheduledAt: { lt: new Date(now - OVERDUE_MS) },
            },
          })
        : Promise.resolve(0),
    ]);
    const by = (s: NewsStatus) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      scope: all ? ('all' as const) : ('mine' as const),
      total: groups.reduce((n, g) => n + g._count._all, 0),
      drafts: by(NewsStatus.DRAFT) + by(NewsStatus.CHANGES_REQUESTED),
      changesRequested: by(NewsStatus.CHANGES_REQUESTED),
      inReview: by(NewsStatus.IN_REVIEW),
      approved: by(NewsStatus.APPROVED),
      scheduled: by(NewsStatus.SCHEDULED),
      published: by(NewsStatus.PUBLISHED),
      publishedToday,
      overdueScheduled,
    };
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
