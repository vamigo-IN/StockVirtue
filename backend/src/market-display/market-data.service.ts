import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketDataRight, MarketInstrumentKind } from '@prisma/client';
import { Exchange } from '../common/exchange';
import { IpoService } from '../ipo/ipo.service';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { HolidaysService } from '../market/holidays.service';
import { constituentsFor } from '../market/index-constituents';
import { MarketService } from '../market/market.service';
import { CandleInterval } from '../smartapi/smartapi.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  Channel,
  DataLabel,
  lastSessionClose,
  present,
  PricePoint,
  rightFor,
  sessionOpen,
  Shown,
} from './data-rights';
import { MarketCache } from './market-cache';
import { MarketClock } from './market-clock';
import { MarketConfigService, TickerConfig } from './market-config.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { QuoteAllowlistService } from './quote-allowlist.service';

/** A price as readers get it: the value, its label and its time. */
export interface DisplayQuote extends Omit<Shown, 'asOf'> {
  ref: string;
  kind: MarketInstrumentKind;
  exchange: string;
  symbol: string;
  name: string;
  unit: string | null;
  /** Front-month contract, for commodities and currencies. */
  contract: string | null;
  inTicker: boolean;
  asOf: string;
}

export interface ListRow {
  ref: string;
  symbol: string;
  name: string;
  ltp: number;
  change: number | null;
  changePct: number | null;
  volume?: number | null;
}

/** Every list answer: rows, how they're labelled, and whose data it is. */
export interface Labelled<T> {
  available: boolean;
  /** Why not, when unavailable ("rights" | "upstream"). */
  reason?: 'rights' | 'upstream';
  label: DataLabel | null;
  asOf: string | null;
  attribution: string;
  data: T;
}

