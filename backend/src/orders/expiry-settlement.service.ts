import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { OrderOrigin, OrderSide, OrderStatus } from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { commodityCloseMinutes, istNow } from '../common/market-hours';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { LimitWatcherService } from './limit-watcher.service';
import { OrdersService } from './orders.service';

// SmartAPI scrip-master expiry format: DDMMMYYYY (e.g. "30JAN2025").
const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/// Which derivatives book a run settles. Equity derivatives (NFO/BFO/CDS)
/// settle at 15:35 IST, five minutes after the regulated close; commodity
/// derivatives (MCX/NCO) trade into the evening and settle just after the
/// MCX close (23:30, or 23:55 while the US is on daylight saving).
type Segment = 'equity' | 'commodity';

const SEGMENT_EXCHANGES: Record<Segment, string[]> = {
  equity: ['NFO', 'BFO', 'CDS'],
  commodity: ['MCX', 'NCO'],
};

/// Minutes after IST midnight of the next run for a segment, on the IST
/// day containing `dayAt`.
function runMinutes(segment: Segment, dayAt: Date): number {
  return segment === 'equity'
    ? 15 * 60 + 35
    : commodityCloseMinutes(dayAt) + 2;
}

function nextRunAt(segment: Segment, now = new Date()): Date {
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const ist = istNow(new Date(now.getTime() + dayOffset * 86_400_000));
    const istMidnightUtcMs =
      Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) -
      IST_OFFSET_MS;
    const noon = new Date(istMidnightUtcMs + 12 * 3_600_000);
    const at = new Date(istMidnightUtcMs + runMinutes(segment, noon) * 60_000);
    if (at > now) return at;
  }
  return new Date(now.getTime() + 86_400_000);
}

