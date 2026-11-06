import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { MarketDataSource, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { MarketCache } from './market-cache';
import { UpdateSourceDto, UpdateTickerDto } from './market-config.dto';

export const SOURCE_KEY = 'angel-one';
export const TICKER_KEY = 'market.ticker';
/// The attribution a new licence row starts with; editable in the portal.
/// It names the exchanges, not the data vendor (owner, 6 Nov 2026); the
/// 20261113120000_market_attribution migration rewrites the old default.
export const DEFAULT_ATTRIBUTION = 'NSE, BSE, MCX and NSE currency data';
/// The source row is read on every public request; this long is fresh enough.
const SOURCE_TTL_MS = 10_000;

const STALE =
  'Someone else changed these settings after you opened them. Reload to get their changes, then make yours again.';

export interface TickerConfig {
  enabled: boolean;
  /** Where the ticker runs: the news site only, or every public page. */
  placement: 'news' | 'news_and_site';
  speed: 'slow' | 'normal' | 'fast';
  direction: 'left' | 'right';
  theme: 'dark' | 'light' | 'brand';
  show: { change: boolean; percent: boolean; labels: boolean };
  nameStyle: 'name' | 'symbol';
  mobile: 'show' | 'hide';
  /** Outside trading hours: last prices (labelled end-of-day) or nothing. */
  marketClosed: 'show' | 'hide';
}

export const DEFAULT_TICKER: TickerConfig = {
  enabled: true,
  placement: 'news_and_site',
  speed: 'normal',
  direction: 'left',
  theme: 'dark',
  show: { change: false, percent: true, labels: true },
  nameStyle: 'name',
  mobile: 'show',
  marketClosed: 'show',
};

const pickOne = <T extends string>(
  v: unknown,
  allowed: readonly T[],
  fb: T,
): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fb;
const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb);

/** Saved JSON → a ticker config the site can trust. */
export function parseTicker(raw: Prisma.JsonValue | undefined): TickerConfig {
  const o = (
    raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  ) as Record<string, unknown>;
  const show = (o.show && typeof o.show === 'object' ? o.show : {}) as Record<
    string,
    unknown
  >;
  const d = DEFAULT_TICKER;
  return {
    enabled: bool(o.enabled, d.enabled),
    placement: pickOne(
      o.placement,
      ['news', 'news_and_site'] as const,
      d.placement,
    ),
    speed: pickOne(o.speed, ['slow', 'normal', 'fast'] as const, d.speed),
    direction: pickOne(o.direction, ['left', 'right'] as const, d.direction),
    theme: pickOne(o.theme, ['dark', 'light', 'brand'] as const, d.theme),
    show: {
      change: bool(show.change, d.show.change),
      percent: bool(show.percent, d.show.percent),
      labels: bool(show.labels, d.show.labels),
    },
    nameStyle: pickOne(o.nameStyle, ['name', 'symbol'] as const, d.nameStyle),
    mobile: pickOne(o.mobile, ['show', 'hide'] as const, d.mobile),
    marketClosed: pickOne(
      o.marketClosed,
      ['show', 'hide'] as const,
      d.marketClosed,
    ),
  };
}

/**
 * The market-data licence (what the website and the app may show, live,
 * delayed or end-of-day) and the site ticker's settings. Both are edited by
 * holders of `market.configure`, and every change is audited.
 */
@Injectable()
export class MarketConfigService implements OnModuleInit {
  private sourceCache: { at: number; row: MarketDataSource } | null = null;
  private sourceReady: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: MarketCache,
  ) {}

  onModuleInit() {
    return this.ensureSource();
  }

  /**
   * Creates the licence row on first boot; LIVE is the business's decision
   * for both channels and can be narrowed in the portal. Nest runs this
   * module's start hooks side by side, so they share one call, and
   * ON CONFLICT DO NOTHING keeps it safe across processes too.
   */
  ensureSource(): Promise<void> {
    this.sourceReady ??= this.prisma.marketDataSource
      .createMany({
        data: [
          {
            key: SOURCE_KEY,
            name: 'Angel One SmartAPI',
            webRight: 'LIVE',
            appRight: 'LIVE',
            delayMinutes: 15,
            attribution: DEFAULT_ATTRIBUTION,
          },
        ],
        skipDuplicates: true,
      })
      .then(
        () => undefined,
        (err: unknown) => {
          this.sourceReady = null;
          throw err;
        },
      );
    return this.sourceReady;
  }

  async source(): Promise<MarketDataSource> {
    const now = Date.now();
    if (this.sourceCache && now - this.sourceCache.at < SOURCE_TTL_MS) {
      return this.sourceCache.row;
    }
    const row = await this.prisma.marketDataSource.findUnique({
      where: { key: SOURCE_KEY },
    });
    if (!row) throw new NotFoundException('Market data source not found.');
    this.sourceCache = { at: now, row };
    return row;
  }

  async updateSource(
    actor: StaffPrincipal,
    dto: UpdateSourceDto,
    client: ClientInfo,
  ) {
    const before = await this.source();
    const data = {
      ...(dto.webRight ? { webRight: dto.webRight } : {}),
      ...(dto.appRight ? { appRight: dto.appRight } : {}),
      ...(dto.delayMinutes ? { delayMinutes: dto.delayMinutes } : {}),
      ...(dto.attribution !== undefined
        ? { attribution: dto.attribution.trim() }
        : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketDataSource.update({
        where: { key: SOURCE_KEY },
        data: { ...data, updatedById: actor.staffId },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'market.source.update',
          entityType: 'MarketDataSource',
          entityId: SOURCE_KEY,
          before: {
            webRight: before.webRight,
            appRight: before.appRight,
            delayMinutes: before.delayMinutes,
            attribution: before.attribution,
          },
          after: data,
          ...client,
        },
        tx,
      );
      return updated;
    });
    this.sourceCache = null;
    await this.cache.invalidate('market rights');
    return row;
  }

  async ticker(): Promise<{ config: TickerConfig; version: number }> {
    const row = await this.prisma.siteConfig.findUnique({
      where: { key: TICKER_KEY },
    });
    return { config: parseTicker(row?.value), version: row?.version ?? 0 };
  }

  async updateTicker(
    actor: StaffPrincipal,
    dto: UpdateTickerDto,
    client: ClientInfo,
  ) {
    const before = await this.ticker();
    if (before.version !== dto.version) throw new ConflictException(STALE);
    const { version, ...rest } = dto;
    const config = parseTicker(rest as unknown as Prisma.JsonValue);
    const value = config as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      if (version === 0) {
        try {
          await tx.siteConfig.create({
            data: {
              key: TICKER_KEY,
              value,
              version: 1,
              updatedById: actor.staffId,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ConflictException(STALE);
          }
          throw err;
        }
      } else {
        const res = await tx.siteConfig.updateMany({
          where: { key: TICKER_KEY, version },
          data: {
            value,
            version: { increment: 1 },
            updatedById: actor.staffId,
          },
        });
        if (res.count === 0) throw new ConflictException(STALE);
      }
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'market.ticker.update',
          entityType: 'SiteConfig',
          entityId: TICKER_KEY,
          before: before.config as unknown as Prisma.InputJsonValue,
          after: value,
          ...client,
        },
        tx,
      );
    });
    await this.cache.invalidate('ticker');
    return this.ticker();
  }
}
