import { isVolatilityIndex } from '@/components/market/gate';
import { istDate, type RidgeData } from '@/components/home/ridgeline/model';
import type { DataLabel, MarketQuote, Snapshot } from '@/market/types';

/**
 * The hero desk's data (Emerald Terminal home, 6 Nov 2026). Pure: no React,
 * no clock, no fetch. Two shapes:
 * - `realDesk()`: with the site-prices gate on and data present, the chart is
 *   a year of real daily closes (the Ridgeline's Nifty 50 series, with the
 *   snapshot's tip) and the watchlist real snapshot rows. The order ticket is
 *   an example derived from the first watchlist price, and the positions are
 *   a sample: both are labelled as such where they are drawn.
 * - `SAMPLE_DESK`: everything static and obviously sample (round numbers).
 */

/** The chart's viewBox and plot area (px in the 440 × 220 box). */
export const CHART = { w: 440, h: 220, right: 384, top: 10, bottom: 190 } as const;

export type ChartModel = {
  /** The close line and the filled area under it. */
  line: string;
  area: string;
  grid: { y: number; label: string }[];
  xLabels: { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[];
  /** The last value's tag on the right axis. */
  last: { y: number; label: string };
  up: boolean;
};

export type DeskQuote = {
  symbol: string;
  name: string;
  ltp: number;
  changePct: number | null;
  label: DataLabel;
  asOf: string;
};

export type RealDesk = {
  chart: {
    name: string;
    meta: string;
    ltp: number;
    changePct: number | null;
    model: ChartModel;
    label: DataLabel;
    asOf: string;
  };
  watch: DeskQuote[];
  /** The watchlist's Stamp: the first row's label and the newest time. */
  watchStamp: { label: DataLabel; asOf: string };
  attribution: string;
  delayMinutes: number;
  right: Snapshot['right'];
  /** The example order: a limit a little under the first watchlist stock's price. */
  ticket: { symbol: string; exchange: string; price: number; qty: number };
};

const int = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const price2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const month = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export const fmt2 = (n: number) => price2.format(n);

/** A 1-2-2.5-5 step near `raw`. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** The line model of a series of closes (oldest first) on its calendar. */
export function lineModel(values: number[], dates: string[]): ChartModel | null {
  const n = values.length;
  if (n < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.08 || max * 0.01 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (i / (n - 1)) * CHART.right;
  const y = (v: number) => CHART.top + (1 - (v - lo) / (hi - lo)) * (CHART.bottom - CHART.top);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${line}L${CHART.right} ${CHART.bottom}L0 ${CHART.bottom}Z`;
  const step = niceStep((hi - lo) / 4);
  const grid: ChartModel['grid'] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
    grid.push({ y: Number(y(t).toFixed(1)), label: step < 1 ? fmt2(t) : int.format(t) });
  }
  const at = [0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1];
  const xLabels = at.map((i, k) => {
    const d = Date.parse(`${dates[i]}T00:00:00Z`);
    return {
      x: Number(x(i).toFixed(1)),
      label: Number.isNaN(d) ? '' : month.format(new Date(d)),
      anchor: (k === 0 ? 'start' : k === at.length - 1 ? 'end' : 'middle') as 'start' | 'middle' | 'end',
    };
  });
  const lastV = values[n - 1];
  return {
    line,
    area,
    grid,
    xLabels,
    last: { y: Number(y(lastV).toFixed(1)), label: fmt2(lastV) },
    up: lastV >= values[0],
  };
}

/** The rows the watchlist shows: stocks first, then indices (never a volatility index). */
function watchRows(snapshot: Snapshot): MarketQuote[] {
  const ok = (q: MarketQuote) => Number.isFinite(q.ltp) && q.ltp > 0 && !!q.asOf;
  const stocks = snapshot.instruments.filter((q) => q.kind === 'STOCK' && ok(q));
  const indices = snapshot.instruments.filter((q) => q.kind === 'INDEX' && !isVolatilityIndex(q.ref) && ok(q));
  return [...stocks, ...indices].slice(0, 5);
}

/** A price a little under `ltp`, on the 5-paise tick: the example limit order's price. */
export function exampleLimit(ltp: number): number {
  return Math.floor((ltp * 0.99) / 0.05) * 0.05;
}

/**
 * The real desk, or null when the data isn't there (then the page draws the
 * sample desk): the snapshot (gate on, licence not OFF), the Ridgeline with a
 * usable Nifty 50 series (else its first series), and at least three
 * watchlist rows.
 */
export function realDesk(snapshot: Snapshot | null, ridge: RidgeData | null): RealDesk | null {
  if (!snapshot || snapshot.right === 'OFF' || !ridge || !ridge.series.length) return null;
  const series = ridge.series.find((s) => s.ref === 'NSE:NIFTY') ?? ridge.series[0];
  const values: number[] = [];
  const dates: string[] = [];
  let prev: number | null = null;
  series.closes.forEach((c, i) => {
    const v = c ?? prev;
    if (v !== null && Number.isFinite(v)) {
      values.push(v);
      dates.push(ridge.dates[i]);
      prev = v;
    }
  });
  const tip = series.tip;
  if (!tip || !values.length) return null;
  const tipDay = istDate(tip.asOf);
  if (tipDay && tipDay > dates[dates.length - 1]) {
    values.push(tip.ltp);
    dates.push(tipDay);
  } else {
    values[values.length - 1] = tip.ltp;
  }
  const model = lineModel(values, dates);
  const rows = watchRows(snapshot);
  if (!model || rows.length < 3) return null;
  const newest = rows.reduce((a, q) => (Date.parse(q.asOf) > Date.parse(a) ? q.asOf : a), rows[0].asOf);
  const first = rows.find((q) => q.kind === 'STOCK') ?? rows[0];
  return {
    chart: {
      name: series.name,
      meta: `${series.ref.split(':')[0]} · 1 year, daily`,
      ltp: tip.ltp,
      changePct: tip.changePct ?? null,
      model,
      label: tip.label,
      asOf: tip.asOf,
    },
    watch: rows.map((q) => ({
      symbol: q.symbol,
      name: q.name,
      ltp: q.ltp,
      changePct: q.changePct,
      label: q.label,
      asOf: q.asOf,
    })),
    watchStamp: { label: rows[0].label, asOf: newest },
    attribution: snapshot.attribution,
    delayMinutes: snapshot.delayMinutes,
    right: snapshot.right,
    ticket: { symbol: first.symbol, exchange: first.exchange || 'NSE', price: exampleLimit(first.ltp), qty: 20 },
  };
}

/* ── The sample desk (gate off, or no data): static, round, obviously sample. ── */

export type Candle = { x: number; o: number; c: number; h: number; l: number; up: boolean };

/** 24 sample candles between 1,580 and 1,620 (a fixed sequence, never a real price). */
const SAMPLE_CLOSES = [
  1592, 1588, 1590, 1596, 1594, 1599, 1597, 1603, 1601, 1598, 1604, 1608, 1606, 1611, 1609, 1605, 1610, 1614,
  1612, 1609, 1613, 1617, 1615, 1600,
];
export const SAMPLE_SCALE = { lo: 1580, hi: 1620, ticks: [1590, 1600, 1610] } as const;

export function sampleCandles(): Candle[] {
  const step = CHART.right / SAMPLE_CLOSES.length;
  const y = (v: number) =>
    CHART.top + (1 - (v - SAMPLE_SCALE.lo) / (SAMPLE_SCALE.hi - SAMPLE_SCALE.lo)) * (CHART.bottom - CHART.top);
  let open = 1590;
  return SAMPLE_CLOSES.map((close, i) => {
    const o = open;
    const c = i === SAMPLE_CLOSES.length - 1 ? 1600 : close;
    open = c;
    const hi = Math.max(o, c) + 2;
    const lo = Math.min(o, c) - 2;
    return { x: step * i + step / 2, o: y(o), c: y(c), h: y(hi), l: y(lo), up: c >= o };
  });
}
export function sampleY(v: number): number {
  return CHART.top + (1 - (v - SAMPLE_SCALE.lo) / (SAMPLE_SCALE.hi - SAMPLE_SCALE.lo)) * (CHART.bottom - CHART.top);
}

/** The sample watchlist: round numbers, never today's prices. */
export const SAMPLE_WATCH: { symbol: string; ltp: number; changePct: number }[] = [
  { symbol: 'HDFCBANK', ltp: 1600, changePct: 1 },
  { symbol: 'RELIANCE', ltp: 3000, changePct: 0.5 },
  { symbol: 'INFY', ltp: 1800, changePct: 2 },
  { symbol: 'TCS', ltp: 4000, changePct: -1.5 },
  { symbol: 'SBIN', ltp: 800, changePct: 0.75 },
];
export const SAMPLE_TICKET = { symbol: 'HDFCBANK', exchange: 'NSE', price: 1590, qty: 20 } as const;

/** The sample positions (shown on both desks, always labelled "Sample"). */
export const SAMPLE_POSITIONS: { symbol: string; qty: string; pnl: number }[] = [
  { symbol: 'HDFCBANK', qty: '×20', pnl: 200 },
  { symbol: 'INFY', qty: '×10', pnl: 400 },
  { symbol: 'TCS', qty: '×5', pnl: -100 },
];
