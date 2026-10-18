import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import {
  OrderOrigin,
  OrderProduct,
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import { isCommodityExchange } from '../common/contract-specs';
import { isExchange } from '../common/exchange';
import { commodityCloseMinutes, istNow } from '../common/market-hours';
import { PrismaService } from '../prisma/prisma.service';
import { LimitWatcherService } from './limit-watcher.service';
import { OrdersService } from './orders.service';

// 15:20 IST = 09:50 UTC. Indian intraday squares off around this time at most
// retail brokers.
const SQUARE_OFF_UTC_HOUR = 9;
const SQUARE_OFF_UTC_MINUTE = 50;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
// MCX intraday (MIS) is squared off this long before the evening close
// (23:30 / 23:55 IST, depending on US daylight saving).
const MCX_SQUARE_LEAD_MIN = 15;

export interface SquareResult {
  cancelled: number;
  squared: number;
  failed: number;
}

/// Which market's intraday book a run squares off. Equity covers NSE/BSE
/// cash and NFO/BFO/CDS derivatives (15:20 IST); commodity covers MCX/NCO,
/// which trade until late evening and are squared off just before close.
type Segment = 'equity' | 'commodity';

const COMMODITY_EXCHANGES = ['MCX', 'NCO'];

function exchangeFilter(segment: Segment): Prisma.StringFilter {
  return segment === 'commodity'
    ? { in: COMMODITY_EXCHANGES }
    : { notIn: COMMODITY_EXCHANGES };
}

@Injectable()
export class AutoSquareService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoSquareService.name);
  private timer: NodeJS.Timeout | null = null;
  private mcxTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    @Inject(forwardRef(() => LimitWatcherService))
    private readonly limitWatcher: LimitWatcherService,
  ) {}

  onModuleInit() {
    this.scheduleNext();
    this.scheduleNextCommodity();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
    if (this.mcxTimer) clearTimeout(this.mcxTimer);
  }

  private scheduleNext() {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(SQUARE_OFF_UTC_HOUR, SQUARE_OFF_UTC_MINUTE, 0, 0);
    if (target <= now) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    const delay = target.getTime() - now.getTime();
    this.timer = setTimeout(() => {
      void this.run('equity').finally(() => this.scheduleNext());
    }, delay);
    this.logger.log(
      `Next intraday auto-square at ${target.toISOString()} (in ${Math.round(delay / 60_000)} min)`,
    );
  }

  /// Next MCX square-off instant: (evening close − lead) IST on the next day
  /// it hasn't passed yet. The close moves with US daylight saving, so it's
  /// recomputed for each candidate day.
  private scheduleNextCommodity() {
    const now = new Date();
    let target: Date | null = null;
    for (let dayOffset = 0; dayOffset < 3 && !target; dayOffset++) {
      const ist = istNow(new Date(now.getTime() + dayOffset * 86_400_000));
      const istMidnightUtcMs =
        Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) -
        IST_OFFSET_MS;
      const minutes =
        commodityCloseMinutes(new Date(istMidnightUtcMs + 12 * 3_600_000)) -
        MCX_SQUARE_LEAD_MIN;
      const candidate = new Date(istMidnightUtcMs + minutes * 60_000);
      if (candidate > now) target = candidate;
    }
    const at = target ?? new Date(now.getTime() + 86_400_000);
    const delay = at.getTime() - now.getTime();
    this.mcxTimer = setTimeout(() => {
      void this.run('commodity').finally(() => this.scheduleNextCommodity());
    }, delay);
    this.logger.log(
      `Next MCX intraday auto-square at ${at.toISOString()} (in ${Math.round(delay / 60_000)} min)`,
    );
  }

  /** Square off intraday positions for all users in one market segment. */
  async run(segment: Segment = 'equity'): Promise<SquareResult> {
    const result: SquareResult = { cancelled: 0, squared: 0, failed: 0 };
    this.logger.log(`Auto-square (${segment}) run starting`);

    // 1) Cancel every pending intraday order in this segment.
    const pending = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        product: OrderProduct.INTRADAY,
        exchange: exchangeFilter(segment),
      },
    });
    for (const o of pending) {
      try {
        await this.orders.cancel(o.userId, o.id);
        this.limitWatcher.untrack(o.id);
        result.cancelled += 1;
      } catch (err) {
        this.logger.warn(
          `auto-square: cancel ${o.id} failed: ${(err as Error).message}`,
        );
      }
    }

    // 2) Square off every open intraday long in this segment with a market
    //    SELL at the last price.
    const positions = await this.prisma.position.findMany({
      where: {
        product: OrderProduct.INTRADAY,
        quantity: { gt: 0 },
        exchange: exchangeFilter(segment),
      },
    });
    for (const p of positions) {
      const outcome = await this.squarePosition(p, true);
      if (outcome === 'squared') result.squared += 1;
      else if (outcome === 'failed') result.failed += 1;
    }

    this.logger.log(
      `Auto-square (${segment}) done: cancelled=${result.cancelled} squared=${result.squared} failed=${result.failed}`,
    );
    return result;
  }

  /** Trigger square-off for a single user. Used by the admin endpoint. */
  async runForUser(userId: string): Promise<SquareResult> {
    const result: SquareResult = { cancelled: 0, squared: 0, failed: 0 };

    const pending = await this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.PENDING,
        product: OrderProduct.INTRADAY,
      },
    });
    for (const o of pending) {
      try {
        await this.orders.cancel(o.userId, o.id);
        this.limitWatcher.untrack(o.id);
        result.cancelled += 1;
      } catch {
        // skip
      }
    }

    const positions = await this.prisma.position.findMany({
      where: { userId, product: OrderProduct.INTRADAY, quantity: { gt: 0 } },
    });
    for (const p of positions) {
      // User-initiated: a normal MARKET order (queues as after-market when
      // the market is shut) — never a forced fill at a stale price.
      const outcome = await this.squarePosition(p, false);
      if (outcome === 'squared') result.squared += 1;
      else if (outcome === 'failed') result.failed += 1;
    }

    return result;
  }

  /// Market-sells the unreserved part of one intraday long. Resolves by the
  /// contract's TRADINGSYMBOL — for F&O / MCX the stored `symbol` is only the
  /// underlying ("NIFTY", "GOLD"), which doesn't identify a contract.
  /// `system` runs settle instantly at the last price (a square-off you could
  /// cancel isn't one); user-triggered runs place an ordinary MARKET order.
  private async squarePosition(
    p: {
      id: string;
      userId: string;
      tradingsymbol: string;
      exchange: string;
      quantity: number;
      reservedQty: number;
    },
    system: boolean,
  ): Promise<'squared' | 'skipped' | 'failed'> {
    const closable = p.quantity - p.reservedQty;
    if (closable <= 0) return 'skipped';
    if (!isExchange(p.exchange)) {
      this.logger.warn(
        `auto-square: skip ${p.id} (unknown exchange ${p.exchange})`,
      );
      return 'skipped';
    }
    try {
      const order = await this.orders.place({
        userId: p.userId,
        symbol: p.tradingsymbol,
        exchange: p.exchange,
        side: OrderSide.SELL,
        quantity: closable,
        type: OrderType.MARKET,
        product: OrderProduct.INTRADAY,
        origin: system ? OrderOrigin.AUTO_SQUARE : OrderOrigin.USER,
        forceFill: system,
      });
      // A user-triggered square-off off-hours queues as an after-market
      // order — hand it to the watcher so it fills at the next open.
      if (order.status === OrderStatus.PENDING) this.limitWatcher.track(order);
      return 'squared';
    } catch (err) {
      this.logger.warn(
        `auto-square: close ${p.id} (${isCommodityExchange(p.exchange) ? 'MCX' : 'equity'}) failed: ${(err as Error).message}`,
      );
      return 'failed';
    }
  }
}
