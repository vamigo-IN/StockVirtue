import type { DataLabel, InstrumentKind, MarketQuote } from '@/market/types';

/** Prices and times on widgets: Indian number format, India time. */

const price2 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const price4 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

export function fmtPrice(
  n: number | null | undefined,
  kind?: InstrumentKind,
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return (kind === 'CURRENCY' ? price4 : price2).format(n);
}

export function fmtChange(
  n: number | null | undefined,
  kind?: InstrumentKind,
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtPrice(Math.abs(n), kind)}`;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;
}

/** 1.2 Cr, 35.4 L, 12.5K */
export function fmtVolume(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export type Direction = 'up' | 'down' | 'flat';
export function direction(n: number | null | undefined): Direction {
  if (!n) return 'flat';
  return n > 0 ? 'up' : 'down';
}

const TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
});
const YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });

/** "3:05 pm IST" today, else "31 Oct, 3:30 pm IST". */
export function fmtStamp(
  iso: string | null | undefined,
  now = new Date(),
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = TIME.format(d).toLowerCase();
  return YMD.format(d) === YMD.format(now)
    ? `${time} IST`
    : `${DAY.format(d)}, ${time} IST`;
}

/** Quotes this far apart in time get their own stamp in a list. */
const SAME_TIME_MS = 5 * 60_000;

export interface ListStamp {
  label: DataLabel | null;
  asOf: string | null;
  /** Whether a quote needs its own label and time beside it. */
  own: (q: Pick<MarketQuote, 'label' | 'asOf'>) => boolean;
}

/**
 * One label and time for a list of quotes (a ticker, a table): the freshest
 * label present (LIVE, else DELAYED, else EOD) at its latest time. Quotes
 * that differ, such as closing prices among live ones or an exchange that
 * closed earlier, are flagged to carry their own label and time, so no
 * price is described by another's stamp.
 */
export function stampOf(
  quotes: Pick<MarketQuote, 'label' | 'asOf'>[],
): ListStamp {
  const label: DataLabel | null = quotes.some((q) => q.label === 'LIVE')
    ? 'LIVE'
    : quotes.some((q) => q.label === 'DELAYED')
      ? 'DELAYED'
      : quotes.length
        ? 'EOD'
        : null;
  const asOf =
    quotes
      .filter((q) => q.label === label)
      .reduce((t, q) => (q.asOf > t ? q.asOf : t), '') || null;
  const at = asOf ? Date.parse(asOf) : 0;
  return {
    label,
    asOf,
    own: (q) =>
      q.label !== label || Math.abs(Date.parse(q.asOf) - at) > SAME_TIME_MS,
  };
}

/** "1 Nov 2026" for dates like 2026-11-01. */
export function fmtDate(ymd: string | null | undefined): string {
  if (!ymd) return '—';
  const d = new Date(`${ymd}T00:00:00+05:30`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      });
}
