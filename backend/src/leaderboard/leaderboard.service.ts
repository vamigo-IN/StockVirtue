import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LeaderboardEntry } from '@prisma/client';
import { AchievementsService } from '../achievements/achievements.service';
import { paiseToRupees } from '../common/money';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

const INITIAL_BALANCE_P = 100_000_000n; // ₹10,00,000 starting balance
const RECOMPUTE_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;

export interface PublicEntry {
  rank: number;
  displayName: string | null;
  /** Named rank from achievements + academy progress (e.g. "Pro Trader"). */
  badgeTag: string;
  totalEquity: number;
  returnPct: number;
}

export interface MeEntry extends PublicEntry {
  userId: string;
}

export interface LeaderboardResponse {
  computedAt: string | null;
  top: PublicEntry[];
  me: MeEntry | null;
}

@Injectable()
export class LeaderboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LeaderboardService.name);
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private recomputing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit() {
    this.bootTimer = setTimeout(
      () => void this.recompute(),
      STARTUP_DELAY_MS,
    );
    this.timer = setInterval(
      () => void this.recompute(),
      RECOMPUTE_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async getLeaderboard(userId: string, limit = 50) {
    const top = await this.prisma.leaderboardEntry.findMany({
      orderBy: { rank: 'asc' },
      take: limit,
    });
    let me: LeaderboardEntry | null =
      top.find((e) => e.userId === userId) ?? null;
    if (!me) {
      me = await this.prisma.leaderboardEntry.findUnique({
        where: { userId },
      });
    }
    // Named rank chip per shown user (achievements + academy progress).
    const tags = await this.achievements.badgeTagsFor([
      ...top.map((e) => e.userId),
      ...(me ? [me.userId] : []),
    ]);
    return {
      computedAt: top[0]?.computedAt?.toISOString() ?? null,
      top: top.map((e) => this.serializePublic(e, tags)),
      me: me ? this.serializeMe(me, tags) : null,
    };
  }

  /// Ranks every trader by TRADING return:
  ///   (equity − ₹10L starting balance − bonus credits) / ₹10L
  /// Referral bonuses and promos grow a trader's balance (and the equity
  /// shown) but never their rank — climbing the board takes trading skill,
  /// not invites. Equity uses the shared valuation, so margined futures and
  /// shorts are counted correctly.
  async recompute(): Promise<void> {
    if (this.recomputing) return;
    this.recomputing = true;
    const start = Date.now();
    try {
      const [wallets, users, credits] = await Promise.all([
        this.prisma.wallet.findMany({ select: { userId: true } }),
        this.prisma.user.findMany({
          select: { id: true, displayName: true },
        }),
        this.prisma.walletCredit.groupBy({
          by: ['userId'],
          _sum: { amountP: true },
        }),
      ]);
      const totals = await this.portfolio.computeTotalsForUsersP(
        wallets.map((w) => w.userId),
      );
      const creditsByUser = new Map(
        credits.map((c) => [c.userId, c._sum.amountP ?? 0n] as const),
      );
      const nameByUser = new Map(
        users.map((u) => [u.id, u.displayName] as const),
      );

      const rows = Array.from(totals.entries()).map(([userId, t]) => {
        const tradingPnLP =
          t.totalEquityP - INITIAL_BALANCE_P - (creditsByUser.get(userId) ?? 0n);
        return { userId, equityP: t.totalEquityP, tradingPnLP };
      });
      rows.sort((a, b) => {
        const diff = b.tradingPnLP - a.tradingPnLP;
        if (diff > 0n) return 1;
        if (diff < 0n) return -1;
        return a.userId.localeCompare(b.userId); // stable tiebreak
      });
      const computedAt = new Date();
      const sorted = rows.map((r, i) => ({
        userId: r.userId,
        rank: i + 1,
        displayName: nameByUser.get(r.userId) ?? null,
        totalEquityP: r.equityP,
        // return % with 2 decimals
        returnPct: Number((r.tradingPnLP * 10000n) / INITIAL_BALANCE_P) / 100,
        computedAt,
      }));

      await this.prisma.$transaction([
        this.prisma.leaderboardEntry.deleteMany(),
        this.prisma.leaderboardEntry.createMany({ data: sorted }),
      ]);
      this.logger.log(
        `Recomputed leaderboard for ${sorted.length} user(s) in ${Date.now() - start}ms`,
      );
    } catch (err) {
      this.logger.error(
        `Leaderboard recompute failed: ${(err as Error).message}`,
      );
    } finally {
      this.recomputing = false;
    }
  }

  private serializePublic(
    e: LeaderboardEntry,
    tags: Map<string, string>,
  ): PublicEntry {
    return {
      rank: e.rank,
      displayName: e.displayName,
      badgeTag: tags.get(e.userId) ?? 'Rookie',
      totalEquity: paiseToRupees(e.totalEquityP),
      returnPct: e.returnPct,
    };
  }

  private serializeMe(e: LeaderboardEntry, tags: Map<string, string>): MeEntry {
    return { userId: e.userId, ...this.serializePublic(e, tags) };
  }
}
