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
} from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { PrismaService } from '../prisma/prisma.service';
import { LimitWatcherService } from './limit-watcher.service';
import { OrdersService } from './orders.service';

// 15:20 IST = 09:50 UTC. Indian intraday squares off around this time at most
// retail brokers.
const SQUARE_OFF_UTC_HOUR = 9;
const SQUARE_OFF_UTC_MINUTE = 50;

export interface SquareResult {
  cancelled: number;
  squared: number;
  failed: number;
}

@Injectable()
export class AutoSquareService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoSquareService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
    @Inject(forwardRef(() => LimitWatcherService))
    private readonly limitWatcher: LimitWatcherService,
  ) {}

  onModuleInit() {
    this.scheduleNext();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
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
      void this.run().finally(() => this.scheduleNext());
    }, delay);
    this.logger.log(
      `Next intraday auto-square at ${target.toISOString()} (in ${Math.round(delay / 60_000)} min)`,
    );
  }

  /** Square off intraday positions for all users. Called daily at 15:20 IST. */
  async run(): Promise<SquareResult> {
    const result: SquareResult = { cancelled: 0, squared: 0, failed: 0 };
    this.logger.log('Auto-square run starting');

    // 1) Cancel every pending intraday triggered order across all users.
    const pending = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        product: OrderProduct.INTRADAY,
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

    // 2) Square off every open intraday position with a market SELL.
    const positions = await this.prisma.position.findMany({
      where: {
        product: OrderProduct.INTRADAY,
        quantity: { gt: 0 },
      },
    });
    for (const p of positions) {
      const closable = p.quantity - p.reservedQty;
      if (closable <= 0) continue;
      if (!isExchange(p.exchange)) {
        this.logger.warn(
          `auto-square: skip ${p.id} (unknown exchange ${p.exchange})`,
        );
        continue;
      }
      try {
        await this.orders.place({
          userId: p.userId,
          symbol: p.symbol,
          exchange: p.exchange,
          side: OrderSide.SELL,
          quantity: closable,
          type: OrderType.MARKET,
          product: OrderProduct.INTRADAY,
          origin: OrderOrigin.AUTO_SQUARE,
          forceFill: true,
        });
        result.squared += 1;
      } catch (err) {
        result.failed += 1;
        this.logger.warn(
          `auto-square: close ${p.id} failed: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Auto-square done: cancelled=${result.cancelled} squared=${result.squared} failed=${result.failed}`,
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
      const closable = p.quantity - p.reservedQty;
      if (closable <= 0) continue;
      const exchange = p.exchange as Exchange;
      if (!isExchange(exchange)) continue;
      try {
        await this.orders.place({
          userId: p.userId,
          symbol: p.symbol,
          exchange,
          side: OrderSide.SELL,
          quantity: closable,
          type: OrderType.MARKET,
          product: OrderProduct.INTRADAY,
        });
        result.squared += 1;
      } catch {
        result.failed += 1;
      }
    }

    return result;
  }
}
