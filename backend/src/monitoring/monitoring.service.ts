/// Temporary IP blocks: a sorted set scored by the instant the block lapses,
/// so refreshBlocklist() can expire them. (A plain SET plus an expiring marker
/// key made every "temporary" block permanent.)
const TEMP_BLOCK_KEY = 'mon:block:temp';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbuseStatus, AbuseSubjectType } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface TrafficEvent {
  method: string;
  route: string; // route template, e.g. '/api/market/quote/:symbol'
  status: number;
  latencyMs: number;
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

interface AbuseSignal {
  kind: string;
  subjectType: AbuseSubjectType;
  subject: string;
  windowSec: number;
  threshold: number;
  severity: number;
  /// Whether this signal may auto-block the IP when MONITORING_AUTO_BLOCK is on
  /// (only high-confidence, low-false-positive, IP-scoped signals).
  autoBlockable?: boolean;
}

const RECENT_MAX = 500; // capped "recent requests" ring
const FLAGS_RECENT_MAX = 200;
const TOP_TTL = 900; // 15 min for top-IP/user sorted sets
const AGG_TTL = 200; // per-minute aggregation buckets self-expire if unflushed
const BLOCK_REFRESH_MS = 10_000; // in-memory blocklist refresh cadence

@Injectable()
export class MonitoringService implements OnModuleInit {
  private readonly logger = new Logger(MonitoringService.name);
  private readonly enabled: boolean;
  private readonly sampleRate: number;
  private readonly autoBlock: boolean;
  // In-memory IP blocklist for O(1) per-request checks (refreshed from Redis).
  private blockedIps = new Set<string>();
  private allowIps = new Set<string>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    config: ConfigService<AppConfig, true>,
  ) {
    const m = config.get('monitoring', { infer: true });
    this.enabled = m.enabled;
    this.sampleRate = m.sampleRate;
    this.autoBlock = m.autoBlock;
  }

  onModuleInit() {
    if (!this.enabled) return;
    void this.refreshBlocklist();
    setInterval(() => void this.refreshBlocklist(), BLOCK_REFRESH_MS).unref?.();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // ─── Blocklist (checked by IpBlockGuard) ─────────────────────────

  isIpBlocked(ip: string | undefined): boolean {
    if (!ip || this.allowIps.has(ip)) return false;
    return this.blockedIps.has(ip);
  }

  private async refreshBlocklist(): Promise<void> {
    try {
      // Drop lapsed temporary blocks first, so they actually expire.
      await this.redis.client.zremrangebyscore(
        TEMP_BLOCK_KEY,
        0,
        Date.now(),
      );
      const [blocked, temp, allow] = await Promise.all([
        this.redis.client.smembers('mon:block:ips'),
        this.redis.client.zrange(TEMP_BLOCK_KEY, 0, -1),
        this.redis.client.smembers('mon:allow:ips'),
      ]);
      this.blockedIps = new Set([...blocked, ...temp]);
      this.allowIps = new Set(allow);
    } catch (err) {
      this.logger.warn(`blocklist refresh failed: ${(err as Error).message}`);
    }
  }

  /// Blocks an IP. With a `ttlSec` the block is TEMPORARY and lifts itself.
  ///
  /// Previously a TTL block still did `SADD mon:block:ips` and only set a
  /// separate expiring marker key — but nothing ever removed the IP from that
  /// set (the retention job only prunes requestLog/trafficStat/abuseEvent), so
  /// every "temporary" block was in fact permanent and could only be cleared
  /// by hand. Temporary blocks now live in a sorted set scored by their expiry
  /// instant, and refreshBlocklist() drops lapsed members on every pass.
  async blockIp(ip: string, ttlSec?: number): Promise<void> {
    if (ttlSec && ttlSec > 0) {
      await this.redis.client.zadd(
        TEMP_BLOCK_KEY,
        Date.now() + ttlSec * 1000,
        ip,
      );
    } else {
      await this.redis.client.sadd('mon:block:ips', ip);
    }
    this.blockedIps.add(ip);
  }

  async unblockIp(ip: string): Promise<void> {
    await this.redis.client.srem('mon:block:ips', ip);
    await this.redis.client.zrem(TEMP_BLOCK_KEY, ip);
    // Legacy marker from the pre-fix scheme; harmless if absent.
    await this.redis.client.del(`mon:block:ip:${ip}`);
    this.blockedIps.delete(ip);
  }

  // ─── Recording (called fire-and-forget by the interceptor) ───────

  private minuteBucket(now: number): number {
    return Math.floor(now / 60_000);
  }

  /**
   * Record one request: hot Redis counters + rolling abuse windows in a single
   * pipeline (one round-trip), a sampled/high-signal raw log, and abuse
   * evaluation. NEVER throws — monitoring must not affect the request path.
   */
  async record(evt: TrafficEvent): Promise<void> {
    if (!this.enabled) return;
    try {
      const now = Date.now();
      const m = this.minuteBucket(now);
      const sc = Math.floor(evt.status / 100); // 2|3|4|5
      const ip = evt.ip || 'unknown';
      const composite = `${evt.method}|${evt.route}|${sc}`;

      const p = this.redis.client.pipeline();
      // Global req/err per minute (for the live req/min + error-rate cards).
      p.incr(`mon:req:${m}`);
      p.expire(`mon:req:${m}`, TOP_TTL);
      if (evt.status >= 400) {
        p.incr(`mon:err:${m}`);
        p.expire(`mon:err:${m}`, TOP_TTL);
      }
      // Per-route aggregation for the 60s flush → TrafficStat.
      p.hincrby(`mon:agg:${m}`, `${composite}|c`, 1);
      p.hincrby(`mon:agg:${m}`, `${composite}|l`, Math.round(evt.latencyMs));
      if (evt.status >= 400) p.hincrby(`mon:agg:${m}`, `${composite}|e`, 1);
      p.expire(`mon:agg:${m}`, AGG_TTL);
      // Max latency per composite (ZADD GT keeps the greatest).
      p.zadd(`mon:aggmax:${m}`, 'GT', Math.round(evt.latencyMs), composite);
      p.expire(`mon:aggmax:${m}`, AGG_TTL);
      // Top actors this minute.
      p.zincrby(`mon:top:ip:${m}`, 1, ip);
      p.expire(`mon:top:ip:${m}`, TOP_TTL);
      if (evt.userId) {
        p.zincrby(`mon:top:user:${m}`, 1, evt.userId);
        p.expire(`mon:top:user:${m}`, TOP_TTL);
      }
      // Capped recent-requests ring for the admin feed.
      p.lpush(
        'mon:recent',
        JSON.stringify({
          t: now,
          method: evt.method,
          route: evt.route,
          status: evt.status,
          ms: Math.round(evt.latencyMs),
          userId: evt.userId ?? null,
          ip,
        }),
      );
      p.ltrim('mon:recent', 0, RECENT_MAX - 1);
      await p.exec();

      // Abuse signals (each its own INCR+TTL; cheap) + flag on trip.
      await this.evaluateAbuse(evt, ip, now);

      // Sampled raw log: ALWAYS persist 4xx/5xx (forensics), else 1-in-N.
      const isErrorStatus = evt.status >= 400;
      if (isErrorStatus || now % this.sampleRate === 0) {
        await this.prisma.requestLog
          .create({
            data: {
              method: evt.method,
              route: evt.route,
              status: evt.status,
              latencyMs: Math.round(evt.latencyMs),
              userId: evt.userId ?? null,
              ip: evt.ip ?? null,
              userAgent: evt.userAgent ?? null,
              requestId: evt.requestId ?? null,
              flagged: isErrorStatus,
            },
          })
          .catch(() => {});
      }
    } catch (err) {
      // Monitoring is best-effort; never surface to the request.
      this.logger.debug?.(`record failed: ${(err as Error).message}`);
    }
  }

  private async evaluateAbuse(
    evt: TrafficEvent,
    ip: string,
    now: number,
  ): Promise<void> {
    const m = this.minuteBucket(now);
    const w5 = Math.floor(now / 300_000);
    const signals: { key: string; count?: number; sig: AbuseSignal }[] = [];

    // (a) IP request flood.
    signals.push({
      key: `mon:rate:ip:${ip}:${m}`,
      sig: {
        kind: 'rate.ip',
        subjectType: AbuseSubjectType.IP,
        subject: ip,
        windowSec: 60,
        threshold: 300,
        severity: 2,
      },
    });
    // (c) Auth-failure storm (credential stuffing / permission probing).
    if (evt.status === 401 || evt.status === 403) {
      signals.push({
        key: `mon:authfail:ip:${ip}:${w5}`,
        sig: {
          kind: 'authfail.ip',
          subjectType: AbuseSubjectType.IP,
          subject: ip,
          windowSec: 300,
          threshold: 40,
          severity: 3,
          autoBlockable: true,
        },
      });
    }
    // (d) 429 storm (deliberate limit hammering).
    if (evt.status === 429) {
      signals.push({
        key: `mon:throttled:ip:${ip}:${w5}`,
        sig: {
          kind: 'throttled.ip',
          subjectType: AbuseSubjectType.IP,
          subject: ip,
          windowSec: 300,
          threshold: 60,
          severity: 2,
          autoBlockable: true,
        },
      });
    }
    // (g) Market-data scraping (shared broker budget).
    if (evt.route.startsWith('/api/market/')) {
      signals.push({
        key: `mon:market:ip:${ip}:${m}`,
        sig: {
          kind: 'market.scrape',
          subjectType: AbuseSubjectType.IP,
          subject: ip,
          windowSec: 60,
          threshold: 200,
          severity: 1,
        },
      });
    }
    // (f) Order-spam / bot trading (per user).
    if (
      evt.userId &&
      evt.method === 'POST' &&
      evt.route.startsWith('/api/orders')
    ) {
      signals.push({
        key: `mon:orders:user:${evt.userId}:${m}`,
        sig: {
          kind: 'order.spam',
          subjectType: AbuseSubjectType.USER,
          subject: evt.userId,
          windowSec: 60,
          threshold: 40,
          severity: 1,
        },
      });
    }

    for (const { key, sig } of signals) {
      const count = await this.bump(key, sig.windowSec);
      if (count > sig.threshold) await this.flag(sig, count, evt);
    }
  }

  /// INCR + first-hit EXPIRE, atomically (same pattern as the rate limiter).
  private async bump(key: string, windowSec: number): Promise<number> {
    return (await this.redis.client.eval(
      "local c=redis.call('INCR',KEYS[1]) if c==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return c",
      1,
      key,
      String(windowSec),
    )) as number;
  }

  /// Persist one abuse event per (kind, subject) per 10-min window (de-duped in
  /// Redis so a sustained attack doesn't spam the table), and optionally
  /// auto-block the IP when enabled.
  private async flag(
    sig: AbuseSignal,
    count: number,
    evt: TrafficEvent,
  ): Promise<void> {
    const dedupe = await this.redis.client.set(
      `mon:flagged:${sig.kind}:${sig.subject}`,
      '1',
      'EX',
      600,
      'NX',
    );
    if (dedupe !== 'OK') return; // already flagged recently

    let autoAction: string | null = null;
    if (
      this.autoBlock &&
      sig.autoBlockable &&
      sig.subjectType === AbuseSubjectType.IP
    ) {
      await this.blockIp(sig.subject, 30 * 60); // 30-min temp block
      autoAction = 'blocked';
    }

    const row = await this.prisma.abuseEvent
      .create({
        data: {
          kind: sig.kind,
          subjectType: sig.subjectType,
          subject: sig.subject,
          severity: sig.severity,
          count,
          threshold: sig.threshold,
          windowSec: sig.windowSec,
          detail: `${evt.method} ${evt.route} (${evt.status})`,
          ip:
            sig.subjectType === AbuseSubjectType.IP
              ? sig.subject
              : (evt.ip ?? null),
          userId:
            sig.subjectType === AbuseSubjectType.USER
              ? sig.subject
              : (evt.userId ?? null),
          autoAction,
        },
      })
      .catch((err: unknown) => {
        this.logger.warn(`abuse persist failed: ${(err as Error).message}`);
        return null;
      });
    if (row) {
      await this.redis.client
        .lpush(
          'mon:flags:recent',
          JSON.stringify({ t: Date.now(), ...sig, count }),
        )
        .catch(() => {});
      await this.redis.client.ltrim(
        'mon:flags:recent',
        0,
        FLAGS_RECENT_MAX - 1,
      );
      this.logger.warn(
        `ABUSE ${sig.kind} ${sig.subject} count=${count}/${sig.threshold}${autoAction ? ` [${autoAction}]` : ''}`,
      );
    }
  }

  // ─── Admin read side ─────────────────────────────────────────────

  async overview(): Promise<{
    reqLastMin: number;
    errLastMin: number;
    reqPrevMin: number;
    openFlags: number;
    blockedIps: number;
  }> {
    const now = Date.now();
    const m = this.minuteBucket(now);
    const [req, err, reqPrev, openFlags] = await Promise.all([
      this.redis.client.get(`mon:req:${m}`),
      this.redis.client.get(`mon:err:${m}`),
      this.redis.client.get(`mon:req:${m - 1}`),
      this.prisma.abuseEvent.count({ where: { status: AbuseStatus.OPEN } }),
    ]);
    return {
      reqLastMin: Number(req ?? 0),
      errLastMin: Number(err ?? 0),
      reqPrevMin: Number(reqPrev ?? 0),
      openFlags,
      blockedIps: this.blockedIps.size,
    };
  }

  /// Top endpoints over the last [minutes], aggregated from TrafficStat.
  async topEndpoints(minutes = 15, limit = 15) {
    const since = new Date(Date.now() - minutes * 60_000);
    const rows = await this.prisma.trafficStat.groupBy({
      by: ['method', 'route'],
      where: { bucket: { gte: since } },
      _sum: { count: true, errorCount: true, latencySumMs: true },
      _max: { latencyMaxMs: true },
    });
    return rows
      .map((r) => {
        const count = r._sum.count ?? 0;
        const latSum = Number(r._sum.latencySumMs ?? 0n);
        return {
          method: r.method,
          route: r.route,
          count,
          errors: r._sum.errorCount ?? 0,
          avgMs: count > 0 ? Math.round(latSum / count) : 0,
          maxMs: r._max.latencyMaxMs ?? 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /// Top IPs / users over the last few minute buckets (Redis ZSETs).
  async topActors(kind: 'ip' | 'user', minutes = 15, limit = 10) {
    const m = this.minuteBucket(Date.now());
    const keys = Array.from(
      { length: minutes },
      (_, i) => `mon:top:${kind}:${m - i}`,
    );
    const dest = `mon:topunion:${kind}`;
    try {
      await this.redis.client.zunionstore(dest, keys.length, ...keys);
      await this.redis.client.expire(dest, 30);
      const flat = await this.redis.client.zrevrange(
        dest,
        0,
        limit - 1,
        'WITHSCORES',
      );
      const out: { subject: string; count: number }[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        out.push({ subject: flat[i], count: Number(flat[i + 1]) });
      }
      return out;
    } catch {
      return [];
    }
  }

  async recentFlags(limit = 50) {
    return this.prisma.abuseEvent.findMany({
      where: { status: AbuseStatus.OPEN },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async setFlagStatus(id: string, status: AbuseStatus): Promise<void> {
    await this.prisma.abuseEvent
      .update({ where: { id }, data: { status } })
      .catch(() => {});
  }

  async actorDetail(kind: 'ip' | 'user', subject: string) {
    const where = kind === 'ip' ? { ip: subject } : { userId: subject };
    const [logs, flags] = await Promise.all([
      this.prisma.requestLog.findMany({
        where,
        orderBy: { ts: 'desc' },
        take: 100,
      }),
      this.prisma.abuseEvent.findMany({
        where:
          kind === 'ip'
            ? { subjectType: AbuseSubjectType.IP, subject }
            : { subjectType: AbuseSubjectType.USER, subject },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      logs,
      flags,
      blocked: kind === 'ip' && this.blockedIps.has(subject),
    };
  }

  recentRequests(limit = 100): Promise<string[]> {
    return this.redis.client.lrange('mon:recent', 0, limit - 1);
  }
}
