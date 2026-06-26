import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { Order, OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { isMarketOpen } from '../common/market-hours';
import { HolidaysService } from '../market/holidays.service';
import { rupeesToPaise } from '../common/money';
// (re-export needed below)
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiWsService } from '../ticks/smartapi-ws.service';
import { TickBusService } from '../ticks/tick-bus.service';
import { PublishedTick } from '../ticks/tick.types';
import { OrdersService } from './orders.service';

interface TrackedOrder {
  id: string;
  symbol: string;
  symboltoken: string;
  exchange: Exchange;
  side: OrderSide;
  type: OrderType; // LIMIT, STOP_LOSS, STOP_LOSS_LIMIT, or TRAILING_STOP
  thresholdRupees: number; // current limit / trigger price
  limitRupees: number | null; // only set for SL-L (used after trigger conversion)
  trailRupees: number | null; // only set for TRAILING_STOP
}

const TRACKED_TYPES = [
  OrderType.LIMIT,
  OrderType.STOP_LOSS,
  OrderType.STOP_LOSS_LIMIT,
  OrderType.TRAILING_STOP,
  // Queued after-market MARKET orders — filled at the open price on the first
  // live tick once the market opens (see decide()).
  OrderType.MARKET,
];

@Injectable()
export class LimitWatcherService implements OnModuleInit {
  private readonly logger = new Logger(LimitWatcherService.name);
  // `${exchange}:${token}` -> Set<orderId>
  private readonly byToken = new Map<string, Set<string>>();
  private readonly tracked = new Map<string, TrackedOrder>();

  constructor(
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    private readonly prisma: PrismaService,
    private readonly tickBus: TickBusService,
    private readonly smartApiWs: SmartApiWsService,
    private readonly holidays: HolidaysService,
  ) {}

