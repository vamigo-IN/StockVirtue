import 'server-only';
import { API_V1 } from '@/portal/backend';
import { marketPath, type ChartRange } from './paths';
import type {
  ChartData,
  IpoBoard,
  QuotesData,
  Snapshot,
  TickerData,
} from './types';

/**
 * Market data for server-rendered pages (spec §7.11). Every helper has one
 * shape:
 * - it asks the API with the website's key, through Next's data cache
 *   (`revalidate` per helper, tag "market", which the API's refresh call
 *   clears whenever market settings change), at the canonical address from
 *   ./paths.ts;
 * - it fetches during `next build` too, with a 3 s timeout there and 5 s at
 *   run time, so the first HTML after a deploy has data whenever the API is
 *   up, and a build with the API down still finishes quickly;
 * - it returns null on any failure (network error, timeout, non-2xx, or an
 *   answer that is unavailable for a reason other than the licence) and
 *   never throws. A licence answer (`reason: 'rights'`) is returned as is,
 *   because modules show the licence state.
 *
 * No sticky failures: Next's data cache keeps any 200, and a broker failure
 * reaches us as a 200 saying `available: false` (`reason: 'upstream'` on
 * lists and charts). When the cached answer says so, the helper asks once
 * more as a separate cache entry that lives at most 60 s, and returns null
 * if that is unavailable too; so the website never holds a failure for the
 * fetch's whole revalidate (an hour for daily charts). The retry is NOT
 * `cache: 'no-store'`: a no-store fetch during a static or ISR render turns
 * the page dynamic (Next 15), which would break the pages' render modes.
 */

const REVALIDATE = { ticker: 15, snapshot: 15, quotes: 15, ipos: 300 } as const;

/** Seconds a chart is reused, per range (the API's own chart TTLs). */
const CHART_REVALIDATE: Record<ChartRange, number> = {
  '1D': 60,
  '5D': 300,
  '1M': 1800,
  '6M': 3600,
  '1Y': 3600,
};

/** The retry entry for an upstream failure lives at most this long. */
const RETRY_REVALIDATE = 60;

const timeoutMs = () =>
  process.env.NEXT_PHASE === 'phase-production-build' ? 3_000 : 5_000;

async function fetchMarket<T>(
  path: string,
  revalidate: number,
  retry = false,
): Promise<T | null> {
  try {
    const res = await fetch(`${API_V1}/market/${path}`, {
      headers: {
        accept: 'application/json',
        'x-site-admin-key': process.env.SITE_ADMIN_KEY ?? '',
        // A different header is a different cache entry (Next keys fetches
        // by URL and headers), so the retry never reuses the failed answer.
        ...(retry ? { 'x-sv-retry': '1' } : {}),
      },
      next: { revalidate, tags: ['market'] },
      signal: AbortSignal.timeout(timeoutMs()),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Unavailable for a reason other than the licence (upstream, or none given). */
function failed(body: unknown): boolean {
  if (!body || typeof body !== 'object') return true;
  const b = body as { available?: unknown; reason?: unknown };
  return b.available === false && b.reason !== 'rights';
}

/** As fetchMarket, plus the one retry for an upstream failure (above). */
async function fetchMarketRetrying<T>(
  path: string,
  revalidate: number,
): Promise<T | null> {
  const first = await fetchMarket<T>(path, revalidate);
  if (first === null || !failed(first)) return first;
  const again = await fetchMarket<T>(
    path,
    Math.min(revalidate, RETRY_REVALIDATE),
    true,
  );
  return again === null || failed(again) ? null : again;
}

/**
 * The site ticker's settings and prices, shared by every reader for 15 s.
 * Null when the API can't be reached: the ticker hides, and the site-prices
 * gate is off for that render.
 */
export function getTicker(): Promise<TickerData | null> {
  return fetchMarket<TickerData>(marketPath.ticker(), REVALIDATE.ticker);
}

/**
 * Every curated instrument, priced and labelled (15 s): the starting value
 * of every streamed module, which then renders `live.data ?? initial`.
 */
export function getSnapshot(): Promise<Snapshot | null> {
  return fetchMarket<Snapshot>(marketPath.snapshot(), REVALIDATE.snapshot);
}

/**
 * One instrument's chart for a range, cached as long as the API keeps it
 * (1D 60 s, 5D 300 s, 1M 1,800 s, 6M and 1Y 3,600 s). Server renders ask
 * only for bounded sets (spec §7.12 rule 3): the Ridgeline's daily charts
 * and Nifty 50 6M. Never a chart on a story or stock page.
 */
export function getChart(
  ref: string,
  range: ChartRange,
): Promise<ChartData | null> {
  return fetchMarketRetrying<ChartData>(
    marketPath.chart(ref, range),
    CHART_REVALIDATE[range],
  );
}

/**
 * Quotes for a set of refs (sorted, at most 20; 15 s). Its one caller is a
 * quotable stock page asking for its own stock (spec §7.7); every other
 * non-curated quote loads in the browser, in view.
 */
export function getQuotes(refs: string[]): Promise<QuotesData | null> {
  const path = marketPath.quotes(refs);
  return path
    ? fetchMarket<QuotesData>(path, REVALIDATE.quotes)
    : Promise.resolve(null);
}

/** The IPO board (300 s). Null when NSE's pages couldn't be read. */
export function getIpos(): Promise<IpoBoard | null> {
  return fetchMarketRetrying<IpoBoard>(marketPath.ipos(), REVALIDATE.ipos);
}
