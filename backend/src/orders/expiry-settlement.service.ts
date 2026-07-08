import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { OrderOrigin, OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { LimitWatcherService } from './limit-watcher.service';
import { OrdersService } from './orders.service';

// SmartAPI scrip-master expiry format: DDMMMYYYY (e.g. "30JAN2025").
const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// 15:35 IST = 10:05 UTC — five minutes after the regulated market close to
// let the final tick settle.
function nextRunDelayMs(now = new Date()): number {
  const target = new Date(now);
  target.setUTCHours(10, 5, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}

function todayInIst(): string {
  // YYYY-MM-DD in IST (the date that an expiry like "30JAN2025" denotes).
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const ist = new Date(Date.now() + istOffsetMs);
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

const TRIGGERED_TYPES = [
  OrderType.LIMIT,
  OrderType.STOP_LOSS,
  OrderType.STOP_LOSS_LIMIT,
  OrderType.TRAILING_STOP,
];

@Injectable()
export class ExpirySettlementService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExpirySettlementService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly limitWatcher: LimitWatcherService,
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
      void this.run().finally(() => this.scheduleNext());
    }, delay);
    this.logger.log(`Next expiry settlement at ${fireAt}`);
  }

  /** Closes all open F&O positions whose contract expires today (IST). */
  async run(): Promise<SettlementResult> {
    if (this.running) {
      return { cancelled: 0, closed: 0, failed: 0, scanned: 0 };
    }
    this.running = true;
    const today = todayInIst();
    const result: SettlementResult = {
      cancelled: 0,
      closed: 0,
      failed: 0,
      scanned: 0,
    };
    try {
      // Step 1: cancel pending triggered orders on contracts expiring today.
      // Otherwise they'd sit in PENDING with no underlying to fire against.
      const pendingExpiring = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING,
          type: { in: TRIGGERED_TYPES },
          OR: [{ exchange: 'NFO' }, { exchange: 'BFO' }],
        },
      });
      for (const o of pendingExpiring) {
        const inst = isExchange(o.exchange)
          ? this.scripMaster.getInstrument(o.tradingsymbol, o.exchange)
          : null;
        if (!inst?.expiry) continue;
        if (parseExpiryToIsoDate(inst.expiry) !== today) continue;
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

      // Only F&O has expiries; equities don't.
      const positions = await this.prisma.position.findMany({
        where: {
          quantity: { not: 0 },
          OR: [{ exchange: 'NFO' }, { exchange: 'BFO' }],
        },
      });
      for (const p of positions) {
        result.scanned += 1;
        const inst = isExchange(p.exchange)
          ? this.scripMaster.getInstrument(p.tradingsymbol, p.exchange)
          : null;
        if (!inst?.expiry) continue;
        if (parseExpiryToIsoDate(inst.expiry) !== today) continue;

        const side =
          p.quantity > 0 ? OrderSide.SELL : OrderSide.BUY;
        const qty = Math.abs(p.quantity - p.reservedQty);
        if (qty <= 0) continue;
        try {
          await this.orders.place({
            userId: p.userId,
            symbol: p.tradingsymbol,
            exchange: p.exchange as Exchange,
            side,
            quantity: qty,
            product: p.product,
            origin: OrderOrigin.EXPIRY,
            // Settle instantly at the last (close) price — never leave a
            // cancellable pending order sitting overnight.
            forceFill: true,
          });
          result.closed += 1;
        } catch (err) {
          result.failed += 1;
          this.logger.warn(
            `Settlement failed for ${p.userId} ${p.symbol}: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(
        `Expiry settlement ${today}: scanned ${result.scanned}, closed ${result.closed}, failed ${result.failed}`,
      );
      return result;
    } finally {
      this.running = false;
    }
  }
}
