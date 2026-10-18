import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';

const SWEEP_INTERVAL_MS = 60 * 1000;
const BOOT_DELAY_MS = 20 * 1000;

interface TournamentRow {
  id: string;
  endsAt: Date | null;
  members: { id: string; userId: string; baselineAt: Date }[];
}

/// Drives tournament rooms through their bells, like a real contest:
///
///   • START (startsAt reached): every member's baseline is re-captured, so
///     the race is measured from the bell — trading done while waiting in
///     the lobby, and bonuses received before the start, don't count.
///   • END (endsAt reached): every member's equity (and the bonus credits
///     received during the contest) is frozen on their row, so the final
///     ranking can no longer move with post-contest trading.
///
/// Each transition is claimed with a conditional update (startedAt /
/// finalizedAt IS NULL), so a sweep that overlaps or repeats is a no-op.
@Injectable()
export class RoomsLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomsLifecycleService.name);
  private timer: NodeJS.Timeout | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolio: PortfolioService,
  ) {}

  onModuleInit() {
    this.bootTimer = setTimeout(() => void this.sweep(), BOOT_DELAY_MS);
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const memberSelect = {
        select: { id: true, userId: true, baselineAt: true },
      } as const;
      const toStart = await this.prisma.room.findMany({
        where: { isTournament: true, startedAt: null, startsAt: { lte: now } },
        select: { id: true, endsAt: true, members: memberSelect },
      });
      for (const room of toStart) {
        await this.start(room, now).catch((err: unknown) =>
          this.logger.warn(
            `Tournament ${room.id} start failed: ${(err as Error).message}`,
          ),
        );
      }
      const toFinalize = await this.prisma.room.findMany({
        where: { isTournament: true, finalizedAt: null, endsAt: { lte: now } },
        select: { id: true, endsAt: true, members: memberSelect },
      });
      for (const room of toFinalize) {
        await this.finalize(room, now).catch((err: unknown) =>
          this.logger.warn(
            `Tournament ${room.id} finalize failed: ${(err as Error).message}`,
          ),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Room lifecycle sweep failed: ${(err as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async start(room: TournamentRow, now: Date) {
    const totals = await this.portfolio.computeTotalsForUsersP(
      room.members.map((m) => m.userId),
    );
    const started = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.room.updateMany({
        where: { id: room.id, startedAt: null },
        data: { startedAt: now },
      });
      if (claim.count === 0) return false;
      for (const m of room.members) {
        const t = totals.get(m.userId);
        if (!t) continue;
        await tx.roomMember.update({
          where: { id: m.id },
          data: { baselineEquityP: t.totalEquityP, baselineAt: now },
        });
      }
      return true;
    });
    if (started) {
      this.logger.log(
        `Tournament ${room.id} started — ${room.members.length} member(s) re-baselined`,
      );
    }
  }

  private async finalize(room: TournamentRow, now: Date) {
    const endsAt = room.endsAt ?? now;
    const ids = room.members.map((m) => m.userId);
    const totals = await this.portfolio.computeTotalsForUsersP(ids);
    const earliest = room.members.reduce<Date | null>(
      (min, m) => (min === null || m.baselineAt < min ? m.baselineAt : min),
      null,
    );
    const credits = earliest
      ? await this.prisma.walletCredit.findMany({
          where: {
            userId: { in: ids },
            createdAt: { gte: earliest, lt: endsAt },
          },
          select: { userId: true, amountP: true, createdAt: true },
        })
      : [];
    const finalized = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.room.updateMany({
        where: { id: room.id, finalizedAt: null },
        data: { finalizedAt: now },
      });
      if (claim.count === 0) return false;
      for (const m of room.members) {
        const t = totals.get(m.userId);
        if (!t) continue;
        const creditsP = credits
          .filter((c) => c.userId === m.userId && c.createdAt >= m.baselineAt)
          .reduce((sum, c) => sum + c.amountP, 0n);
        await tx.roomMember.update({
          where: { id: m.id },
          data: { finalEquityP: t.totalEquityP, finalCreditsP: creditsP },
        });
      }
      return true;
    });
    if (finalized) {
      this.logger.log(
        `Tournament ${room.id} finalized — standings frozen for ${room.members.length} member(s)`,
      );
    }
  }
}
