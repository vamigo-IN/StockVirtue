/**
 * The canonical market addresses (spec §7.0 rule 1). The site's
 * /api/market/* proxy and the API both cache by exact address, so every
 * caller, on the server and in the browser, builds its address here: two
 * spellings of one request would be two cache keys, and behind them two
 * broker calls.
 *
 * Each function returns the path below /api/market/ ("quotes?symbols=…"),
 * which is what `useMarket(path)` takes and what the server helpers in
 * ./server.ts append to the API's /market/. `marketUrl()` adds the proxy
 * prefix for a plain fetch from the browser.
 *
 * Callers that show fewer rows slice the answer. They never ask for a
 * smaller `limit`, which would be another cache key and another broker call.
 */

/** The API's cap on refs per quotes request. */
export const MAX_QUOTE_REFS = 20;
/** Every movers request asks for this many rows. */
export const MOVERS_LIMIT = 10;

export type ChartRange = '1D' | '5D' | '1M' | '6M' | '1Y';
export type HeatmapIndex = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
export type CapSegment = 'largecap' | 'midcap' | 'smallcap';
export type MoversType = 'gainers' | 'losers' | 'active';
export type OptionUnderlying = 'NIFTY' | 'BANKNIFTY';

/**
 * Refs as one canonical set: trimmed, upper case, each once, sorted
 * ascending (plain code-point order, the same on every machine), at most 20.
 * A caller with more than 20 shows the first 20 of this order.
 */
export function canonicalRefs(refs: readonly string[]): string[] {
  const set = new Set<string>();
  for (const r of refs) {
    const ref = r.trim().toUpperCase();
    if (ref) set.add(ref);
  }
  return [...set].sort().slice(0, MAX_QUOTE_REFS);
}

export const marketPath = {
  snapshot: (): string => 'snapshot',
  ticker: (): string => 'ticker',
  sectors: (): string => 'sectors',
  ipos: (): string => 'ipos',

  /** `quotes?symbols=A,B` for the sorted set (null when there is nothing to ask). */
  quotes(refs: readonly string[]): string | null {
    const list = canonicalRefs(refs);
    return list.length
      ? `quotes?symbols=${encodeURIComponent(list.join(','))}`
      : null;
  },

  /**
   * Movers, always `limit=10`. Most active is always
   * `movers?type=active&segment=largecap&limit=10`: the API ranks it across
   * all three tracked lists whatever the segment, so one key serves every
   * caller.
   */
  movers(type: MoversType, segment: CapSegment = 'largecap'): string {
    const seg = type === 'active' ? 'largecap' : segment;
    return `movers?type=${type}&segment=${seg}&limit=${MOVERS_LIMIT}`;
  },

  heatmap(index: HeatmapIndex): string {
    return `heatmap?index=${index}`;
  },

  /** The home page's small option chain (server only; LIVE licence). */
  optionChain(underlying: OptionUnderlying): string {
    return `option-chain?underlying=${underlying}`;
  },

  /** The home page's worked contract note for a curated stock (server only). */
  contractNote(ref: string): string {
    return `contract-note?symbol=${encodeURIComponent(ref.trim().toUpperCase())}`;
  },

  /** `chart?symbol=EX:SYM&range=…` (the ref trimmed and upper-cased). */
  chart(ref: string, range: ChartRange): string {
    return `chart?symbol=${encodeURIComponent(ref.trim().toUpperCase())}&range=${range}`;
  },
} as const;

/** The site's own proxy address for a market path, for a browser fetch. */
export function marketUrl(path: string): string {
  return `/api/market/${path}`;
}
