import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TOTAL_LESSONS } from '../learn/lesson-catalog';
import { distinctSectorCount } from './company-sectors';
import { BADGES, BADGE_BY_ID, UserStats } from './badge-catalog';
import { traderTag } from './badge-tag';

/**
 * Server-authoritative achievements. Replaces the old client-side computation
 * (which was spoofable and only saw the last 50 orders). The badge *catalog*
 * lives in code (badge-catalog.ts); unlock *events* are persisted to
 * UserAchievement so they survive reinstall, sync across devices, and can be
 * trusted. Evaluation is triggered on order fills, referral credits, daily
 * snapshots, and lesson/quiz completion — and on demand via GET /achievements.
 */
@Injectable()
export class AchievementsService {
  private readonly logger = new Logger(AchievementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  /// Computes the authoritative metrics behind every badge predicate. Cheap
  /// aggregate queries run in parallel; safe to call on every hook.
  async computeStats(userId: string): Promise<UserStats> {
    const [
      filledCount,
      pnlAgg,
      referralCount,
      intraday,
      short,
      fno,
      option,
      openPositions,
      lessonsCompleted,
      perfectQuiz,
    ] = await Promise.all([
      this.prisma.order.count({
        where: { userId, status: 'FILLED' },
      }),
      this.prisma.position.aggregate({
        where: { userId },
        _sum: { realizedPnLP: true },
      }),
      this.prisma.user.count({ where: { referredById: userId } }),
      this.prisma.order.findFirst({
        where: { userId, status: 'FILLED', product: 'INTRADAY' },
        select: { id: true },
      }),
      this.prisma.position.findFirst({
        where: { userId, quantity: { lt: 0 } },
        select: { id: true },
      }),
      this.prisma.order.findFirst({
        where: { userId, status: 'FILLED', exchange: { in: ['NFO', 'BFO'] } },
        select: { id: true },
      }),
      this.prisma.order.findFirst({
        where: {
          userId,
          status: 'FILLED',
          OR: [
            { tradingsymbol: { endsWith: 'CE' } },
            { tradingsymbol: { endsWith: 'PE' } },
          ],
        },
        select: { id: true },
      }),
      this.prisma.position.findMany({
        where: { userId, quantity: { not: 0 } },
        select: { symbol: true },
      }),
      this.prisma.lessonProgress.count({ where: { userId } }),
      this.prisma.quizAttempt.findFirst({
        where: { userId, passed: true, total: { gt: 0 } },
        select: { id: true },
      }),
    ]);

    return {
      filledCount,
      realizedPnLP: pnlAgg._sum.realizedPnLP ?? 0n,
      referralCount,
      hasIntraday: intraday !== null,
      hasShort: short !== null,
      hasFno: fno !== null,
      hasOption: option !== null,
      distinctSectors: distinctSectorCount(openPositions.map((p) => p.symbol)),
      lessonsCompleted,
      totalLessons: TOTAL_LESSONS,
      hasPerfectQuiz: perfectQuiz !== null,
    };
  }

  /**
   * Recomputes which badges the user qualifies for and persists any new
   * unlocks. The first-ever evaluation for a user is treated as a silent
   * baseline (historical unlocks are recorded but not announced) so existing
   * users don't get a burst of notifications. Returns the full set of unlocked
   * badge ids. Safe to call fire-and-forget from hooks.
   */
  async evaluate(userId: string): Promise<string[]> {
    const stats = await this.computeStats(userId);
    const qualified = BADGES.filter((b) => b.test(stats)).map((b) => b.id);

    const [user, existing] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { achievementsBaselinedAt: true },
      }),
      this.prisma.userAchievement.findMany({
        where: { userId },
        select: { badgeId: true },
      }),
    ]);
    if (!user) return qualified;

    // A null baseline marker means this account predates server achievements
    // (or was never evaluated): snapshot its historical unlocks silently so we
    // don't blast a burst of push/email for things earned long ago. New
    // accounts are stamped at creation, so their genuine unlocks announce.
    const isBaseline = user.achievementsBaselinedAt === null;

    const existingIds = new Set(existing.map((e) => e.badgeId));
    const newly = qualified.filter((id) => !existingIds.has(id));

    if (isBaseline) {
      // Stamp first so a concurrent eval doesn't also treat this as baseline.
      await this.prisma.user.update({
        where: { id: userId },
        data: { achievementsBaselinedAt: new Date() },
      });
    }

    if (newly.length === 0) return qualified;

    for (const badgeId of newly) {
      try {
        await this.prisma.userAchievement.create({ data: { userId, badgeId } });
      } catch (err) {
        // A concurrent evaluation already inserted it — that path will (or
        // already did) announce it. Skip to avoid a double notification.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        this.logger.warn(
          `achievement insert failed (${badgeId}) for ${userId}: ${
            (err as Error).message
          }`,
        );
        continue;
      }
      if (!isBaseline) {
        void this.announce(userId, badgeId).catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`achievement announce failed (${badgeId}): ${msg}`);
        });
      }
    }
    return qualified;
  }

  /// Fires an in-app push (always) and a celebratory email (if the user has an
  /// address). Both are best-effort and isolated so one failing doesn't block
  /// the other or the unlock itself.
  private async announce(userId: string, badgeId: string): Promise<void> {
    const badge = BADGE_BY_ID[badgeId];
    if (!badge) return;

    await this.notifications
      .sendToUser(userId, {
        title: `Badge unlocked — ${badge.name}`,
        body: badge.hint,
        data: { kind: 'ACHIEVEMENT_UNLOCKED', badgeId },
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`achievement push failed (${badgeId}): ${msg}`);
      });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailAlias: true },
    });
    if (!user?.emailAlias) return;
    await this.mail
      .notify(
        user.emailAlias,
        `Achievement unlocked: ${badge.name}`,
        'Achievement unlocked 🏆',
        this.mail.badgeTile({
          glyph: '🏆',
          title: badge.name,
          subtitle: badge.hint,
        }) +
          this.mail.para(
            'Open the StockVirtue app to see all your badges and keep the streak going.',
          ),
        `Achievement unlocked: ${badge.name} — ${badge.hint}`,
      )
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`achievement email failed (${badgeId}): ${msg}`);
      });
  }

  /**
   * GET /achievements payload. Catches up evaluation first (so opening the
   * screen reflects the latest data), then returns every badge with its
   * unlocked flag + timestamp. Visual metadata stays client-side.
   */
  async getForUser(userId: string): Promise<{
    badges: { id: string; unlocked: boolean; unlockedAt: string | null }[];
  }> {
    await this.evaluate(userId);
    const rows = await this.prisma.userAchievement.findMany({
      where: { userId },
      select: { badgeId: true, unlockedAt: true },
    });
    const at = new Map(rows.map((r) => [r.badgeId, r.unlockedAt]));
    return {
      badges: BADGES.map((b) => ({
        id: b.id,
        unlocked: at.has(b.id),
        unlockedAt: at.get(b.id)?.toISOString() ?? null,
      })),
    };
  }

  /// Named "badge tag" (rank) per user, derived from their unlocked-badge
  /// count, for many users at once (a room's members, a leaderboard page).
  /// One groupBy query; users with no unlocks map to the base "Rookie" tag.
  /// Used by rooms + leaderboard to show a rank chip next to each name.
  async badgeTagsFor(userIds: string[]): Promise<Map<string, string>> {
    const tags = new Map<string, string>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return tags;
    const counts = await this.prisma.userAchievement.groupBy({
      by: ['userId'],
      where: { userId: { in: unique } },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((c) => [c.userId, c._count._all]));
    for (const uid of unique) {
      tags.set(uid, traderTag(byUser.get(uid) ?? 0));
    }
    return tags;
  }

  /// Aggregate unlock counts for the admin panel. Read-only.
  async adminStats(): Promise<{
    totalUnlocks: number;
    learners: number;
    perBadge: { id: string; name: string; count: number }[];
  }> {
    const grouped = await this.prisma.userAchievement.groupBy({
      by: ['badgeId'],
      _count: { badgeId: true },
    });
    const counts = new Map(grouped.map((g) => [g.badgeId, g._count.badgeId]));
    const totalUnlocks = grouped.reduce((a, g) => a + g._count.badgeId, 0);
    const distinctUsers = await this.prisma.userAchievement.findMany({
      distinct: ['userId'],
      select: { userId: true },
    });
    return {
      totalUnlocks,
      learners: distinctUsers.length,
      perBadge: BADGES.map((b) => ({
        id: b.id,
        name: b.name,
        count: counts.get(b.id) ?? 0,
      })).sort((a, b) => b.count - a.count),
    };
  }
}
