import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketInstrumentKind } from '@prisma/client';
import { Exchange, isExchange } from '../common/exchange';
import { AppConfig } from '../config/configuration';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';
import { MultiQuoteFetched } from '../smartapi/smartapi.types';
import { SmartApiWsService } from '../ticks/smartapi-ws.service';
import { TickBusService } from '../ticks/tick-bus.service';
import { PublishedTick } from '../ticks/tick.types';
import { PricePoint } from './data-rights';
import { MarketClock } from './market-clock';

/// A price sample is kept this often, for DELAYED display…
const SAMPLE_EVERY_MS = 30_000;
/// …for this long (the longest allowed delay is 60 minutes).
const KEEP_SAMPLES_MS = 70 * 60_000;
const REST_EVERY_MS = 20_000;
const PERSIST_EVERY_MS = 60_000;
const RESOLVE_EVERY_MS = 10 * 60_000;
const RESOLVE_RETRY_MS = 15_000;
/// An instrument that ticked this recently is left to the live feed.
const LIVE_TICK_WINDOW_MS = 60_000;
/// One multi-quote request carries at most this many tokens.
const QUOTE_BATCH = 50;
/// INR currency pairs trade in this band; anything else is a unit mix-up.
const CURRENCY_BAND = { min: 0.05, max: 1000 };

export interface CuratedInstrument {
  id: string;
  kind: MarketInstrumentKind;
  exchange: string;
  symbol: string;
  name: string;
  unit: string | null;
  position: number;
  inTicker: boolean;
}

