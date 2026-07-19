import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ScripMasterService } from '../market/scrip-master.service';
import { SmartApiService } from '../smartapi/smartapi.service';

export interface HealthBlock {
  label: string;
  ok: boolean;
  detail: string;
}

@Injectable()
export class AdminHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly scripMaster: ScripMasterService,
    private readonly smartapi: SmartApiService,
  ) {}

  /// Each block is rendered as an "✓ ok / ✗ fail" tile on /admin/health.
  /// We run every check independently and never throw — a degraded
  /// dependency should still let the operator see the rest of the page.
  async snapshot(): Promise<HealthBlock[]> {
    const [postgres, redis, smartapi, scrip, snapshot] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
      this.checkSmartApi(),
      Promise.resolve(this.checkScripMaster()),
      this.checkLastSnapshot(),
    ]);
    return [postgres, redis, smartapi, scrip, snapshot];
  }

  private async checkPostgres(): Promise<HealthBlock> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        label: 'PostgreSQL',
        ok: true,
        detail: 'Connected; SELECT 1 returned',
      };
    } catch (err) {
      return {
        label: 'PostgreSQL',
        ok: false,
        detail: (err as Error).message,
      };
    }
  }

  private async checkRedis(): Promise<HealthBlock> {
    try {
      const pong: string = await this.redis.client.ping();
      return {
        label: 'Redis',
        ok: pong === 'PONG',
        detail: pong === 'PONG' ? 'PING → PONG' : `Unexpected reply: ${pong}`,
      };
    } catch (err) {
      return {
        label: 'Redis',
        ok: false,
        detail: (err as Error).message,
      };
    }
  }

  private async checkSmartApi(): Promise<HealthBlock> {
    try {
      const status = await this.smartapi.getStatus();
      if (!status.authenticated) {
        return {
          label: 'SmartAPI',
          ok: false,
          detail: 'Not authenticated — login on next request',
        };
      }
      const ttl = status.ttlSeconds ?? 0;
      const feed = status.feedTokenAvailable
        ? 'feed-token ok'
        : 'no feed-token';
      return {
        label: 'SmartAPI',
        ok: true,
        detail: `Authenticated · ${feed} · session TTL ${ttl}s`,
      };
    } catch (err) {
      return {
        label: 'SmartAPI',
        ok: false,
        detail: (err as Error).message,
      };
    }
  }

  private checkScripMaster(): HealthBlock {
    const stats = this.scripMaster.stats();
    if (!stats.ready) {
      return {
        label: 'Scrip master',
        ok: false,
        detail: 'Not loaded — index lookups will fail',
      };
    }
    const age = stats.loadedAt
      ? `loaded ${ago(new Date(stats.loadedAt))} ago`
      : 'no loadedAt';
    return {
      label: 'Scrip master',
      ok: true,
      detail: `${stats.total.toLocaleString()} instruments · ${age}`,
    };
  }

  private async checkLastSnapshot(): Promise<HealthBlock> {
    try {
      const last = await this.prisma.portfolioSnapshot.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { asOfDate: true, createdAt: true },
      });
      if (!last) {
        return {
          label: 'Daily snapshot',
          ok: false,
          detail: 'No snapshots have run yet',
        };
      }
      // Stale if the latest snapshot is more than 36 hours old (a
      // healthy schedule produces one every IST midnight).
      const stale = Date.now() - last.createdAt.getTime() > 36 * 60 * 60 * 1000;
      return {
        label: 'Daily snapshot',
        ok: !stale,
        detail: `Last run ${ago(last.createdAt)} ago for ${last.asOfDate
          .toISOString()
          .slice(0, 10)}`,
      };
    } catch (err) {
      return {
        label: 'Daily snapshot',
        ok: false,
        detail: (err as Error).message,
      };
    }
  }
}

function ago(when: Date): string {
  const ms = Date.now() - when.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