function todayInIst(): string {
  // YYYY-MM-DD in IST (the date that an expiry like "30JAN2025" denotes).
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseExpiryToIsoDate(expiry: string): string | null {
  const m = /^(\d{1,2})([A-Z]{3})(\d{4})$/.exec(expiry);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = MONTHS[m[2]];
  const year = parseInt(m[3], 10);
  if (mon === undefined) return null;
  return `${year}-${String(mon + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface SettlementResult {
  cancelled: number;
  closed: number;
  failed: number;
  scanned: number;
}

@Injectable()
export class ExpirySettlementService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExpirySettlementService.name);
  private readonly timers: Partial<Record<Segment, NodeJS.Timeout>> = {};
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly limitWatcher: LimitWatcherService,
  ) {}

  onModuleInit() {
    this.scheduleNext('equity');
    this.scheduleNext('commodity');
  }

  onModuleDestroy() {
    for (const t of Object.values(this.timers)) if (t) clearTimeout(t);
  }

  private scheduleNext(segment: Segment) {
    const at = nextRunAt(segment);
    const delay = at.getTime() - Date.now();
    this.timers[segment] = setTimeout(() => {
      void this.run(segment).finally(() => this.scheduleNext(segment));
    }, delay);
    this.logger.log(`Next ${segment} expiry settlement at ${at.toISOString()}`);
  }

  /// Whether a contract is due for settlement: it expires today (IST) or has
  /// already expired. A contract that no longer appears in the scrip master
  /// at all has expired too — the master only lists live contracts.
  private dueContract(
    exchange: string,
    tradingsymbol: string,
    token: string,
    today: string,
  ): { due: boolean; quotable: boolean; overdue: boolean } {
    if (!isExchange(exchange)) {
      return { due: false, quotable: false, overdue: false };
    }
    const inst =
      this.scripMaster.getInstrument(tradingsymbol, exchange) ??
      this.scripMaster.getByToken(exchange, token);
    if (!inst) return { due: true, quotable: false, overdue: true };
    if (!inst.expiry) return { due: false, quotable: true, overdue: false };
    const iso = parseExpiryToIsoDate(inst.expiry);
    return {
      due: iso !== null && iso <= today,
      quotable: true,
      overdue: iso !== null && iso < today,
    };
  }

  /** Settles every open derivative in `segment` that expires today or earlier. */
  async run(segment: Segment = 'equity', attempt = 1): Promise<SettlementResult> {
    const result: SettlementResult = {
      cancelled: 0,
      closed: 0,
      failed: 0,
      scanned: 0,
    };
    // Without a loaded scrip master every contract would look "missing" —
    // i.e. expired — so never settle blind.
    if (this.running || !this.scripMaster.isReady()) return result;
    this.running = true;
    const today = todayInIst();
    const exchanges = SEGMENT_EXCHANGES[segment];
    try {
      // Step 1: cancel resting orders on contracts that are expiring (or have
      // expired) — they'd otherwise sit PENDING with nothing to fire against
      // and keep cash / quantity reserved.
      const pending = await this.prisma.order.findMany({
        where: { status: OrderStatus.PENDING, exchange: { in: exchanges } },
      });
      for (const o of pending) {
        if (!this.dueContract(o.exchange, o.tradingsymbol, o.symboltoken, today).due) {
          continue;
        }
        try {
          await this.orders.cancel(o.userId, o.id);
          this.limitWatcher.untrack(o.id);
          result.cancelled += 1;
        } catch (err) {
          this.logger.warn(
            `Pre-expiry cancel failed for order ${o.id}: ${(err as Error).message}`,
          );
        }
      }

      // Step 2: close the positions.
      const positions = await this.prisma.position.findMany({
        where: { quantity: { not: 0 }, exchange: { in: exchanges } },
      });
      for (const p of positions) {
        result.scanned += 1;
        const due = this.dueContract(p.exchange, p.tradingsymbol, p.symboltoken, today);
        if (!due.due) continue;
        const qty = Math.abs(p.quantity) - p.reservedQty;
        if (qty <= 0) continue;
        try {
          if (due.quotable) {
            await this.orders.place({
              userId: p.userId,
              symbol: p.tradingsymbol,
              exchange: p.exchange as Exchange,
              side: p.quantity > 0 ? OrderSide.SELL : OrderSide.BUY,
              quantity: qty,
              product: p.product,
              origin: OrderOrigin.EXPIRY,
              // Settle instantly at the last (close) price — never leave a
              // cancellable pending order sitting overnight.
              forceFill: true,
            });
          } else {
            // Contract already gone from the feed (it expired on a day we
            // missed): settle flat at cost so it stops lingering as an
            // unpriceable zombie position.
            await this.orders.settleAtPrice(p.id, p.avgPriceP);
          }
          result.closed += 1;
        } catch (err) {
          // Expiring TODAY: a transient quote failure must not wipe a real
          // P&L — leave it for the retry below. Already past expiry: the
          // feed has stopped quoting it, so settle flat at cost.
          if (!due.overdue) {
            result.failed += 1;
            this.logger.warn(
              `Settlement failed for ${p.userId} ${p.tradingsymbol}: ${(err as Error).message}`,
            );
            continue;
          }
          try {
            await this.orders.settleAtPrice(p.id, p.avgPriceP);
            result.closed += 1;
          } catch (fallbackErr) {
            result.failed += 1;
            this.logger.warn(
              `Settlement failed for ${p.userId} ${p.tradingsymbol}: ${(fallbackErr as Error).message}`,
            );
          }
        }
      }
      this.logger.log(
        `Expiry settlement (${segment}) ${today}: scanned ${result.scanned}, closed ${result.closed}, cancelled ${result.cancelled}, failed ${result.failed}`,
      );
      if (result.failed > 0 && attempt < 3) {
        const retry = setTimeout(
          () => void this.run(segment, attempt + 1),
          5 * 60 * 1000,
        );
        retry.unref?.();
      }
      return result;
    } finally {
      this.running = false;
    }
  }
}
