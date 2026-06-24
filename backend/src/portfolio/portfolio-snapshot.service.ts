import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AchievementsService } from '../achievements/achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioService } from './portfolio.service';

/// Daily snapshot of every user's portfolio equity. Writes happen at
/// 00:05 IST (~five minutes after market-close-day rollover) so positions
/// reflect the trading day that just finished. Powers:
///   * equity curves on the portfolio history screen
///   * the calendar heatmap of day-over-day P&L
///   * period leaderboards (weekly / monthly returns from a baseline)
///   * risk metrics that need the equity series (max drawdown, Sharpe)
const SNAPSHOT_HOUR_IST = 0;
const SNAPSHOT_MINUTE_IST = 5;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

@Injectable()
export class PortfolioSnapshotService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PortfolioSnapshotService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
    private readonly achievements: AchievementsService,
  ) {}

  onModuleInit() {
    this.scheduleNext();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    const delay = nextRunDelayMs();
    const fireAt = new Date(Date.now() + delay).toISOString();
    this.timer = setTimeout(() => {
      void this.runForAllUsers().finally(() => this.scheduleNext());
    }, delay);
    this.logger.log(`Next portfolio snapshot at ${fireAt}`);
  }

  /// Idempotent — uses the unique (userId, asOfDate) index so re-running
  /// the cron on the same calendar date upserts instead of duplicating.
  /// Iterates users sequentially: a single missed user is preferable to
  /// hammering SmartAPI multi-quote with parallel batches.
  async runForAllUsers(): Promise<{ written: number; failed: number }> {
    if (this.running) return { written: 0, failed: 0 };
    this.running = true;
    const asOfDate = todayIstAtMidnight();
    let written = 0;
    let failed = 0;
    try {
      const users = await this.prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true },
      });
      for (const u of users) {
        try {
          await this.writeSnapshotForUser(u.id, asOfDate);
          written += 1;
        } catch (err) {
          failed += 1;
          this.logger.warn(
            `Snapshot failed for ${u.id}: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(
        `Portfolio snapshots ${asOfDate
          .toISOString()
          .slice(0, 10)}: written ${written}, failed ${failed}`,
      );
      return { written, failed };
    } finally {
      this.running = false;
    }
  }

  async writeSnapshotForUser(userId: string, asOfDate: Date) {
    const totals = await this.portfolio.computeTotalsP(userId);
    await this.prisma.portfolioSnapshot.upsert({
      where: {
        userId_asOfDate: { userId, asOfDate },
      },
      create: {
        userId,
        asOfDate,
        ...totals,
      },
      update: {
        ...totals,
      },
    });
    // Daily catch-up on P&L / diversification badges that don't fire off a
    // single order (e.g. an unrealized milestone). Fire-and-forget.
    void this.achievements.evaluate(userId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`snapshot achievement eval failed for ${userId}: ${msg}`);
    });
  }
}

/// Returns the next 00:05 IST instant (or 00:05 IST tomorrow if we're
/// past it today). Converted to UTC delta in ms.
function nextRunDelayMs(now = new Date()): number {
  const istNowMs = now.getTime() + IST_OFFSET_MS;
  const istNow = new Date(istNowMs);
  const istTarget = new Date(
    Date.UTC(
      istNow.getUTCFullYear(),
      istNow.getUTCMonth(),
      istNow.getUTCDate(),
      SNAPSHOT_HOUR_IST,
      SNAPSHOT_MINUTE_IST,
    ),
  );
  if (istTarget.getTime() <= istNowMs) {
    istTarget.setUTCDate(istTarget.getUTCDate() + 1);
  }
  return istTarget.getTime() - istNowMs;
}

/// Today's IST date at 00:00 IST, expressed as a UTC Date instant. Used
/// as the unique-key value so all snapshots from the same IST date hash
/// to the same row.
function todayIstAtMidnight(now = new Date()): Date {
  const istNowMs = now.getTime() + IST_OFFSET_MS;
  const ist = new Date(istNowMs);
  return new Date(
    Date.UTC(
      ist.getUTCFullYear(),
      ist.getUTCMonth(),
      ist.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}
