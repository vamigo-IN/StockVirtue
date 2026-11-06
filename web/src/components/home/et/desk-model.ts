import { isVolatilityIndex } from '@/components/market/gate';
import { istDate, type RidgeData } from '@/components/home/ridgeline/model';
import { stampOf } from '@/components/widgets/format';
import type { DataLabel, Labelled, ListRow, MarketQuote, Snapshot } from '@/market/types';

/**
 * The hero desk's data (Emerald Terminal home, 6 Nov 2026). Pure: no React,
 * no clock, no fetch. Real data or none: `realDesk()` builds the desk only
 * with the site-prices gate on and the data there, and every figure in it
 * is a market price with its label and time:
 * - the chart: a year of real daily closes (the Ridgeline's Nifty 50
 *   series, else its first, with the snapshot's tip);
 * - the watchlist: snapshot rows;
 * - the order ticket: the first watchlist stock at its last price, 20
 *   shares, and the order's value;
 * - "Biggest moves": the large caps' top three gainers and losers (the
 *   movers, LIVE licence only), else the curated indices from the snapshot.
 * Null when that isn't possible: the page then draws no desk.
 */

/** The chart's viewBox and plot area (px in the 440 × 220 box). */
export const CHART = { w: 440, h: 220, right: 384, top: 10, bottom: 190 } as const;

/** Shares on the order ticket (the "How a trade works" steps say 20). */
export const TICKET_QTY = 20;
/** Rows per side in "Biggest moves". */
const MOVES_EACH = 3;

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

/** A row in "Biggest moves" (a movers row: one label and time for the list). */
export type DeskMove = { symbol: string; name: string; ltp: number; changePct: number };

export type DeskMoves =
  | {
      /** The large caps' movers (LIVE licence). */
      kind: 'movers';
      gainers: DeskMove[];
      losers: DeskMove[];
      label: DataLabel;
      asOf: string;
    }
  | {
      /** No movers: the curated indices the chart doesn't show. */
      kind: 'indices';
      rows: DeskQuote[];
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
  /** The first watchlist stock at its last price: a limit buy of TICKET_QTY. Null without a stock. */
  ticket: (DeskQuote & { exchange: string; qty: number }) | null;
  moves: DeskMoves | null;
};

/** The movers lists the page fetched (either may be null: unavailable). */
export type HomeMovers = { gainers: Labelled<ListRow[]> | null; losers: Labelled<ListRow[]> | null };

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

const priced = (q: MarketQuote) => Number.isFinite(q.ltp) && q.ltp > 0 && !!q.asOf;

const deskQuote = (q: MarketQuote): DeskQuote => ({
  symbol: q.symbol,
  name: q.name,
  ltp: q.ltp,
  changePct: q.changePct,
  label: q.label,
  asOf: q.asOf,
});

/** The rows the watchlist shows: stocks first, then indices (never a volatility index). */
function watchRows(snapshot: Snapshot): MarketQuote[] {
  const stocks = snapshot.instruments.filter((q) => q.kind === 'STOCK' && priced(q));
  const indices = snapshot.instruments.filter((q) => q.kind === 'INDEX' && !isVolatilityIndex(q.ref) && priced(q));
  return [...stocks, ...indices].slice(0, 5);
}

/**
 * "Biggest moves": the top three risers of the gainers list and fallers of
 * the losers list (a list on a one-way day can hold the other kind: those
 * rows are left out), with one label and time for both. Without a usable
 * movers answer, the curated indices other than the charted one.
 */
export function deskMoves(movers: HomeMovers | null, snapshot: Snapshot, chartRef: string): DeskMoves | null {
  const lists = [movers?.gainers, movers?.losers].filter(
    (a): a is Labelled<ListRow[]> => !!a && a.available && !!a.label && !!a.asOf,
  );
  const pick = (a: Labelled<ListRow[]> | null | undefined, up: boolean): DeskMove[] =>
    (a && lists.includes(a) ? a.data : [])
      .filter((r) => Number.isFinite(r.ltp) && r.ltp > 0 && typeof r.changePct === 'number' && (up ? r.changePct > 0 : r.changePct < 0))
      .slice(0, MOVES_EACH)
      .map((r) => ({ symbol: r.symbol, name: r.name, ltp: r.ltp, changePct: r.changePct as number }));
  const gainers = pick(movers?.gainers, true);
  const losers = pick(movers?.losers, false);
  if (gainers.length || losers.length) {
    const stamp = stampOf(lists.map((a) => ({ label: a.label as DataLabel, asOf: a.asOf as string })));
    if (stamp.label && stamp.asOf) {
      return { kind: 'movers', gainers, losers, label: stamp.label, asOf: stamp.asOf };
    }
  }
  const indices = snapshot.instruments
    .filter((q) => q.kind === 'INDEX' && !isVolatilityIndex(q.ref) && q.ref !== chartRef && priced(q))
    .slice(0, 4);
  if (indices.length < 2) return null;
  const stamp = stampOf(indices);
  return stamp.label && stamp.asOf
    ? { kind: 'indices', rows: indices.map(deskQuote), label: stamp.label, asOf: stamp.asOf }
    : null;
}

/**
 * The real desk, or null when the data isn't there (the page then draws no
 * desk): the snapshot (gate on, licence not OFF), the Ridgeline with a
 * usable Nifty 50 series (else its first series), and at least three
 * watchlist rows.
 */
export function realDesk(
  snapshot: Snapshot | null,
  ridge: RidgeData | null,
  movers: HomeMovers | null = null,
): RealDesk | null {
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
  const stock = rows.find((q) => q.kind === 'STOCK');
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
    watch: rows.map(deskQuote),
    watchStamp: { label: rows[0].label, asOf: newest },
    attribution: snapshot.attribution,
    delayMinutes: snapshot.delayMinutes,
    right: snapshot.right,
    ticket: stock ? { ...deskQuote(stock), exchange: stock.exchange || 'NSE', qty: TICKET_QTY } : null,
    moves: deskMoves(movers, snapshot, series.ref),
  };
}
