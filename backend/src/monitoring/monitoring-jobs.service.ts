import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbuseStatus } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const FLUSH_MS = 60_000;
const RETENTION_MS = 60 * 60_000; // hourly
const REQUESTLOG_DAYS = 7;
const TRAFFICSTAT_DAYS = 30;
const ABUSE_DAYS = 90;

/**
 * Moves the previous minute's Redis traffic aggregation into TrafficStat every
 * 60s, and prunes old monitoring rows hourly. Self-scheduled timers (matching
 * AutoSquareService's pattern — no cron dependency). Both are best-effort.
 */
@Injectable()
export class MonitoringJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonitoringJobsService.name);
  private readonly enabled: boolean;
  private flushTimer: NodeJS.Timeout | null = null;
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.enabled = config.get('monitoring', { infer: true }).enabled;
  }

  onModuleInit() {
    if (!this.enabled) return;
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_MS);
    this.retentionTimer = setInterval(() => void this.prune(), RETENTION_MS);
    this.flushTimer.unref?.();
    this.retentionTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  /// Flush the just-completed minute bucket (m-1) from Redis into TrafficStat.
  private async flush(): Promise<void> {
    try {
      // Leader lock so >1 fork doesn't double-write the same bucket.
      const lock = await this.redis.client.set(
        'mon:flush:lock',
        '1',
        'EX',
        55,
        'NX',
      );
      if (lock !== 'OK') return;

      const m = Math.floor(Date.now() / 60_000) - 1;
      const aggKey = `mon:agg:${m}`;
      const maxKey = `mon:aggmax:${m}`;
      const [agg, maxFlat] = await Promise.all([
        this.redis.client.hgetall(aggKey),
        this.redis.client.zrange(maxKey, 0, -1, 'WITHSCORES'),
      ]);
      if (!agg || Object.keys(agg).length === 0) return;

      const maxByComposite = new Map<string, number>();
      for (let i = 0; i < maxFlat.length; i += 2) {
        maxByComposite.set(maxFlat[i], Number(maxFlat[i + 1]));
      }

      // composite = `${method}|${route}|${sc}`; fields end in |c |l |e
      type Row = { count: number; latSum: number; err: number };
      const rows = new Map<string, Row>();
      for (const [field, valueStr] of Object.entries(agg)) {
        const lastBar = field.lastIndexOf('|');
        const composite = field.slice(0, lastBar);
        const metric = field.slice(lastBar + 1);
        const value = Number(valueStr);
        const row = rows.get(composite) ?? { count: 0, latSum: 0, err: 0 };
        if (metric === 'c') row.count = value;
        else if (metric === 'l') row.latSum = value;
        else if (metric === 'e') row.err = value;
        rows.set(composite, row);
      }

      const bucket = new Date(m * 60_000);
      for (const [composite, row] of rows) {
        const [method, route, scStr] = composite.split('|');
        const statusClass = Number(scStr);
        await this.prisma.trafficStat
          .upsert({
            where: {
              bucket_method_route_statusClass: {
                bucket,
                method,
                route,
                statusClass,
              },
            },
            create: {
              bucket,
              method,
              route,
              statusClass,
              count: row.count,
              errorCount: row.err,
              latencySumMs: BigInt(row.latSum),
              latencyMaxMs: maxByComposite.get(composite) ?? 0,
            },
            update: {
              count: { increment: row.count },
              errorCount: { increment: row.err },
              latencySumMs: { increment: BigInt(row.latSum) },
            },
          })
          .catch(() => {});
      }
      await this.redis.client.del(aggKey, maxKey);
    } catch (err) {
      this.logger.warn(`traffic flush failed: ${(err as Error).message}`);
    }
  }

  private async prune(): Promise<void> {
    try {
      const now = Date.now();
      await this.prisma.requestLog.deleteMany({
        where: { ts: { lt: new Date(now - REQUESTLOG_DAYS * 86_400_000) } },
      });
      await this.prisma.trafficStat.deleteMany({
        where: {
          bucket: { lt: new Date(now - TRAFFICSTAT_DAYS * 86_400_000) },
        },
      });
      // Keep OPEN flags forever; prune resolved ones after 90 days.
      await this.prisma.abuseEvent.deleteMany({
        where: {
          createdAt: { lt: new Date(now - ABUSE_DAYS * 86_400_000) },
          status: { not: AbuseStatus.OPEN },
        },
      });
    } catch (err) {
      this.logger.warn(`monitoring prune failed: ${(err as Error).message}`);
    }
  }
}
