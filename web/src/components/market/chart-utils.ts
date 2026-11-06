import type { ChartRange } from '@/market/paths';
import type { Candle } from '@/market/types';

/**
 * Pure helpers shared by MiniChart and PriceChart. No 'use client', no
 * clock: every date comes from the payload (spec §7.0 rule 5), so server
 * and browser print the same text.
 */

const DAY_MS = 86_400_000;

/**
 * The window the API asks the broker for, per range, in days
 * (backend market-data.service.ts RANGE: 1M = 35, 6M = 190, 1Y = 370 days;
 * an index's short ranges are widened to 90 days by market.service.ts).
 */
const WINDOW_DAYS: Record<ChartRange, number> = {
  '1D': 1,
  '5D': 5,
  '1M': 35,
  '6M': 190,
  '1Y': 370,
};

/** The short-history rule's slack: a first candle up to 7 days late is normal (spec §4.10). */
const SLACK_MS = 7 * DAY_MS;

export const isIntraday = (r: ChartRange) => r === '1D' || r === '5D';

/** Where `range` starts for a series that ends at `endMs`. */
export function rangeStart(range: ChartRange, endMs: number, index: boolean): number {
  const days = index && range === '1M' ? 90 : WINDOW_DAYS[range];
  return endMs - days * DAY_MS;
}

/** The series' end: the payload's asOf, else its last candle. */
export function seriesEnd(candles: Candle[], asOf: string | null | undefined): number {
  const t = asOf ? Date.parse(asOf) : NaN;
  return Number.isFinite(t) ? t : (candles[candles.length - 1]?.t ?? 0);
}

/**
 * The first candle's time when it starts more than 7 days after the
 * range's start (a young futures contract, a recent listing or a gap in
 * the source; spec §4.10 short-history rule), else null.
 */
export function shortSince(
  candles: Candle[],
  range: ChartRange,
  asOf: string | null | undefined,
  index: boolean,
): number | null {
  if (!candles.length || isIntraday(range)) return null;
  const start = rangeStart(range, seriesEnd(candles, asOf), index);
  const first = candles[0].t;
  return first - start > SLACK_MS ? first : null;
}

const DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "2 Jul 2026" (IST) for a candle time in ms. */
export function fmtDay(ms: number): string {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : DAY.format(d);
}

/** The change from the first close to the last, in %. */
export function seriesPct(candles: Candle[]): number | null {
  if (candles.length < 2) return null;
  const a = candles[0].c;
  const b = candles[candles.length - 1].c;
  return a ? ((b - a) / a) * 100 : null;
}
