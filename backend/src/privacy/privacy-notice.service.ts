import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SEED_NOTICE_VERSION } from './privacy.constants';

/** Bumped after every privacy notice publish and gate switch (§5.4). */
export const NOTICE_GEN_KEY = 'privacy:notice:gen';
/** Published with it, so every process reloads at once (§5.11.6). */
export const NOTICE_CHANNEL = 'privacy:notice:changed';
/** The `site_config` row of the app notice gate (W7 decision 2, §5.11.6). */
export const NOTICE_GATE_KEY = 'privacy.notice-gate';

/** How often the generation key is read. */
export const NOTICE_POLL_MS = 5_000;
/** The database read that backs up a lost Redis message or a Redis outage. */
export const NOTICE_BACKSTOP_MS = 5 * 60_000;

/** The date of the seed version (the notice published on 3 Nov 2026). */
const SEED_MATERIAL_AT = new Date('2026-11-03T00:00:00+05:30');
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** A privacy notice version, as the API keeps it in memory. */
export interface NoticeVersion {
  version: string;
  seq: number;
  /** When it became current (the date of the material change). */
  materialAt: Date;
  summaryEn: string;
  summaryHi: string;
  /** Show the dated "We updated" lines (false for the seed). */
  announce: boolean;
  affectsAnalytics: boolean;
  affectsCookies: boolean;
}

/** The app notice gate's stored switch (no row = off). */
export interface GateSwitch {
  enabled: boolean;
  /** When a Super Admin ticked "App 1.4.0 or later is on Google Play…". */
  playConfirmedAt: string | null;
  /** The staff profile that last changed it. */
  updatedById: string | null;
  updatedAt: Date | null;
}

/** What `onChange` listeners receive. */
export interface NoticeChange {
  version: string;
  cookieVersion: number;
  gateEnabled: boolean;
  reason: string;
}

type Db = Prisma.TransactionClient | PrismaService;

export const SEED_FALLBACK: NoticeVersion = Object.freeze({
  version: SEED_NOTICE_VERSION,
  seq: 1,
  materialAt: SEED_MATERIAL_AT,
  summaryEn: '',
  summaryHi: '',
  announce: false,
  affectsAnalytics: false,
  affectsCookies: false,
}) as NoticeVersion;

export const GATE_OFF: GateSwitch = Object.freeze({
  enabled: false,
  playConfirmedAt: null,
  updatedById: null,
  updatedAt: null,
}) as GateSwitch;

const pad = (n: number) => String(n).padStart(2, '0');

