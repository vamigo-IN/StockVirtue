'use client';

import { clsx } from 'clsx';
import { marketPath, type ChartRange } from '@/market/paths';
import type { ChartData } from '@/market/types';
import { isIntraday } from './chart-utils';
import { MiniChart, type MiniChartSize } from './mini-chart-core';
import { useInViewMarket } from './useInViewMarket';

const HEIGHT: Record<MiniChartSize, number> = { rail: 32, card: 64, story: 64, wide: 120 };

/**
 * MiniChart fetched by the browser (spec §4.10, §7.6): the story rail's
 * lead stock card and any chart not rendered on the server. It asks for
 * `chart?symbol=…&range=…` once, when the chart comes within 200 px of the
 * viewport (never on the server: spec §7.12 rule 3), and draws in as it
 * mounts. Indices never ask for 1 day or 5 days (daily candles only).
 * While loading it keeps its final height; with fewer than 2 candles, or
 * under a licence that refuses charts, it is left out.
 */
export function MiniChartLive({
  refId,
  range = '1M',
  label,
  size,
  index = false,
  className,
}: {
  refId: string;
  range?: ChartRange;
  label: string;
  size: MiniChartSize;
  index?: boolean;
  className?: string;
}) {
  const r: ChartRange = isIntraday(range) ? '1M' : range;
  const res = useInViewMarket<ChartData>(marketPath.chart(refId, r), 0);
  const d = res.data;
  if (d && (!d.available || d.data.candles.length < 2)) return null;
  return (
    <div ref={res.ref} className={clsx('sv-mini-host', className)}>
      {d ? (
        <MiniChart
          candles={d.data.candles}
          label={label}
          size={size}
          range={r}
          index={index}
          drawIn="load"
          stamp={{ label: d.label, asOf: d.asOf, attribution: d.attribution }}
        />
      ) : res.error ? null : (
        <div
          aria-busy="true"
          aria-label="Loading market data"
          role="group"
          style={{ minHeight: HEIGHT[size] + 64 }}
        />
      )}
    </div>
  );
}
