import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { LeaderboardEntry } from '@prisma/client';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';

const INITIAL_BALANCE_P = 100_000_000n; // ₹10,00,000 starting balance
const RECOMPUTE_INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 30 * 1000;
const QUOTE_BATCH_SIZE = 50;

export interface PublicEntry {
  rank: number;
  displayName: string | null;
  totalEquity: number;
  returnPct: number;
}

export interface MeEntry extends PublicEntry {
  userId: string;
}

export interface LeaderboardResponse {
  computedAt: string | null;
  total: number;
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
    private readonly smartapi: SmartApiService,
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
    return {
      computedAt: top[0]?.computedAt?.toISOString() ?? null,
      total: await this.prisma.leaderboardEntry.count(),
      top: top.map((e) => this.serializePublic(e)),
      me: me ? this.serializeMe(me) : null,
    };
  }

  async recompute(): Promise<void> {
    if (this.recomputing) return;
    this.recomputing = true;
    const start = Date.now();
    try {
      const [wallets, positions, users] = await Promise.all([
        this.prisma.wallet.findMany(),
        this.prisma.position.findMany({ where: { quantity: { gt: 0 } } }),
        this.prisma.user.findMany({
          select: { id: true, displayName: true },
        }),
      ]);

      const ltpByKey = await this.fetchLtps(positions);
      const equityByUser = new Map<string, bigint>();
      for (const w of wallets) {
        equityByUser.set(w.userId, w.balanceP);
      }
      for (const p of positions) {
        const ltp = ltpByKey.get(`${p.exchange}:${p.symboltoken}`);
        if (ltp === undefined) continue;
        const valueP = rupeesToPaise(ltp) * BigInt(p.quantity);
        const prev = equityByUser.get(p.userId) ?? 0n;
        equityByUser.set(p.userId, prev + valueP);
      }

      const nameByUser = new Map(
        users.map((u) => [u.id, u.displayName] as const),
      );

      const sorted = Array.from(equityByUser.entries())
        .sort((a, b) => {
          const diff = b[1] - a[1];
          if (diff > 0n) return 1;
          if (diff < 0n) return -1;
          return a[0].localeCompare(b[0]); // stable tiebreak
        })
        .map(([userId, equityP], i) => {
          const deltaP = equityP - INITIAL_BALANCE_P;
          // return % with 2 decimals
          const returnPct =
            Number((deltaP * 10000n) / INITIAL_BALANCE_P) / 100;
          return {
            userId,
            rank: i + 1,
            displayName: nameByUser.get(userId) ?? null,
            totalEquityP: equityP,
            returnPct,
            computedAt: new Date(),
          };
        });

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

  private async fetchLtps(
    positions: { exchange: string; symboltoken: string }[],
  ): Promise<Map<string, number>> {
    const tokensByExchange = new Map<string, Set<string>>();
    for (const p of positions) {
      let set = tokensByExchange.get(p.exchange);
      if (!set) {
        set = new Set();
        tokensByExchange.set(p.exchange, set);
      }
      set.add(p.symboltoken);
    }
    const ltpByKey = new Map<string, number>();
    for (const [exchange, tokens] of tokensByExchange) {
      const arr = Array.from(tokens);
      for (let i = 0; i < arr.length; i += QUOTE_BATCH_SIZE) {
        const batch = arr.slice(i, i + QUOTE_BATCH_SIZE);
        try {
          const fetched = await this.smartapi.getMultiQuote(
            { [exchange]: batch },
            'LTP',
          );
          for (const q of fetched) {
            ltpByKey.set(`${q.exchange}:${q.symbolToken}`, q.ltp);
          }
        } catch (err) {
          this.logger.warn(
            `multi-quote batch failed for ${exchange}: ${(err as Error).message}`,
          );
        }
      }
    }
    return ltpByKey;
  }

  private serializePublic(e: LeaderboardEntry): PublicEntry {
    return {
      rank: e.rank,
      displayName: e.displayName,
      totalEquity: paiseToRupees(e.totalEquityP),
      returnPct: e.returnPct,
    };
  }

  private serializeMe(e: LeaderboardEntry): MeEntry {
    return { userId: e.userId, ...this.serializePublic(e) };
  }
}