/** The calendar month of a moment in India, "YYYY-MM". */
export function istMonth(now: Date): string {
  const t = new Date(now.getTime() + IST_OFFSET_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

/**
 * The id of the next notice version (§5.2), from the ids already used:
 * `YYYY-MM` (India's calendar) if unused; else `YYYY-MM-DD`; else
 * `YYYY-MM-DD.2`, `.3` … Never reused, never edited, never `cookies-…`.
 */
export function nextNoticeIdFrom(now: Date, used: Iterable<string>): string {
  const taken = new Set(used);
  const t = new Date(now.getTime() + IST_OFFSET_MS);
  const month = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
  if (!taken.has(month)) return month;
  const day = `${month}-${pad(t.getUTCDate())}`;
  if (!taken.has(day)) return day;
  for (let n = 2; ; n++) {
    const id = `${day}.${n}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * W7 decision 3: whether analytics must be asked about afresh for someone
 * who accepted `accepted` — they never accepted a version (or one we don't
 * know), or a version published after it affects analytics.
 */
export function analyticsChangedIn(
  versions: readonly Pick<NoticeVersion, 'version' | 'seq' | 'affectsAnalytics'>[],
  accepted: string | null | undefined,
): boolean {
  if (!accepted) return true;
  const mine = versions.find((v) => v.version === accepted);
  if (!mine) return true;
  return versions.some((v) => v.seq > mine.seq && v.affectsAnalytics);
}

/** The stored gate switch, from its `site_config` row (anything odd = off). */
export function parseGate(
  row: { value: unknown; updatedById: string | null; updatedAt: Date } | null,
): GateSwitch {
  if (!row || !row.value || typeof row.value !== 'object') return GATE_OFF;
  const v = row.value as Record<string, unknown>;
  return {
    enabled: v.enabled === true,
    playConfirmedAt:
      typeof v.playConfirmedAt === 'string' ? v.playConfirmedAt : null,
    updatedById: row.updatedById,
    updatedAt: row.updatedAt,
  };
}

/** Prisma: the table or a column is missing (the W7 migration not applied). */
function isMissing(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'P2021' || code === 'P2022') return true;
  const msg = String((err as { message?: string } | null)?.message ?? '');
  return code === 'P2010' && /42P01|42703|does not exist/.test(msg);
}

/**
 * The current privacy notice version (W7 addendum §5.4), held in memory so
 * `needsNotice` stays synchronous and costs no query: loaded before the API
 * serves (onModuleInit is awaited), reloaded at once on the Redis message
 * `privacy:notice:changed`, within 5 s from the generation key
 * `privacy:notice:gen` if the message is lost, and from the database every
 * 5 minutes if Redis is down. The same reload keeps the website's cookie
 * choice version (§5.13) and the app notice gate's switch (§5.11.6).
 * Without the W7 tables it falls back to `SEED_NOTICE_VERSION` and logs
 * once; boot continues.
 */
@Injectable()
export class PrivacyNoticeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrivacyNoticeService.name);
  /** Every version, oldest first (a handful of rows). */
  private versions: NoticeVersion[] = [SEED_FALLBACK];
  private cur: NoticeVersion = SEED_FALLBACK;
  private cookie = 1;
  private gate: GateSwitch = GATE_OFF;
  /** The W7 tables were missing at the last load: use the seed. */
  private missing = false;
  private warned = false;
  private gen: string | null = null;
  private lastLoad = 0;
  private ticking = false;
  private timer: NodeJS.Timeout | null = null;
  private sub: Redis | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(c: NoticeChange) => void>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload('boot');
    this.gen = await this.readGen();
    this.timer = setInterval(() => void this.tick(), NOTICE_POLL_MS);
    this.timer.unref?.();
    this.subscribe();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const sub = this.sub;
    this.sub = null;
    if (sub) await sub.quit().catch(() => sub.disconnect());
  }

  /* ── Reads (synchronous, from memory) ──────────────────────────────── */

  /** The current version: what `needsNotice` compares with. */
  current(): NoticeVersion {
    return this.cur;
  }

  /** Every version, oldest first. */
  all(): readonly NoticeVersion[] {
    return this.versions;
  }

  /** The website's current cookie choice version (1 without a row). */
  cookieVersion(): number {
    return this.cookie;
  }

  /** The app notice gate's stored switch. */
  gateSwitch(): GateSwitch {
    return this.gate;
  }

  /** W7 decision 3, from memory (`view()`'s `analyticsReask`). */
  analyticsChangedSince(accepted: string | null | undefined): boolean {
    return analyticsChangedIn(this.versions, accepted);
  }

  /**
   * Called after a reload that changed the version, the cookie version or
   * the gate switch (not at boot). Returns the unsubscribe function.
   */
  onChange(listener: (c: NoticeChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ── Reads (database) ──────────────────────────────────────────────── */

  /** Every version, oldest first; the seed when the table is empty or missing. */
  async versionsFrom(db: Db = this.prisma): Promise<NoticeVersion[]> {
    if (this.missing && db !== this.prisma) return [SEED_FALLBACK];
    try {
      const rows = await db.privacyNoticeVersion.findMany({
        orderBy: { seq: 'asc' },
        select: {
          id: true,
          seq: true,
          materialAt: true,
          summaryEn: true,
          summaryHi: true,
          announce: true,
          affectsAnalytics: true,
          affectsCookies: true,
        },
      });
      if (db === this.prisma) this.missing = false;
      if (!rows.length) {
        this.warn('privacy_notice_versions is empty: using the seed version');
        return [SEED_FALLBACK];
      }
      return rows.map((r) => ({
        version: r.id,
        seq: r.seq,
        materialAt: r.materialAt,
        summaryEn: r.summaryEn,
        summaryHi: r.summaryHi,
        announce: r.announce,
        affectsAnalytics: r.affectsAnalytics,
        affectsCookies: r.affectsCookies,
      }));
    } catch (err) {
      if (!isMissing(err)) throw err;
      if (db === this.prisma) this.missing = true;
      this.warn('site_cms migration not applied: the privacy notice version is the seed');
      return [SEED_FALLBACK];
    }
  }

  /** The authoritative current version (inside `accept()`'s transaction). */
  async currentFromDb(db: Db = this.prisma): Promise<NoticeVersion> {
    const list = await this.versionsFrom(db);
    return list[list.length - 1];
  }

  /** W7 decision 3, from the database (inside `accept()`'s transaction). */
  async analyticsChangedSinceDb(
    db: Db,
    accepted: string | null | undefined,
  ): Promise<boolean> {
    return analyticsChangedIn(await this.versionsFrom(db), accepted);
  }

  /** The id the next material change gets (§5.2). */
  async nextId(now = new Date(), db: Db = this.prisma): Promise<string> {
    const month = istMonth(now);
    let used: string[] = [];
    try {
      used = (
        await db.privacyNoticeVersion.findMany({
          where: { id: { startsWith: month } },
          select: { id: true },
        })
      ).map((r) => r.id);
    } catch (err) {
      if (!isMissing(err)) throw err;
      used = [SEED_NOTICE_VERSION];
    }
    return nextNoticeIdFrom(now, used);
  }

  /** The newest cookie choice version (1 when there is none, §5.13). */
  async cookieVersionFromDb(db: Db = this.prisma): Promise<number> {
    if (this.missing && db !== this.prisma) return 1;
    try {
      const row = await db.cookieConsentVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return row?.version ?? 1;
    } catch (err) {
      if (!isMissing(err)) throw err;
      return 1;
    }
  }

  /* ── Reloading ─────────────────────────────────────────────────────── */

  /**
   * Reads the versions, the cookie version and the gate switch, and tells
   * the listeners when one of the three changed. Reloads run one after the
   * other, each reading the database after it was asked for, so a publish
   * that reloads after its commit never gets an older read.
   */
  reload(reason: string): Promise<boolean> {
    const run = this.chain.then(() => this.load(reason));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async load(reason: string): Promise<boolean> {
    try {
      const [list, cookie, gateRow] = await Promise.all([
        this.versionsFrom(this.prisma),
        this.cookieVersionFromDb(this.prisma),
        this.prisma.siteConfig.findUnique({
          where: { key: NOTICE_GATE_KEY },
          select: { value: true, updatedById: true, updatedAt: true },
        }),
      ]);
      const before = {
        version: this.cur.version,
        cookie: this.cookie,
        gate: this.gate.enabled,
      };
      this.versions = list;
      this.cur = list[list.length - 1];
      this.cookie = cookie;
      this.gate = parseGate(gateRow);
      this.lastLoad = Date.now();
      const changed =
        before.version !== this.cur.version ||
        before.cookie !== this.cookie ||
        before.gate !== this.gate.enabled;
      if (reason === 'boot') {
        this.logger.log(
          `Privacy notice ${this.cur.version}; cookie choice version ${this.cookie}; app notice gate ${this.gate.enabled ? 'on' : 'off'}.`,
        );
      } else if (changed) {
        this.logger.log(
          `Privacy notice reloaded (${reason}): ${this.cur.version}; cookie choice version ${this.cookie}; app notice gate ${this.gate.enabled ? 'on' : 'off'}.`,
        );
        this.emit(reason);
      }
      return changed;
    } catch (err) {
      this.logger.error(
        `Couldn't load the privacy notice version (${(err as Error).message}); keeping ${this.cur.version}.`,
      );
      return false;
    }
  }

  /**
   * The gate switch this process just saved: applied before the PUT answers,
   * so "off" holds for the very next request here (§5.11.6).
   */
  applyGate(next: GateSwitch): void {
    const was = this.gate.enabled;
    this.gate = next;
    if (was !== next.enabled) this.emit('gate');
  }

  /**
   * After a publish or a gate change committed (and this process reloaded):
   * bump the generation and publish the message, so every other process
   * (more API forks, the worker) reloads now, or within 5 s at worst.
   */
  async broadcast(): Promise<void> {
    try {
      this.gen = String(await this.redis.client.incr(NOTICE_GEN_KEY));
      await this.redis.client.publish(NOTICE_CHANNEL, this.cur.version);
    } catch (err) {
      this.logger.warn(
        `Couldn't tell the other processes about the privacy notice change (${(err as Error).message}); they reload within ${NOTICE_BACKSTOP_MS / 60_000} minutes.`,
      );
    }
  }

  private emit(reason: string): void {
    const change: NoticeChange = {
      version: this.cur.version,
      cookieVersion: this.cookie,
      gateEnabled: this.gate.enabled,
      reason,
    };
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (err) {
        this.logger.warn(
          `A privacy notice listener failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /** One poll: the generation key, else the 5-minute database backstop. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const gen = await this.readGen();
      if (gen !== null && gen !== this.gen) {
        this.gen = gen;
        await this.reload('generation');
      } else if (Date.now() - this.lastLoad >= NOTICE_BACKSTOP_MS) {
        await this.reload('backstop');
      }
    } finally {
      this.ticking = false;
    }
  }

  private async readGen(): Promise<string | null> {
    try {
      return (await this.redis.client.get(NOTICE_GEN_KEY)) ?? '0';
    } catch {
      return null;
    }
  }

  private subscribe(): void {
    try {
      const sub = this.redis.client.duplicate();
      this.sub = sub;
      sub.on('message', (channel: string) => {
        if (channel === NOTICE_CHANNEL) void this.reload('message');
      });
      // Errors surface through the poll; without a listener ioredis prints
      // "Unhandled error event" on every reconnect attempt.
      sub.on('error', () => undefined);
      sub.subscribe(NOTICE_CHANNEL).catch((err: Error) => {
        this.logger.warn(
          `Couldn't subscribe to ${NOTICE_CHANNEL} (${err.message}); the 5 s poll stands in.`,
        );
      });
    } catch (err) {
      this.logger.warn(
        `Couldn't subscribe to ${NOTICE_CHANNEL} (${(err as Error).message}); the 5 s poll stands in.`,
      );
    }
  }

  private warn(message: string) {
    if (this.warned) return;
    this.warned = true;
    this.logger.error(message);
  }
}
