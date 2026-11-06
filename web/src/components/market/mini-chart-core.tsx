import type { ReactNode } from 'react';
import { Change } from '@/components/widgets/frame';
import { clsx } from 'clsx';
import type { ChartRange } from '@/market/paths';
import type { Candle, DataLabel } from '@/market/types';
import { fmtDay, seriesPct, shortSince } from './chart-utils';
import { rangeWords } from './copy';
import { Stamp } from './Stamp';

export type MiniChartSize = 'rail' | 'card' | 'story' | 'wide';

const BOX: Record<MiniChartSize, [number, number]> = {
  rail: [120, 32],
  card: [280, 64],
  story: [340, 64],
  wide: [600, 120],
};

/** The end dot takes its stamp's colour. */
const DOT: Record<DataLabel, string> = {
  LIVE: 'var(--sv-live-dot)',
  DELAYED: 'var(--sv-warning)',
  EOD: 'var(--sv-fg-3)',
};

export interface MiniChartStamp {
  label: DataLabel | null;
  asOf: string | null;
  attribution: string;
}

/**
 * A daily sparkline (spec §4.10): a 1.5 px stroke and a 6% area in the
 * range's direction (Emerald Terminal, design I: --sv-up / --sv-down via
 * data-dir, so the colour-blind palette follows; ink when flat), a 1 px --sv-line baseline at the first close and an end dot in
 * the stamp's colour. Sizes: 120 × 32 (rail), 280 × 64 (card), 340 × 64
 * (story rail), 600 × 120 (wide, /features). Its caption: "6 months · daily
 * · ▲8.20%", or "Since 2 Jul 2026 · daily · ▲6.10%" when the first candle
 * starts more than 7 days after the range does. The Stamp is required:
 * without a label and a time the chart doesn't render. Hidden with fewer
 * than 2 candles.
 *
 * Server-safe (no hooks): server pages render it from server-fetched daily
 * data (the /features chart, the /news fallback); MiniChartLive renders it
 * in the browser. It draws in once over 900 ms (widgets.css): `drawIn="load"`
 * on mount, `"view"` (the default) on a CSS view() timeline as it scrolls in
 * (drawn at once where unsupported); never under reduced motion.
 */
export function MiniChart({
  candles,
  label,
  size,
  stamp,
  range = '6M',
  index = false,
  caption,
  drawIn = 'view',
  className,
}: {
  candles: Candle[];
  /** The instrument's name ("Nifty 50"), shown above the line. */
  label: string;
  size: MiniChartSize;
  stamp: MiniChartStamp;
  /** The range the candles cover (default 6 months). */
  range?: ChartRange;
  /** An index (its 1M answer covers about three months). */
  index?: boolean;
  /** Replaces the computed caption (the /features chart sentence). */
  caption?: ReactNode;
  drawIn?: 'load' | 'view';
  className?: string;
}) {
  if (candles.length < 2 || !stamp.label || !stamp.asOf) return null;
  const [w, h] = BOX[size];
  const pad = size === 'rail' ? 3 : 6;
  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => (i / (closes.length - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const pts = closes.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const line = `M${pts.join('L')}`;
  const area = `${line}L${x(closes.length - 1).toFixed(2)},${h}L${x(0).toFixed(2)},${h}Z`;
  const base = y(closes[0]);
  const end = { x: x(closes.length - 1), y: y(closes[closes.length - 1]) };

  const pct = seriesPct(candles);
  const since = shortSince(candles, range, stamp.asOf, index);
  const words = since ? `Since ${fmtDay(since)}` : rangeWords(range, index);
  const sentence = `${words} · daily`;

  return (
    <figure
      className={clsx('sv-mini', className)}
      data-size={size}
      data-dir={pct === null ? undefined : pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat'}
      data-draw={drawIn}
      data-market-module="mini-chart"
    >
      <p className="t-label m-0 text-fg">{label}</p>
      <svg
        className="sv-mini-svg"
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${label}, ${sentence}`}
      >
        <path d={area} className="sv-mini-area" />
        <line x1={0} x2={w} y1={base} y2={base} className="sv-mini-base" />
        <path d={line} pathLength={1} className="sv-mini-line" />
        <circle cx={end.x} cy={end.y} r={size === 'rail' ? 2 : 3} fill={DOT[stamp.label]} className="sv-mini-dot" />
      </svg>
      <figcaption className="t-meta text-fg-2">
        {caption ?? (
          <>
            {sentence}
            {pct !== null ? (
              <>
                {' · '}
                <Change change={null} pct={pct} showAbs={false} />
              </>
            ) : null}
          </>
        )}
      </figcaption>
      <Stamp label={stamp.label} asOf={stamp.asOf} attribution={stamp.attribution} />
    </figure>
  );
}