interface Slot {
  inst: CuratedInstrument;
  token: string | null;
  /** Front-month contract for commodities and currencies. */
  contract: string | null;
  point: PricePoint | null;
  lastTickAt: number;
  samples: { at: number; point: PricePoint }[];
  dirty: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pick = (next: number | undefined, prev: number) =>
  next !== undefined && Number.isFinite(next) && next > 0 ? next : prev;

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Angel's "21-Nov-2025 15:29:59" (IST) → ms epoch; 0 if absent. */
export function parseFeedTime(raw: unknown): number {
  const m =
    typeof raw === 'string'
      ? /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw)
      : null;
  if (!m || !(m[2] in MONTHS)) return 0;
  const utc = Date.UTC(
    Number(m[3]),
    MONTHS[m[2]],
    Number(m[1]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
  );
  return utc - 330 * 60_000;
}

/**
 * Live prices for the curated instruments (the ticker and market widgets).
 * Like the FinCalc feed, it subscribes the curated list ONCE on the broker
 * WebSocket the trading app already runs, tops up from REST within the
 * SmartAPI limits, keeps 30-second samples for delayed display, and stores
 * the last price so it survives restarts. Runs in the API process only.
 */
@Injectable()
export class MarketSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketSnapshotService.name);
  private readonly slots = new Map<string, Slot>();
  private readonly byToken = new Map<string, string>();
  private readonly timers: NodeJS.Timeout[] = [];
  private retry: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private subscribed = new Set<string>();
  private destroyed = false;
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    private readonly upstream: SmartApiWsService,
    private readonly bus: TickBusService,
    private readonly smartapi: SmartApiService,
    private readonly clock: MarketClock,
  ) {
    this.enabled = config.get('marketDisplay', { infer: true }).enabled;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'Market display feed disabled (MARKET_DISPLAY_ENABLED=false)',
      );
      return;
    }
    this.unsubscribe = this.bus.onTick((t) => this.applyTick(t));
    const every = (fn: () => Promise<void>, ms: number) => {
      const t = setInterval(() => void fn(), ms);
      t.unref();
      this.timers.push(t);
    };
    every(() => this.refreshRest(), REST_EVERY_MS);
    every(() => this.persist(), PERSIST_EVERY_MS);
    every(() => this.reload(), RESOLVE_EVERY_MS);
    void this.reload();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.unsubscribe?.();
    this.timers.forEach(clearInterval);
    if (this.retry) clearTimeout(this.retry);
    await this.persist().catch(() => undefined);
    for (const key of this.subscribed) {
      const [exchange, token] = key.split(':');
      await this.upstream
        .removeRef(exchange as Exchange, token)
        .catch(() => undefined);
    }
    this.subscribed.clear();
  }

  /** Every enabled curated instrument with its latest price (null = not priced). */
  all(): {
    inst: CuratedInstrument;
    point: PricePoint | null;
    contract: string | null;
  }[] {
    return [...this.slots.values()]
      .sort((a, b) => a.inst.position - b.inst.position)
      .map((s) => ({ inst: s.inst, point: s.point, contract: s.contract }));
  }

  /** The price as it stood `delayMs` ago, from the 30-second samples. */
  delayed(
    id: string,
    delayMs: number,
    now = this.clock.now(),
  ): PricePoint | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const cutoff = now - delayMs;
    for (let i = slot.samples.length - 1; i >= 0; i--) {
      if (slot.samples[i].at <= cutoff) return slot.samples[i].point;
    }
    return null;
  }

  /**
   * Re-reads the curated list and reconciles token resolution and the live
   * subscription. Called on boot, on a timer (front-month contracts roll) and
   * whenever the list is edited.
   */
  async reload(): Promise<void> {
    if (!this.enabled || this.destroyed) return;
    const rows = await this.prisma.marketInstrument.findMany({
      where: { isEnabled: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { quote: true },
    });
    const keep = new Set(rows.map((r) => r.id));
    for (const id of [...this.slots.keys()]) {
      if (!keep.has(id)) this.slots.delete(id);
    }
    for (const r of rows) {
      const inst: CuratedInstrument = {
        id: r.id,
        kind: r.kind,
        exchange: r.exchange,
        symbol: r.symbol,
        name: r.name,
        unit: r.unit,
        position: r.position,
        inTicker: r.inTicker,
      };
      const slot = this.slots.get(r.id);
      if (slot) {
        slot.inst = inst;
        continue;
      }
      this.slots.set(r.id, {
        inst,
        token: null,
        contract: null,
        point: r.quote
          ? {
              ltp: r.quote.ltp,
              open: r.quote.open,
              high: r.quote.high,
              low: r.quote.low,
              prevClose: r.quote.prevClose,
              volume: r.quote.volume,
              ts: r.quote.asOf.getTime(),
            }
          : null,
        lastTickAt: 0,
        samples: [],
        dirty: false,
      });
    }
    if (!this.scripMaster.isReady()) {
      // The scrip master downloads on its own boot; resolve once it's in.
      if (!this.retry) {
        this.retry = setTimeout(() => {
          this.retry = null;
          void this.reload();
        }, RESOLVE_RETRY_MS);
        this.retry.unref();
      }
      return;
    }
    await this.resolve();
    await this.refreshRest(true);
  }

  private async resolve(): Promise<void> {
    this.byToken.clear();
    const wanted = new Set<string>();
    for (const slot of this.slots.values()) {
      const { kind, exchange, symbol } = slot.inst;
      if (!isExchange(exchange)) continue;
      const inst =
        kind === 'COMMODITY' || kind === 'CURRENCY'
          ? this.scripMaster.getNearestFuture(symbol, exchange, 2)
          : kind === 'STOCK'
            ? this.scripMaster.getEquity(symbol, exchange)
            : this.scripMaster.getInstrument(symbol, exchange);
      if (!inst) {
        this.logger.warn(
          `Curated instrument ${exchange}:${symbol} isn't in the scrip master`,
        );
        slot.token = null;
        continue;
      }
      slot.token = inst.token;
      slot.contract =
        kind === 'COMMODITY' || kind === 'CURRENCY' ? inst.symbol : null;
      this.byToken.set(`${exchange}:${inst.token}`, slot.inst.id);
      // Currency ticks use a different price scale on the socket than the
      // parser assumes, so currencies are priced from REST only.
      if (kind !== 'CURRENCY') wanted.add(`${exchange}:${inst.token}`);
    }
    for (const key of this.subscribed) {
      if (wanted.has(key)) continue;
      const [exchange, token] = key.split(':');
      await this.upstream.removeRef(exchange as Exchange, token);
      this.subscribed.delete(key);
    }
    for (const key of wanted) {
      if (this.subscribed.has(key)) continue;
      const [exchange, token] = key.split(':');
      await this.upstream.addRef(exchange as Exchange, token);
      this.subscribed.add(key);
    }
  }

  private applyTick(tick: PublishedTick): void {
    const id = this.byToken.get(`${tick.exchange}:${tick.token}`);
    const slot = id ? this.slots.get(id) : undefined;
    if (!slot || slot.inst.kind === 'CURRENCY') return;
    const ltp = round2(tick.ltp);
    // Angel sometimes sends a zero price around session boundaries.
    if (!Number.isFinite(ltp) || ltp <= 0) return;
    slot.lastTickAt = this.clock.now();
    const prev = slot.point;
    this.commit(slot, {
      ltp,
      open: pick(tick.open, prev?.open ?? 0),
      high: pick(tick.high, prev?.high ?? 0),
      low: pick(tick.low, prev?.low ?? 0),
      prevClose: pick(tick.close, prev?.prevClose ?? 0),
      volume: tick.volume ?? prev?.volume ?? 0,
      ts: tick.ts > 0 ? tick.ts : this.clock.now(),
    });
  }

  /** Prices from REST for anything the live feed isn't covering right now. */
  private async refreshRest(force = false): Promise<void> {
    if (!this.enabled || this.destroyed) return;
    const now = this.clock.now();
    const due = [...this.slots.values()].filter(
      (s) => s.token && (force || now - s.lastTickAt > LIVE_TICK_WINDOW_MS),
    );
    for (let i = 0; i < due.length; i += QUOTE_BATCH) {
      const groups: Record<string, string[]> = {};
      for (const s of due.slice(i, i + QUOTE_BATCH)) {
        (groups[s.inst.exchange] ??= []).push(s.token!);
      }
      let rows: MultiQuoteFetched[];
      try {
        rows = await this.smartapi.getMultiQuote(groups, 'FULL');
      } catch (err) {
        // The live feed and the stored last prices cover the gap.
        this.logger.debug(
          `Market display REST refresh failed: ${(err as Error).message}`,
        );
        return;
      }
      for (const row of rows) this.applyRest(row);
    }
  }

  private applyRest(row: MultiQuoteFetched): void {
    const id = this.byToken.get(`${row.exchange}:${row.symbolToken}`);
    const slot = id ? this.slots.get(id) : undefined;
    if (!slot || !(row.ltp > 0)) return;
    if (
      slot.inst.kind === 'CURRENCY' &&
      (row.ltp < CURRENCY_BAND.min || row.ltp > CURRENCY_BAND.max)
    ) {
      return;
    }
    if (this.clock.now() - slot.lastTickAt < LIVE_TICK_WINDOW_MS) return;
    const prev = slot.point;
    const feedTime = parseFeedTime(
      (row as MultiQuoteFetched & { exchFeedTime?: string }).exchFeedTime,
    );
    this.commit(slot, {
      ltp: slot.inst.kind === 'CURRENCY' ? row.ltp : round2(row.ltp),
      open: pick(row.open, prev?.open ?? 0),
      high: pick(row.high, prev?.high ?? 0),
      low: pick(row.low, prev?.low ?? 0),
      prevClose: pick(row.close, prev?.prevClose ?? 0),
      volume: row.tradeVolume ?? prev?.volume ?? 0,
      // REST may carry the exchange's own time; otherwise the price is as of
      // now when it moved, and keeps its old time when it didn't.
      ts:
        feedTime ||
        (prev && prev.ltp === row.ltp && prev.ts > 0
          ? prev.ts
          : this.clock.now()),
    });
  }

  private commit(slot: Slot, next: PricePoint): void {
    slot.point = next;
    slot.dirty = true;
    const now = this.clock.now();
    const last = slot.samples[slot.samples.length - 1];
    if (!last || now - last.at >= SAMPLE_EVERY_MS) {
      slot.samples.push({ at: now, point: { ...next } });
      while (
        slot.samples.length &&
        now - slot.samples[0].at > KEEP_SAMPLES_MS
      ) {
        slot.samples.shift();
      }
    }
  }

  /** Stores the latest prices, so a restart still has something to show. */
  private async persist(): Promise<void> {
    const dirty = [...this.slots.values()].filter((s) => s.dirty && s.point);
    for (const s of dirty) {
      const p = s.point!;
      const change = p.prevClose > 0 ? p.ltp - p.prevClose : 0;
      const data = {
        ltp: p.ltp,
        open: p.open,
        high: p.high,
        low: p.low,
        prevClose: p.prevClose,
        change,
        changePct: p.prevClose > 0 ? (change / p.prevClose) * 100 : 0,
        volume: p.volume,
        asOf: new Date(p.ts > 0 ? p.ts : this.clock.now()),
      };
      try {
        await this.prisma.marketQuote.upsert({
          where: { instrumentId: s.inst.id },
          create: { instrumentId: s.inst.id, ...data },
          update: data,
        });
        s.dirty = false;
      } catch (err) {
        // The instrument may have just been removed; try again next round.
        this.logger.debug(
          `Couldn't store ${s.inst.symbol}: ${(err as Error).message}`,
        );
      }
    }
  }
}
