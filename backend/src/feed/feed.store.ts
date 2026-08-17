import { Injectable } from '@nestjs/common';
import { MultiQuoteFetched } from '../smartapi/smartapi.types';
import { PublishedTick } from '../ticks/tick.types';
import { FeedQuote, ResolvedFeedInstrument } from './feed.types';

/**
 * A REST snapshot is up to a minute old, so it must never overwrite a price the
 * live tick feed just delivered. An instrument counts as "live" if it ticked
 * within this window; only the quiet ones get filled in from REST.
 */
const LIVE_TICK_WINDOW_MS = 5_000;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Keep the existing value unless the incoming one is a real price.
 *
 * Angel reports 0 for an index's open/high/low outside market hours, and the
 * REST reseed runs every minute — so without this guard the 15:31 refresh would
 * blank out the day's OHLC that users are still looking at, seconds after the
 * close. Prices for these ten instruments are never legitimately zero, so
 * treating 0 as "no data" is safe.
 */
const pick = (next: number | undefined, current: number): number =>
  next !== undefined && Number.isFinite(next) && next > 0
    ? round2(next)
    : current;

interface Slot {
  quote: FeedQuote;
  /** Wall-clock time we last applied a tick — not the exchange timestamp. */
  lastTickAt: number;
}

/**
 * Latest known state for every feed instrument, plus which of them changed
 * since the last flush.
 *
 * Holding one merged view here (rather than forwarding raw ticks) is what lets
 * a client connecting mid-session paint immediately, and lets the gateway
 * coalesce a burst of ticks into a single frame per broadcast window.
 */
@Injectable()
export class FeedStore {
  private readonly slots = new Map<string, Slot>();
  /** "{exchange}:{token}" → feed instrument id. */
  private readonly byToken = new Map<string, string>();
  private readonly dirty = new Set<string>();

  /** Install (or re-install, after a contract roll) the instrument set. */
  setInstruments(instruments: ResolvedFeedInstrument[]): void {
    this.byToken.clear();
    const keep = new Set<string>();

    for (const inst of instruments) {
      keep.add(inst.id);
      this.byToken.set(`${inst.exchange}:${inst.token}`, inst.id);

      const existing = this.slots.get(inst.id);
      if (existing) {
        // A roll changes the contract, not the price the client is already
        // showing — update the metadata in place and keep the tile populated.
        existing.quote.contract =
          inst.kind === 'commodity' ? inst.tradingSymbol : null;
        existing.quote.expiry = inst.kind === 'commodity' ? inst.expiry : null;
        continue;
      }
      this.slots.set(inst.id, {
        lastTickAt: 0,
        quote: {
          id: inst.id,
          name: inst.name,
          kind: inst.kind,
          exchange: inst.exchange,
          ltp: 0,
          open: 0,
          high: 0,
          low: 0,
          prevClose: 0,
          change: 0,
          changePct: 0,
          volume: 0,
          unit: inst.unit ?? null,
          contract: inst.kind === 'commodity' ? inst.tradingSymbol : null,
          expiry: inst.kind === 'commodity' ? inst.expiry : null,
          ts: 0,
        },
      });
    }

    for (const id of [...this.slots.keys()]) {
      if (!keep.has(id)) {
        this.slots.delete(id);
        this.dirty.delete(id);
      }
    }
  }

  /** Does this tick belong to the feed universe? Cheap pre-filter. */
  tracks(exchange: string, token: string): boolean {
    return this.byToken.has(`${exchange}:${token}`);
  }

  applyTick(tick: PublishedTick): void {
    const id = this.byToken.get(`${tick.exchange}:${tick.token}`);
    if (!id) return;
    const slot = this.slots.get(id);
    if (!slot) return;

    // Angel occasionally emits a zero-price packet around session boundaries;
    // publishing it would flash a ₹0 tile in the app.
    const ltp = round2(tick.ltp);
    if (!Number.isFinite(ltp) || ltp <= 0) return;

    slot.lastTickAt = Date.now();
    const q = slot.quote;
    this.commit(id, q, {
      ltp,
      open: pick(tick.open, q.open),
      high: pick(tick.high, q.high),
      low: pick(tick.low, q.low),
      prevClose: pick(tick.close, q.prevClose),
      volume: tick.volume ?? q.volume,
      ts: tick.ts > 0 ? tick.ts : Date.now(),
    });
  }

  /** Fold in a REST snapshot, leaving genuinely live instruments untouched. */
  applySnapshot(rows: MultiQuoteFetched[]): void {
    const now = Date.now();
    for (const row of rows) {
      const id = this.byToken.get(`${row.exchange}:${row.symbolToken}`);
      if (!id) continue;
      const slot = this.slots.get(id);
      if (!slot) continue;
      if (now - slot.lastTickAt < LIVE_TICK_WINDOW_MS) continue;
      if (!Number.isFinite(row.ltp) || row.ltp <= 0) continue;

      const q = slot.quote;
      this.commit(id, q, {
        ltp: round2(row.ltp),
        open: pick(row.open, q.open),
        high: pick(row.high, q.high),
        low: pick(row.low, q.low),
        prevClose: pick(row.close, q.prevClose),
        volume: row.tradeVolume ?? q.volume,
        // REST carries no exchange timestamp; keep whatever the last tick set
        // so `ts` always means "when the exchange last moved this price".
        ts: q.ts,
      });
    }
  }

  private commit(
    id: string,
    q: FeedQuote,
    next: {
      ltp: number;
      open: number;
      high: number;
      low: number;
      prevClose: number;
      volume: number;
      ts: number;
    },
  ): void {
    // Only flag a change when something a user would actually see moved: an
    // identical repeat costs bandwidth and battery for no visible benefit.
    const same =
      q.ltp === next.ltp &&
      q.open === next.open &&
      q.high === next.high &&
      q.low === next.low &&
      q.prevClose === next.prevClose &&
      q.volume === next.volume;

    q.ltp = next.ltp;
    q.open = next.open;
    q.high = next.high;
    q.low = next.low;
    q.prevClose = next.prevClose;
    q.volume = next.volume;
    q.change = next.prevClose > 0 ? round2(next.ltp - next.prevClose) : 0;
    q.changePct =
      next.prevClose > 0
        ? round2(((next.ltp - next.prevClose) / next.prevClose) * 100)
        : 0;
    if (next.ts > 0) q.ts = next.ts;

    if (!same) this.dirty.add(id);
  }

  /** Every instrument, including any that has not priced yet. */
  snapshot(): FeedQuote[] {
    return [...this.slots.values()].map((s) => s.quote);
  }

  /** Instruments changed since the previous call; clears the change set. */
  drainDirty(): FeedQuote[] {
    if (this.dirty.size === 0) return [];
    const out: FeedQuote[] = [];
    for (const id of this.dirty) {
      const slot = this.slots.get(id);
      if (slot) out.push(slot.quote);
    }
    this.dirty.clear();
    return out;
  }

  /** Tokens grouped by exchange, for one batched REST snapshot call. */
  tokenGroups(): Record<string, string[]> {
    const groups: Record<string, string[]> = {};
    for (const key of this.byToken.keys()) {
      const sep = key.indexOf(':');
      const exchange = key.slice(0, sep);
      (groups[exchange] ??= []).push(key.slice(sep + 1));
    }
    return groups;
  }

  /** How many instruments carry a usable price. */
  pricedCount(): number {
    let n = 0;
    for (const slot of this.slots.values()) if (slot.quote.ltp > 0) n++;
    return n;
  }

  size(): number {
    return this.slots.size;
  }
}