  async onModuleInit() {
    const pending = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        type: { in: TRACKED_TYPES },
      },
    });
    for (const o of pending) this.track(o);
    if (pending.length > 0) {
      this.logger.log(`Loaded ${pending.length} pending triggered order(s)`);
    }
    this.tickBus.onTick((tick) => void this.onTick(tick));
  }

  track(order: Order): void {
    if (order.status !== OrderStatus.PENDING) return;
    if (!isExchange(order.exchange)) return;

    let thresholdP: bigint | null = null;
    let limitRupees: number | null = null;
    let trailRupees: number | null = null;
    if (order.type === OrderType.MARKET) {
      // Pending after-market order — limitPriceP holds the reservation price;
      // it fires on the first tick (see decide), not on a threshold crossing.
      thresholdP = order.limitPriceP;
    } else if (order.type === OrderType.LIMIT) {
      thresholdP = order.limitPriceP;
    } else if (order.type === OrderType.STOP_LOSS) {
      thresholdP = order.triggerPriceP;
    } else if (order.type === OrderType.STOP_LOSS_LIMIT) {
      thresholdP = order.triggerPriceP;
      limitRupees =
        order.limitPriceP !== null ? Number(order.limitPriceP) / 100 : null;
    } else if (order.type === OrderType.TRAILING_STOP) {
      thresholdP = order.triggerPriceP;
      trailRupees =
        order.trailAmountP !== null ? Number(order.trailAmountP) / 100 : null;
    }
    if (thresholdP === null) return;

    const thresholdRupees = Number(thresholdP) / 100;
    const key = `${order.exchange}:${order.symboltoken}`;
    this.tracked.set(order.id, {
      id: order.id,
      symbol: order.symbol,
      symboltoken: order.symboltoken,
      exchange: order.exchange,
      side: order.side,
      type: order.type,
      thresholdRupees,
      limitRupees,
      trailRupees,
    });
    const set = this.byToken.get(key) ?? new Set<string>();
    set.add(order.id);
    this.byToken.set(key, set);
    void this.smartApiWs.addRef(order.exchange, order.symboltoken);
  }

  untrack(orderId: string): void {
    const cached = this.tracked.get(orderId);
    if (!cached) return;
    const key = `${cached.exchange}:${cached.symboltoken}`;
    const set = this.byToken.get(key);
    if (set) {
      set.delete(orderId);
      if (set.size === 0) this.byToken.delete(key);
    }
    this.tracked.delete(orderId);
    void this.smartApiWs.removeRef(cached.exchange, cached.symboltoken);
  }

  stats() {
    return {
      pendingCount: this.tracked.size,
      symbolsWatched: this.byToken.size,
    };
  }

  private decide(
    order: TrackedOrder,
    ltp: number,
  ): { fire: boolean; convert: boolean } {
    if (order.type === OrderType.MARKET) {
      // Queued after-market order: fill at the open price on the first tick.
      // onTick() already gated market hours (holiday-aware), so any tick that
      // reaches here is in a live regular session — fire unconditionally.
      return { fire: true, convert: false };
    }
    if (order.type === OrderType.LIMIT) {
      const fire =
        order.side === OrderSide.BUY
          ? ltp <= order.thresholdRupees
          : ltp >= order.thresholdRupees;
      return { fire, convert: false };
    }
    if (order.type === OrderType.STOP_LOSS) {
      const fire =
        order.side === OrderSide.BUY
          ? ltp >= order.thresholdRupees
          : ltp <= order.thresholdRupees;
      return { fire, convert: false };
    }
    if (order.type === OrderType.STOP_LOSS_LIMIT) {
      const triggered =
        order.side === OrderSide.BUY
          ? ltp >= order.thresholdRupees
          : ltp <= order.thresholdRupees;
      return { fire: false, convert: triggered };
    }
    return { fire: false, convert: false };
  }

  private async onTick(tick: PublishedTick): Promise<void> {
    // Market-hours gate. A simulated order must never fill, convert
    // (SL-L → LIMIT), or ratchet a trailing stop while the market is closed —
    // real exchanges don't match trades off-hours. The SmartAPI feed keeps
    // delivering frames outside 09:15–15:30 IST whose LTP is frozen at the
    // prior close (see market-hours.ts); without this guard a resting
    // LIMIT/SL sitting at that price would fire instantly off-hours. Queued
    // after-market MARKET orders are unaffected: they only fill on the first
    // in-session tick, which this guard lets through once the regular session
    // opens. The check is HOLIDAY-AWARE: it consults the cached NSE/curated
    // calendar, so trades are also blocked on a weekday trading holiday (a
    // bare isMarketOpen() with no calendar would treat a holiday as open).
    if (!isMarketOpen(new Date(), this.holidays.getCachedHolidayDates())) {
      return;
    }
    const key = `${tick.exchange}:${tick.token}`;
    const ids = this.byToken.get(key);
    if (!ids || ids.size === 0) return;
    const toFire: string[] = [];
    const toConvert: string[] = [];
    for (const id of ids) {
      const o = this.tracked.get(id);
      if (!o) continue;
      if (o.type === OrderType.TRAILING_STOP && o.trailRupees !== null) {
        // SELL: trigger = LTP − trail, ratchets UP, fires on LTP <= trigger.
        // BUY : trigger = LTP + trail, ratchets DOWN, fires on LTP >= trigger.
        const isBuy = o.side === OrderSide.BUY;
        const candidateTrigger = isBuy
          ? tick.ltp + o.trailRupees
          : tick.ltp - o.trailRupees;
        const isFavorable = isBuy
          ? candidateTrigger < o.thresholdRupees
          : candidateTrigger > o.thresholdRupees;
        if (isFavorable) {
          o.thresholdRupees = candidateTrigger;
          void this.orders
            .updateTrailingTrigger(id, rupeesToPaise(candidateTrigger), o.side)
            .catch((err) =>
              this.logger.warn(
                `trailing trigger persist failed for ${id}: ${(err as Error).message}`,
              ),
            );
        } else {
          const shouldFire = isBuy
            ? tick.ltp >= o.thresholdRupees
            : tick.ltp <= o.thresholdRupees;
          if (shouldFire) toFire.push(id);
        }
        continue;
      }
      const d = this.decide(o, tick.ltp);
      if (d.fire) toFire.push(id);
      else if (d.convert) toConvert.push(id);
    }
    for (const id of toFire) {
      try {
        const filled = await this.orders.fillLimit(id, tick.ltp);
        if (filled) this.untrack(id);
      } catch (err) {
        this.logger.error(
          `Failed to fill order ${id}: ${(err as Error).message}`,
        );
      }
    }
    for (const id of toConvert) {
      try {
        const updated = await this.orders.convertStopLossLimitToLimit(id);
        if (updated) {
          const tracked = this.tracked.get(id);
          if (tracked && tracked.limitRupees !== null) {
            tracked.type = OrderType.LIMIT;
            tracked.thresholdRupees = tracked.limitRupees;
            tracked.limitRupees = null;
          }
        }
      } catch (err) {
        this.logger.error(
          `Failed to convert SL-L ${id}: ${(err as Error).message}`,
        );
      }
    }
  }
}