export const CHART_RANGES = ['1D', '5D', '1M', '6M', '1Y'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

const RANGE: Record<
  ChartRange,
  { interval: CandleInterval; hours: number; sessions?: number }
> = {
  '1D': { interval: 'FIVE_MINUTE', hours: 24 * 5, sessions: 1 },
  '5D': { interval: 'FIFTEEN_MINUTE', hours: 24 * 9, sessions: 5 },
  '1M': { interval: 'ONE_DAY', hours: 24 * 35 },
  '6M': { interval: 'ONE_DAY', hours: 24 * 190 },
  '1Y': { interval: 'ONE_DAY', hours: 24 * 370 },
};
const CHART_TTL: Record<ChartRange, number> = {
  '1D': 60,
  '5D': 300,
  '1M': 1800,
  '6M': 3600,
  '1Y': 3600,
};

/** Sector indices for the sector-performance widget (scrip-master names). */
// prettier-ignore
export const SECTORS: readonly { symbol: string; name: string }[] = [
  { symbol: 'BANKNIFTY', name: 'Banks' },
  { symbol: 'NIFTY IT', name: 'IT' },
  { symbol: 'NIFTY AUTO', name: 'Auto' },
  { symbol: 'NIFTY PHARMA', name: 'Pharma' },
  { symbol: 'NIFTY FMCG', name: 'FMCG' },
  { symbol: 'NIFTY METAL', name: 'Metals' },
  { symbol: 'NIFTY ENERGY', name: 'Energy' },
  { symbol: 'NIFTY REALTY', name: 'Realty' },
  { symbol: 'FINNIFTY', name: 'Financial services' },
  { symbol: 'NIFTY PVT BANK', name: 'Private banks' },
  { symbol: 'NIFTY PSU BANK', name: 'PSU banks' },
  { symbol: 'NIFTY MEDIA', name: 'Media' },
  { symbol: 'NIFTY INFRA', name: 'Infrastructure' },
  { symbol: 'NIFTY COMMODITIES', name: 'Commodities' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Market data for readers: the curated snapshot and ticker, quotes, movers,
 * sectors, heatmaps, charts and IPOs. Every value passes through the data
 * licence (data-rights.ts) and carries its label, time and source; answers
 * are cached briefly so the broker sees one request however many readers.
 */
@Injectable()
export class MarketDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshotFeed: MarketSnapshotService,
    private readonly config: MarketConfigService,
    private readonly cache: MarketCache,
    private readonly allowlist: QuoteAllowlistService,
    private readonly market: MarketService,
    private readonly holidays: HolidaysService,
    private readonly directory: CompanyDirectoryService,
    private readonly ipo: IpoService,
    private readonly clock: MarketClock,
  ) {}

  private holidaySet() {
    return this.holidays.getCachedHolidayDates();
  }

  /** The licence for this caller. */
  async rights(channel: Channel) {
    const source = await this.config.source();
    return {
      right: rightFor(channel, source),
      delayMinutes: source.delayMinutes,
      attribution: source.attribution,
    };
  }

  /** Every curated instrument, priced and labelled. */
  async snapshot(channel: Channel) {
    const { right, delayMinutes, attribution } = await this.rights(channel);
    const now = this.clock.now();
    const holidays = this.holidaySet();
    const instruments: DisplayQuote[] = [];
    for (const { inst, point, contract } of this.snapshotFeed.all()) {
      const shown = present({
        right,
        kind: inst.kind,
        open: sessionOpen(inst.exchange, new Date(now), holidays),
        now,
        current: point,
        delayed: this.snapshotFeed.delayed(inst.id, delayMinutes * 60_000, now),
        lastClose: lastSessionClose(inst.exchange, new Date(now), holidays),
      });
      if (!shown) continue;
      instruments.push({
        ...shown,
        asOf: iso(shown.asOf),
        ref: `${inst.exchange}:${inst.symbol}`,
        kind: inst.kind,
        exchange: inst.exchange,
        symbol: inst.symbol,
        name: inst.name,
        unit: inst.unit,
        contract,
        inTicker: inst.inTicker,
      });
    }
    return {
      right,
      delayMinutes,
      attribution,
      sessions: {
        equity: sessionOpen('NSE', new Date(now), holidays),
        commodity: sessionOpen('MCX', new Date(now), holidays),
        currency: sessionOpen('CDS', new Date(now), holidays),
      },
      generatedAt: iso(now),
      instruments,
    };
  }

  /** The site ticker: its settings and the instruments it shows. */
  async ticker(channel: Channel) {
    const [{ config }, snap] = await Promise.all([
      this.config.ticker(),
      this.snapshot(channel),
    ]);
    return tickerView(config, snap);
  }

  /**
   * Quotes for "EX:SYMBOL" refs: curated instruments from the live snapshot,
   * other listed stocks from a short-cached REST quote. The public may only
   * ask for stocks on the allowlist; editors' previews pass `anyStock`.
   */
  async quotes(
    channel: Channel,
    refs: string[],
    opts: { anyStock?: boolean } = {},
  ) {
    const snap = await this.snapshot(channel);
    const curated = new Map(snap.instruments.map((q) => [q.ref, q]));
    const found: DisplayQuote[] = [];
    const missing: string[] = [];
    const stocks: string[] = [];
    for (const ref of refs) {
      const hit = curated.get(ref);
      if (hit) found.push(hit);
      else if (ref.startsWith('NSE:') || ref.startsWith('BSE:'))
        stocks.push(ref);
      else missing.push(ref);
    }
    const allowed = opts.anyStock
      ? new Set(stocks)
      : await this.allowlist.allowed(stocks);
    for (const ref of stocks) if (!allowed.has(ref)) missing.push(ref);
    const wanted = stocks.filter((r) => allowed.has(r));
    if (wanted.length && snap.right !== 'OFF') {
      found.push(...(await this.stockQuotes(snap.right, wanted)));
    }
    const got = new Set(found.map((q) => q.ref));
    for (const ref of wanted) if (!got.has(ref)) missing.push(ref);
    return {
      right: snap.right,
      attribution: snap.attribution,
      generatedAt: snap.generatedAt,
      quotes: refs
        .map((r) => found.find((q) => q.ref === r))
        .filter((q): q is DisplayQuote => !!q),
      missing,
    };
  }

  /** Top gainers / losers by market-cap segment, or most traded. */
  movers(
    channel: Channel,
    type: 'gainers' | 'losers' | 'active',
    segment: 'largecap' | 'midcap' | 'smallcap',
    limit: number,
  ) {
    return this.liveList(
      channel,
      `movers:${type}:${segment}:${limit}`,
      30,
      async () => {
        if (type === 'active') {
          const res = await this.market.runScanner('volume', limit);
          return res.results.map((r) => this.row(r));
        }
        const res = await this.market.getMovers(segment, type, limit);
        return res.results.map((r) => this.row(r));
      },
    );
  }

  sectors(channel: Channel) {
    return this.liveList(channel, 'sectors', 30, async () => {
      const res = await this.market.getQuotes(
        SECTORS.map((s) => s.symbol),
        'NSE',
      );
      const bySymbol = new Map(
        res.quotes.map((q) => [q.symbol.toUpperCase(), q]),
      );
      return SECTORS.flatMap((s) => {
        const q = bySymbol.get(s.symbol);
        return q
          ? [{ ...this.row(q), name: s.name, ref: `NSE:${s.symbol}` }]
          : [];
      });
    });
  }

  heatmap(channel: Channel, index: string) {
    const set = constituentsFor(index);
    if (!set) throw new NotFoundException('No heatmap for that index.');
    return this.liveList(channel, `heatmap:${index}`, 30, async () => {
      const res = await this.market.getQuotes(
        set.members.map((m) => m.symbol),
        set.exchange,
      );
      const names = new Map(
        set.members.map((m) => [m.symbol.toUpperCase(), m.name]),
      );
      return res.quotes.map((q) => ({
        ...this.row(q),
        name: names.get(q.symbol.toUpperCase()) ?? q.symbol,
      }));
    });
  }

  /**
   * Candles for a chart. Intraday ranges need LIVE rights; with DELAYED or
   * EOD rights, daily ranges stop at the last completed session.
   */
  async chart(
    channel: Channel,
    ref: string,
    range: ChartRange,
    opts: { anyStock?: boolean } = {},
  ) {
    const { right, attribution } = await this.rights(channel);
    const [exchange, symbol] = ref.split(':') as [Exchange, string];
    const curated = this.snapshotFeed
      .all()
      .find((s) => `${s.inst.exchange}:${s.inst.symbol}` === ref);
    const isStock = exchange === 'NSE' || exchange === 'BSE';
    const ok =
      curated ||
      (isStock &&
        (opts.anyStock || (await this.allowlist.allowed([ref])).has(ref)));
    const empty = (reason: 'rights' | 'upstream') => ({
      available: false,
      reason,
      label: null,
      asOf: null,
      attribution,
      data: {
        ref,
        range,
        interval: null as string | null,
        candles: [] as Candle[],
      },
    });
    if (!ok)
      throw new NotFoundException('That instrument isn’t available here.');
    const spec = RANGE[range];
    if (right === 'OFF' || (right !== 'LIVE' && spec.interval !== 'ONE_DAY'))
      return empty('rights');

    const lookup = curated?.contract ?? symbol;
    const raw = await this.cache.get(
      `chart:${ref}:${range}`,
      CHART_TTL[range],
      async () => {
        try {
          const res = await this.market.getCandles(
            lookup,
            exchange,
            spec.interval,
            spec.hours,
          );
          return {
            interval: res.interval,
            candles: res.candles.map(toCandle).filter((c) => c.t > 0),
          };
        } catch {
          return null;
        }
      },
    );
    if (!raw || raw.candles.length === 0) return empty('upstream');
    let candles = raw.candles;
    if (spec.sessions) {
      // Keep the last N sessions (IST dates) of the intraday series.
      const days = [...new Set(candles.map((c) => istDate(c.t)))].slice(
        -spec.sessions,
      );
      candles = candles.filter((c) => days.includes(istDate(c.t)));
    }
    const now = this.clock.now();
    const holidays = this.holidaySet();
    const open = sessionOpen(exchange, new Date(now), holidays);
    if (right !== 'LIVE' && open) {
      // Today's candle is still forming: not an end-of-day value.
      const today = istDate(now);
      candles = candles.filter((c) => istDate(c.t) !== today);
    }
    const live = right === 'LIVE' && open;
    return {
      available: candles.length > 0,
      label: (live ? 'LIVE' : 'EOD') as DataLabel,
      asOf: iso(
        live ? now : lastSessionClose(exchange, new Date(now), holidays),
      ),
      attribution,
      data: { ref, range, interval: raw.interval, candles },
    };
  }

  /**
   * IPOs from the exchange's public pages. Listing prices need LIVE rights,
   * and so does the gain since listing, which is worked out from the price.
   */
  async ipos(channel: Channel) {
    const { right } = await this.rights(channel);
    const board = await this.cache.get('ipos', 600, () => this.ipo.getBoard());
    if (right === 'LIVE') return { ...board, attribution: 'IPO data: NSE' };
    return {
      ...board,
      attribution: 'IPO data: NSE',
      recentlyListed: board.recentlyListed.map((l) => ({
        ...l,
        ltp: null,
        dayChangePct: null,
        gainPct: null,
      })),
    };
  }

  /** A saved widget, for readers' apps that draw it from its config. */
  async widget(id: string) {
    const w = await this.prisma.marketWidget.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        version: true,
        config: true,
        updatedAt: true,
      },
    });
    if (!w) throw new NotFoundException('Widget not found.');
    return w;
  }

  // ── Internals ──────────────────────────────────────────────────────

  private async stockQuotes(
    right: MarketDataRight,
    refs: string[],
  ): Promise<DisplayQuote[]> {
    const now = this.clock.now();
    const holidays = this.holidaySet();
    const byExchange = new Map<Exchange, string[]>();
    for (const ref of refs) {
      const [ex, sym] = ref.split(':') as [Exchange, string];
      byExchange.set(ex, [...(byExchange.get(ex) ?? []), sym]);
    }
    const out: DisplayQuote[] = [];
    for (const [exchange, symbols] of byExchange) {
      const res = await this.cache.get(
        `stock:${exchange}:${[...symbols].sort().join(',')}`,
        15,
        async () => {
          try {
            return await this.market.getQuotes(symbols, exchange);
          } catch {
            return null;
          }
        },
      );
      if (!res) continue;
      const fetchedAt = Date.parse(res.fetchedAt);
      for (const q of res.quotes) {
        const point: PricePoint = {
          ltp: q.ltp ?? 0,
          open: q.open ?? 0,
          high: q.high ?? 0,
          low: q.low ?? 0,
          prevClose: q.close ?? 0,
          volume: 0,
          ts: fetchedAt,
        };
        const open = sessionOpen(exchange, new Date(now), holidays);
        // REST prices aren't sampled, so DELAYED rights get the last close.
        const shown = present({
          right: right === 'DELAYED' ? 'EOD' : right,
          kind: 'STOCK',
          open,
          now,
          current: open ? point : { ...point, ts: 0 },
          lastClose: lastSessionClose(exchange, new Date(now), holidays),
        });
        if (!shown) continue;
        out.push({
          ...shown,
          asOf: iso(shown.asOf),
          ref: `${exchange}:${q.symbol.toUpperCase()}`,
          kind: 'STOCK',
          exchange,
          symbol: q.symbol.toUpperCase(),
          name: this.directory.nameFor(q.symbol) ?? q.symbol,
          unit: null,
          contract: null,
          inTicker: false,
        });
      }
    }
    return out;
  }

  /** A list of live rows (movers, sectors, heatmap): LIVE rights only. */
  private async liveList(
    channel: Channel,
    key: string,
    ttl: number,
    load: () => Promise<ListRow[]>,
  ): Promise<Labelled<ListRow[]>> {
    const { right, attribution } = await this.rights(channel);
    if (right !== 'LIVE') {
      return {
        available: false,
        reason: 'rights',
        label: null,
        asOf: null,
        attribution,
        data: [],
      };
    }
    const now = this.clock.now();
    const holidays = this.holidaySet();
    const cached = await this.cache.get(key, ttl, async () => {
      try {
        return { at: this.clock.now(), rows: await load() };
      } catch {
        return null;
      }
    });
    if (!cached || cached.rows.length === 0) {
      return {
        available: false,
        reason: 'upstream',
        label: null,
        asOf: null,
        attribution,
        data: [],
      };
    }
    const open = sessionOpen('NSE', new Date(now), holidays);
    return {
      available: true,
      label: open ? 'LIVE' : 'EOD',
      asOf: iso(
        open ? cached.at : lastSessionClose('NSE', new Date(now), holidays),
      ),
      attribution,
      data: cached.rows,
    };
  }

  private row(q: {
    symbol: string;
    ltp: number | null;
    close: number | null;
    tradeVolume?: number | null;
  }): ListRow {
    const ltp = q.ltp ?? 0;
    const prev = q.close ?? 0;
    return {
      ref: `NSE:${q.symbol.toUpperCase()}`,
      symbol: q.symbol.toUpperCase(),
      name: this.directory.nameFor(q.symbol) ?? q.symbol,
      ltp,
      change: prev > 0 ? round2(ltp - prev) : null,
      changePct: prev > 0 ? round2(((ltp - prev) / prev) * 100) : null,
      ...(q.tradeVolume !== undefined ? { volume: q.tradeVolume } : {}),
    };
  }
}

export type MarketSnapshot = Awaited<ReturnType<MarketDataService['snapshot']>>;

/** The site ticker from its settings and a snapshot. */
export function tickerView(config: TickerConfig, snap: MarketSnapshot) {
  let items = snap.instruments.filter((i) => i.inTicker);
  const anyOpen =
    snap.sessions.equity || snap.sessions.commodity || snap.sessions.currency;
  if (!anyOpen && config.marketClosed === 'hide') items = [];
  return {
    config,
    attribution: snap.attribution,
    right: snap.right,
    delayMinutes: snap.delayMinutes,
    sessions: snap.sessions,
    generatedAt: snap.generatedAt,
    items: config.enabled ? items : [],
  };
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function toCandle(r: {
  t: string | number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}): Candle {
  const t = typeof r.t === 'number' ? r.t : Date.parse(r.t);
  return {
    t: Number.isFinite(t) ? t : 0,
    o: r.o,
    h: r.h,
    l: r.l,
    c: r.c,
    v: r.v,
  };
}

function istDate(ms: number): string {
  return new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
}
