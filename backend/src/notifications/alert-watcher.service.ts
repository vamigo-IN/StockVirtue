import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AlertCondition, AlertStatus, PriceAlert } from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiWsService } from '../ticks/smartapi-ws.service';
import { TickBusService } from '../ticks/tick-bus.service';
import { PublishedTick } from '../ticks/tick.types';
import { NotificationsService } from './notifications.service';

interface TrackedAlert {
  id: string;
  userId: string;
  symbol: string;
  exchange: Exchange;
  symboltoken: string;
  condition: AlertCondition;
  thresholdRupees: number;
}

@Injectable()
export class AlertWatcherService implements OnModuleInit {
  private readonly logger = new Logger(AlertWatcherService.name);
  // `${exchange}:${token}` -> Set<alertId>
  private readonly byToken = new Map<string, Set<string>>();
  private readonly tracked = new Map<string, TrackedAlert>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickBus: TickBusService,
    private readonly smartApiWs: SmartApiWsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    const active = await this.prisma.priceAlert.findMany({
      where: { status: AlertStatus.ACTIVE },
    });
    for (const a of active) this.track(a);
    if (active.length > 0) {
      this.logger.log(`Loaded ${active.length} active price alert(s)`);
    }
    this.tickBus.onTick((tick) => void this.onTick(tick));
  }

  track(alert: PriceAlert): void {
    if (alert.status !== AlertStatus.ACTIVE) return;
    if (!isExchange(alert.exchange)) return;
    const key = `${alert.exchange}:${alert.symboltoken}`;
    this.tracked.set(alert.id, {
      id: alert.id,
      userId: alert.userId,
      symbol: alert.symbol,
      exchange: alert.exchange,
      symboltoken: alert.symboltoken,
      condition: alert.condition,
      thresholdRupees: Number(alert.priceP) / 100,
    });
    const set = this.byToken.get(key) ?? new Set<string>();
    set.add(alert.id);
    this.byToken.set(key, set);
    void this.smartApiWs.addRef(alert.exchange, alert.symboltoken);
  }

  untrack(alertId: string): void {
    const cached = this.tracked.get(alertId);
    if (!cached) return;
    const key = `${cached.exchange}:${cached.symboltoken}`;
    const set = this.byToken.get(key);
    if (set) {
      set.delete(alertId);
      if (set.size === 0) this.byToken.delete(key);
    }
    this.tracked.delete(alertId);
    void this.smartApiWs.removeRef(cached.exchange, cached.symboltoken);
  }

  stats() {
    return {
      activeCount: this.tracked.size,
      symbolsWatched: this.byToken.size,
    };
  }

  private async onTick(tick: PublishedTick): Promise<void> {
    const key = `${tick.exchange}:${tick.token}`;
    const ids = this.byToken.get(key);
    if (!ids || ids.size === 0) return;
    const toFire: TrackedAlert[] = [];
    for (const id of ids) {
      const a = this.tracked.get(id);
      if (!a) continue;
      const fire =
        a.condition === AlertCondition.ABOVE
          ? tick.ltp >= a.thresholdRupees
          : tick.ltp <= a.thresholdRupees;
      if (fire) toFire.push(a);
    }
    for (const a of toFire) {
      try {
        const updated = await this.prisma.priceAlert.updateMany({
          where: { id: a.id, status: AlertStatus.ACTIVE },
          data: { status: AlertStatus.TRIGGERED, triggeredAt: new Date() },
        });
        if (updated.count > 0) {
          await this.notifications.sendToUser(a.userId, {
            title: `${a.symbol} ${a.condition === AlertCondition.ABOVE ? 'above' : 'below'} ₹${a.thresholdRupees.toFixed(2)}`,
            body: `Current price ₹${tick.ltp.toFixed(2)}`,
            data: {
              kind: 'PRICE_ALERT',
              alertId: a.id,
              symbol: a.symbol,
              exchange: a.exchange,
            },
          });
        }
      } catch (err) {
        this.logger.error(
          `Alert ${a.id} fire failed: ${(err as Error).message}`,
        );
      } finally {
        this.untrack(a.id);
      }
    }
  }
}
