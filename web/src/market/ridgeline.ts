import 'server-only';
import { isVolatilityIndex } from '@/components/market/gate';
import {
  istDate,
  resolveRidges,
  tipOf,
  type RidgeData,
  type RidgeSeries,
} from '@/components/home/ridgeline/model';
import { getChart, getSnapshot } from './server';

export type {
  RidgeData,
  RidgeSeries,
  RidgeTip,
} from '@/components/home/ridgeline/model';

/**
 * The home Ridgeline's data (spec §6.4.2, §7.2): a year of daily closes for
 * up to six curated indices, on one shared session calendar, with each
 * index's live tip from the snapshot.
 *
 * - The indices are the snapshot's INDEX rows in portal order, without any
 *   volatility index (/VIX/), at most six. getSnapshot() is the same request
 *   as the page's own call, so Next memoizes it and the page's parallel
 *   fetches stay parallel.
 * - Each index's chart is getChart(ref, '1Y'): daily candles, cached 3,600 s,
 *   3 s timeout during `next build` and 5 s at run time, null on failure
 *   (spec §7.11). Never more than six charts, once an hour (§7.12).
 * - The window is the last twelve months, ending at the latest session any
 *   index has: from the same date a year earlier. A series qualifies when
 *   its chart is available, it has at least 200 sessions in the window, and
 *   its first close falls within 5 days of the window's first date, so the
 *   caption's "each starting at 0% on {date}" is true for every drawn line.
 * - The calendar is the union of the qualifying series' IST session dates.
 *   A series with no session on a date has null there (drawn flat at its
 *   previous close).
 * - `scale` (A) is computed with the tips applied (resolveRidges), the same
 *   rule the browser re-applies when live tips arrive.
 *
 * Returns null when the site-prices gate is off (no fetch at all), the
 * snapshot is missing or its licence is OFF, or fewer than two series
 * qualify. The page then shows the type-led hero (§5.1.4, §6.4.10).
 */

const MAX_SERIES = 6;
const MIN_SESSIONS = 200;
const START_SLACK_DAYS = 5;

/** IST calendar date (YYYY-MM-DD) of a candle's ms timestamp. */
function istDay(ms: number): string {
  return Number.isFinite(ms) ? istDate(new Date(ms).toISOString()) : '';
}

/** YYYY-MM-DD shifted by whole days. */
function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** The same calendar date a year earlier (29 Feb → 28 Feb). */
function yearBefore(ymd: string): string {
  const y = Number(ymd.slice(0, 4)) - 1;
  const md = ymd.slice(5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return `${y}-${md === '02-29' && !leap ? '02-28' : md}`;
}

export async function getRidgeline(gateOn: boolean): Promise<RidgeData | null> {
  if (!gateOn) return null;
  const snapshot = await getSnapshot();
  if (!snapshot || snapshot.right === 'OFF') return null;

  const indices = snapshot.instruments
    .filter((q) => q.kind === 'INDEX' && !isVolatilityIndex(q.ref))
    .slice(0, MAX_SERIES);
  if (indices.length < 2) return null;

  const charts = await Promise.all(indices.map((q) => getChart(q.ref, '1Y')));

  const closesByDay = charts.map((chart) => {
    if (!chart?.available || !chart.data?.candles?.length) return null;
    const byDay = new Map<string, number>();
    for (const c of chart.data.candles) {
      const day = istDay(c.t);
      if (day && Number.isFinite(c.c) && c.c > 0) byDay.set(day, c.c);
    }
    return byDay.size ? byDay : null;
  });

  let latest = '';
  for (const byDay of closesByDay) {
    if (!byDay) continue;
    for (const day of byDay.keys()) if (day > latest) latest = day;
  }
  if (!latest) return null;
  const start = yearBefore(latest);
  const lastStart = addDays(start, START_SLACK_DAYS);

  const qualifying: { i: number; byDay: Map<string, number>; days: string[] }[] = [];
  closesByDay.forEach((byDay, i) => {
    if (!byDay) return;
    const days = [...byDay.keys()].filter((d) => d >= start && d <= latest).sort();
    if (days.length >= MIN_SESSIONS && days[0] <= lastStart) {
      qualifying.push({ i, byDay, days });
    }
  });
  if (qualifying.length < 2) return null;

  const calendar = [...new Set(qualifying.flatMap((q) => q.days))].sort();
  const series: RidgeSeries[] = qualifying.map(({ i, byDay }) => ({
    ref: indices[i].ref,
    name: indices[i].name,
    closes: calendar.map((d) => byDay.get(d) ?? null),
    tip: tipOf(indices[i]),
  }));

  const data: RidgeData = {
    right: snapshot.right,
    delayMinutes: snapshot.delayMinutes,
    attribution: snapshot.attribution,
    dates: calendar,
    scale: 15,
    series,
  };
  data.scale = resolveRidges(data).scale;
  return data;
}
