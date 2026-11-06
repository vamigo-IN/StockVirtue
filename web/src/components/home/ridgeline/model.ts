/**
 * The Ridgeline's data model (spec §6.4.2), shared by the server
 * (src/market/ridgeline.ts), the poster, the reading layer and the WebGL
 * scene. Pure and isomorphic: no DOM, no three.js, no clock.
 *
 * `RidgeData` is what the server sends (a year of daily closes per index on
 * one shared session calendar, plus each index's live tip from the
 * snapshot). `resolveRidges()` applies the tips and works out everything the
 * two renderings share: the rebased lines, the slider's stops and the one
 * vertical scale. The server and the browser call it with the same inputs,
 * so they draw the same picture; the browser calls it again whenever a
 * snapshot brings new tips.
 */
import type { DataLabel, DataRight } from '@/market/types';

/** An index's latest price, from the snapshot (server, then streamed). */
export type RidgeTip = {
  ltp: number;
  label: DataLabel;
  asOf: string;
  /** The snapshot's change on the day, in %, when it has one. */
  changePct?: number | null;
  /** The snapshot's change on the day in points (the readout's `Change`), when it has one. */
  change?: number | null;
};

export type RidgeSeries = {
  ref: string;
  name: string;
  /** One per calendar date; null = no session that day (drawn flat at the previous close). */
  closes: (number | null)[];
  /** From the snapshot. */
  tip: RidgeTip | null;
};

export type RidgeData = {
  right: DataRight;
  delayMinutes: number;
  attribution: string;
  /** The shared session calendar: IST YYYY-MM-DD, oldest first, the last 12 months. */
  dates: string[];
  /** A, in %: one vertical scale for every ridge and both renderings. */
  scale: number;
  series: RidgeSeries[];
};

/** One resolved ridge. */
export interface RidgeLine {
  ref: string;
  name: string;
  /** Close per calendar date with the tip applied; null = no session that day. */
  closes: (number | null)[];
  /** Rebased change in %, per calendar date; a day without a session repeats the previous close. */
  pct: number[];
  /** The first close in the window: the line's 0%. */
  base: number;
  /** Calendar indices that have a value, ascending: the slider's stops. */
  sessions: number[];
  /** The tip and its calendar index (−1 without one). */
  tip: RidgeTip | null;
  tipIndex: number;
}

export interface RidgeModel {
  right: DataRight;
  delayMinutes: number;
  attribution: string;
  /** The calendar, plus a "now" date when a tip is later than the last close. */
  dates: string[];
  /** A, in %. */
  scale: number;
  /** The second reference line: +10%, or +20% when A is over 40%. */
  refPct: number;
  lines: RidgeLine[];
}

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The IST calendar date (YYYY-MM-DD) of an instant; '' when invalid. */
export function istDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The scale A (spec §6.4.2): the largest absolute rebased change across the
 * drawn lines and their tips, rounded up to the next 5%, never less than 15%.
 */
export function scaleFor(lines: readonly { pct: readonly number[] }[]): number {
  let max = 0;
  for (const l of lines) {
    for (const p of l.pct) {
      const a = Math.abs(p);
      if (a > max) max = a;
    }
  }
  // The small allowance keeps a move of exactly 20% (give or take float
  // noise) at A = 20 rather than 25.
  return Math.max(15, Math.ceil(max / 5 - 1e-6) * 5);
}

/**
 * Applies the tips (the data's own, or newer ones from a live snapshot, in
 * series order) and resolves the lines. A tip whose IST date is later than
 * the last calendar date adds that date as a "now" point; otherwise it
 * replaces that date's close.
 */
export function resolveRidges(
  data: RidgeData,
  tips?: readonly (RidgeTip | null)[],
): RidgeModel {
  // A newer tip wins; a series the live snapshot doesn't carry keeps the
  // server's tip.
  const useTips = data.series.map((s, i) => tips?.[i] ?? s.tip);
  const last = data.dates[data.dates.length - 1] ?? '';
  const extra = new Set<string>();
  const tipDates = useTips.map((t) => (t ? istDate(t.asOf) : ''));
  for (const d of tipDates) if (d && d > last) extra.add(d);
  const added = [...extra].sort();
  const dates = added.length ? data.dates.concat(added) : data.dates;
  const index = new Map<string, number>();
  dates.forEach((d, k) => index.set(d, k));

  const lines: RidgeLine[] = data.series.map((s, i) => {
    const closes: (number | null)[] = added.length
      ? s.closes.concat(added.map(() => null))
      : s.closes.slice();
    const tip = useTips[i];
    let tipIndex = -1;
    if (tip && Number.isFinite(tip.ltp) && tip.ltp > 0) {
      const k = index.get(tipDates[i]);
      if (k !== undefined) {
        closes[k] = tip.ltp;
        tipIndex = k;
      }
    }
    let base = 0;
    for (const c of closes) {
      if (c !== null && c > 0) {
        base = c;
        break;
      }
    }
    const pct: number[] = new Array(closes.length);
    const sessions: number[] = [];
    let prev = base;
    for (let k = 0; k < closes.length; k++) {
      const c = closes[k];
      if (c !== null && c > 0) {
        prev = c;
        sessions.push(k);
      }
      pct[k] = base > 0 ? (prev / base - 1) * 100 : 0;
    }
    return {
      ref: s.ref,
      name: s.name,
      closes,
      pct,
      base,
      sessions,
      tip: tipIndex >= 0 ? tip : null,
      tipIndex,
    };
  });

  const scale = scaleFor(lines);
  return {
    right: data.right,
    delayMinutes: data.delayMinutes,
    attribution: data.attribution,
    dates,
    scale,
    refPct: scale > 40 ? 20 : 10,
    lines,
  };
}

/** The line's latest point: its last session (the tip when it has one). */
export function lastSession(line: RidgeLine): number {
  return line.sessions[line.sessions.length - 1] ?? 0;
}

/** The session of `line` nearest to calendar index k (ties go to the later one). */
export function nearestSession(line: RidgeLine, k: number): number {
  const s = line.sessions;
  if (!s.length) return 0;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && k - s[lo - 1] < s[lo] - k) return s[lo - 1];
  return s[lo];
}

/**
 * The session before calendar index k on this line (−1 for the first one):
 * the "previous close" a day's change is measured from.
 */
export function previousSession(line: RidgeLine, k: number): number {
  const s = line.sessions;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? s[lo - 1] : -1;
}

/** Slot per series index for an order (series indices, front to back). */
export function slotsFor(order: readonly number[], count: number): number[] {
  const slots = new Array<number>(count).fill(0);
  order.forEach((series, slot) => {
    if (series >= 0 && series < count) slots[series] = slot;
  });
  return slots;
}

/** The order with series s at the front and the rest in portal order. */
export function orderWithFront(s: number, count: number): number[] {
  const order = [s];
  for (let i = 0; i < count; i++) if (i !== s) order.push(i);
  return order;
}

/** Whether the bead and the day reading describe a live or delayed price. */
export function isLiveTip(line: RidgeLine, k: number): boolean {
  return (
    !!line.tip &&
    k === line.tipIndex &&
    (line.tip.label === 'LIVE' || line.tip.label === 'DELAYED')
  );
}

/** A snapshot row's fields that a tip needs. */
export interface TipSource {
  ref: string;
  ltp: number;
  label: DataLabel;
  asOf: string;
  changePct?: number | null;
  change?: number | null;
}

/** One snapshot row as a tip (null without a usable price). */
export function tipOf(q: TipSource | undefined): RidgeTip | null {
  if (!q || !Number.isFinite(q.ltp) || q.ltp <= 0 || !q.asOf) return null;
  return {
    ltp: q.ltp,
    label: q.label,
    asOf: q.asOf,
    changePct: q.changePct ?? null,
    change: q.change ?? null,
  };
}

/**
 * The tips a (streamed) snapshot carries for these series, in series order;
 * undefined when it has no rows, so the server's tips stay.
 */
export function tipsFrom(
  data: RidgeData,
  rows: readonly TipSource[] | undefined,
): (RidgeTip | null)[] | undefined {
  if (!rows?.length) return undefined;
  const byRef = new Map(rows.map((q) => [q.ref, q]));
  return data.series.map((s) => tipOf(byRef.get(s.ref)));
}

/** A line's change over the whole window, in %: its latest point against its first close. */
export function windowChangePct(line: RidgeLine): number {
  const first = line.sessions[0];
  const last = lastSession(line);
  const a = first === undefined ? null : line.closes[first];
  const b = line.closes[last];
  return a && b ? (b / a - 1) * 100 : 0;
}

/**
 * Whether two models draw the same picture (same calendar, scale and
 * rebased lines). A router refresh or a revalidation can hand over equal
 * data as a new object; the scene then needs no new frame.
 */
export function sameDrawing(a: RidgeModel, b: RidgeModel): boolean {
  if (a === b) return true;
  if (
    a.scale !== b.scale ||
    a.dates.length !== b.dates.length ||
    a.dates[a.dates.length - 1] !== b.dates[b.dates.length - 1] ||
    a.lines.length !== b.lines.length
  ) {
    return false;
  }
  for (let i = 0; i < a.lines.length; i++) {
    const p = a.lines[i].pct;
    const q = b.lines[i].pct;
    if (p.length !== q.length || a.lines[i].ref !== b.lines[i].ref) return false;
    for (let k = 0; k < p.length; k++) if (p[k] !== q[k]) return false;
  }
  return true;
}
