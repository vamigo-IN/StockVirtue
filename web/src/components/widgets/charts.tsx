'use client';

import { ChartCandlestick, ChartSpline, GitCompareArrows } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { delayFor, isVolatilityIndex } from '@/components/market/gate';
import { cn } from '@/lib/utils';
import { marketPath, type ChartRange } from '@/market/paths';
import type { Candle, ChartData, InstrumentKind } from '@/market/types';
import { useMarket, useQuotes, useSnapshot } from './data';
import { fmtPrice } from './format';
import {
  Change,
  DataStamp,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import {
  applyChartColors,
  candleColors,
  candleTime,
  createLwChart,
  watchChartColors,
  type ChartApi,
} from './lw-chart';
import type { WidgetConfig } from './meta';

/**
 * Chart widgets. Addresses come from `marketPath.chart` (spec §7.0 rule 1).
 * A chart loads once per mount and range; only 1 day refreshes, every 60 s
 * (spec §7.12 rule 5). Colours come from the tokens: the sparkline through
 * `currentColor` (text-up / text-down), the canvas charts through
 * lw-chart.ts, which reads them at mount and again when the palette
 * switches.
 */

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const RANGES: readonly ChartRange[] = ['1D', '5D', '1M', '6M', '1Y'];
const INDEX_RANGES: readonly ChartRange[] = ['1M', '6M', '1Y'];
const rangeOf = (v: unknown, fb: ChartRange): ChartRange =>
  RANGES.includes(v as ChartRange) ? (v as ChartRange) : fb;
const intraday = (r: ChartRange) => r === '1D' || r === '5D';

const RANGE_WORDS: Record<ChartRange, string> = {
  '1D': '1 day',
  '5D': '5 days',
  '1M': '1 month',
  '6M': '6 months',
  '1Y': '1 year',
};
/** "1 month"; an index's 1M answer holds about three months (spec §4.10). */
function rangeLabel(r: ChartRange, kind?: InstrumentKind): string {
  return kind === 'INDEX' && r === '1M' ? '3 months' : RANGE_WORDS[r];
}
/** The short tab label: "1D" … "1Y", and "3M" for an index's 1M. */
function rangeTab(r: ChartRange, kind?: InstrumentKind): string {
  return kind === 'INDEX' && r === '1M' ? '3M' : r;
}

/**
 * What a chart shows instead of itself (fix d, spec §7.9): under a licence
 * that blocks the range, "Intraday charts aren't available…" only for 1 day
 * and 5 days, "Charts aren't available…" otherwise.
 */
function ChartState({
  res,
  range,
}: {
  res: { data?: ChartData; loading: boolean };
  range: ChartRange;
}) {
  if (res.loading && !res.data) return <WidgetSkeleton rows={5} />;
  if (res.data?.reason === 'rights') {
    return (
      <WidgetMessage kind="rights">
        {intraday(range)
          ? 'Intraday charts aren’t available under our current market-data licence.'
          : 'Charts aren’t available under our current market-data licence.'}
      </WidgetMessage>
    );
  }
  return <WidgetMessage kind="error" />;
}

/** A small price line: closes over the range, filled under. */
function Sparkline({
  candles,
  tone,
}: {
  candles: Candle[];
  tone: 'up' | 'down' | 'neutral';
}) {
  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map(
    (v, i) =>
      `${(i / Math.max(1, closes.length - 1)) * 100},${40 - ((v - min) / span) * 36 - 2}`,
  );
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className={cn(
        'h-24 w-full',
        tone === 'up'
          ? 'text-up'
          : tone === 'down'
            ? 'text-down'
            : 'text-foreground',
      )}
      aria-hidden="true"
    >
      <polygon
        points={`0,40 ${pts.join(' ')} 100,40`}
        fill="currentColor"
        opacity="0.1"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MiniChartWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '').toUpperCase();
  const configured = rangeOf(config.range, '1M');
  const refresh = num(config.refresh, 60);
  const quotes = useQuotes(ref ? [ref] : [], Math.min(refresh || 15, 15));
  const snap = useSnapshot(0);
  const q =
    quotes.data?.right === 'OFF'
      ? undefined
      : quotes.data?.quotes.find((x) => x.ref === ref);
  // Never 1 day or 5 days for an index (spec §7.12 rule 4): stories saved
  // with the old default (NSE:NIFTY · 1D, a single daily candle) draw the
  // index's 1M answer, about three months, instead.
  const range: ChartRange =
    q?.kind === 'INDEX' && intraday(configured) ? '1M' : configured;
  // An intraday range waits for the quote to say what the instrument is.
  const waiting = intraday(configured) && quotes.loading && !quotes.data;
  const chart = useMarket<ChartData>(
    ref && !waiting ? marketPath.chart(ref, range) : null,
    range === '1D' ? Math.max(60, refresh) : 0,
  );
  const candles = chart.data?.available ? chart.data.data.candles : [];
  const vix = isVolatilityIndex(ref);
  const up =
    candles.length > 1
      ? candles[candles.length - 1].c >= candles[0].c
      : (q?.changePct ?? 0) >= 0;
  return (
    <WidgetCard
      title={q?.name ?? ref.split(':')[1] ?? 'Chart'}
      icon={ChartSpline}
      aside={
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {rangeLabel(range, q?.kind)}
        </span>
      }
      footer={
        (q || chart.data?.available) && (
          <DataStamp
            label={q?.label ?? chart.data?.label}
            asOf={q?.asOf ?? chart.data?.asOf}
            attribution={quotes.data?.attribution ?? chart.data?.attribution}
            delay={delayFor(
              quotes.data?.right ?? snap.data?.right,
              snap.data?.delayMinutes,
            )}
            stale={!!(quotes.error || chart.error)}
          />
        )
      }
    >
      {q && (
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className="font-mono text-2xl font-bold tabular-nums">
            {fmtPrice(q.ltp, q.kind)}
          </span>
          <Change
            change={q.change}
            pct={q.changePct}
            kind={q.kind}
            neutral={vix}
            className="text-sm"
          />
        </p>
      )}
      {candles.length > 1 ? (
        <Sparkline candles={candles} tone={vix ? 'neutral' : up ? 'up' : 'down'} />
      ) : (
        <div className="mt-2">
          <ChartState res={chart} range={range} />
        </div>
      )}
    </WidgetCard>
  );
}

export function CandleChartWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '').toUpperCase();
  const configured = rangeOf(config.range, '1M');
  const [chosen, setRange] = useState<ChartRange>(configured);
  useEffect(() => setRange(configured), [configured]);
  // The snapshot says whether this is an index (daily candles only) and
  // whether the licence allows intraday ranges.
  const snap = useSnapshot(0);
  const inst = snap.data?.instruments.find((i) => i.ref === ref);
  const kind = inst?.kind;
  const ranges = kind === 'INDEX' ? INDEX_RANGES : RANGES;
  // Never 1 day or 5 days for an index (spec §7.12 rule 4): an older
  // config that asks for one shows "3 months" instead.
  const range: ChartRange =
    kind === 'INDEX' && intraday(chosen) ? '1M' : chosen;
  const intradayBlocked = !!snap.data && snap.data.right !== 'LIVE';
  // An intraday range waits for the snapshot to say what the instrument is.
  const waiting = intraday(chosen) && !snap.data && !snap.error;
  const res = useMarket<ChartData>(
    ref && !waiting ? marketPath.chart(ref, range) : null,
    range === '1D' ? Math.max(60, num(config.refresh, 60)) : 0,
  );
  const host = useRef<HTMLDivElement>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const candles = useMemo(
    () => (res.data?.available ? res.data.data.candles : []),
    [res.data],
  );
  const daily = res.data?.data.interval === 'ONE_DAY';
  // An intraday request answered with daily candles (the intraday call
  // failed upstream): say so rather than draw days as "1 day" (spec §5.10.2).
  const noIntraday = intraday(range) && daily && candles.length > 0;
  const name = inst?.name ?? ref.split(':')[1] ?? '';

  useEffect(() => {
    const el = host.current;
    if (!el || candles.length === 0 || noIntraday) return;
    let chart: ChartApi | null = null;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      const made = await createLwChart(el, { height: 300 });
      if (cancelled) {
        made.chart.remove();
        return;
      }
      chart = made.chart;
      const series = chart.addSeries(
        made.lc.CandlestickSeries,
        candleColors(made.colors),
      );
      series.setData(
        candles.map((c) => ({
          time: candleTime(c.t, daily),
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
      chart.timeScale().fitContent();
      const drawn = chart;
      stop = watchChartColors(el, (colors) => {
        applyChartColors(drawn, colors);
        series.applyOptions(candleColors(colors));
      });
      setDrawFailed(false);
    })().catch(() => {
      if (!cancelled) setDrawFailed(true);
    });
    return () => {
      cancelled = true;
      stop();
      chart?.remove();
    };
  }, [candles, daily, noIntraday]);

  const first = candles[0];
  const last = candles[candles.length - 1];
  return (
    <WidgetCard
      title={`${ref.split(':')[1] ?? ''} · candlestick`}
      icon={ChartCandlestick}
      aside={
        <div className="flex flex-wrap gap-1" role="group" aria-label="Chart range">
          {ranges.map((r) => {
            const blocked = intraday(r) && intradayBlocked;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={r === range}
                disabled={blocked}
                title={
                  blocked ? 'Needs our live data licence' : rangeLabel(r, kind)
                }
                onClick={() => setRange(r)}
                className={cn(
                  'min-h-11 min-w-11 rounded-[4px] px-2 text-[13px] leading-4 font-[650] tabular-nums',
                  r === range
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {rangeTab(r, kind)}
              </button>
            );
          })}
        </div>
      }
      footer={
        res.data?.available &&
        !noIntraday && (
          <DataStamp
            label={res.data.label}
            asOf={res.data.asOf}
            attribution={res.data.attribution}
            delay={delayFor(snap.data?.right, snap.data?.delayMinutes)}
            stale={!!res.error}
          />
        )
      }
    >
      {noIntraday ? (
        <WidgetMessage kind="error">
          {kind === 'COMMODITY' || kind === 'CURRENCY'
            ? 'Intraday prices aren’t available for this contract right now.'
            : `Intraday prices aren’t available for ${name} right now.`}
        </WidgetMessage>
      ) : drawFailed ? (
        <WidgetMessage kind="error">
          This chart couldn’t be drawn.
        </WidgetMessage>
      ) : candles.length ? (
        <>
          {first && last && (
            <p className="mb-2 text-sm">
              <span className="font-mono font-semibold tabular-nums">
                {fmtPrice(last.c)}
              </span>{' '}
              <Change
                change={last.c - first.o}
                pct={((last.c - first.o) / first.o) * 100}
                neutral={isVolatilityIndex(ref)}
                className="text-[13px]"
              />{' '}
              <span className="text-[13px] text-muted-foreground">
                over {rangeLabel(range, kind)}
              </span>
            </p>
          )}
          <div ref={host} className="h-[300px] w-full" />
        </>
      ) : (
        <ChartState res={res} range={range} />
      )}
    </WidgetCard>
  );
}

export function StockCompareWidget({ config }: { config: WidgetConfig }) {
  const refs = (
    Array.isArray(config.symbols) ? (config.symbols as unknown[]) : []
  )
    .map((s) => String(s).toUpperCase())
    .slice(0, 4);
  const range = rangeOf(config.range, '6M');
  const pathFor = (i: number) =>
    refs[i] ? marketPath.chart(refs[i], range) : null;
  // Four fixed slots keep the hook order stable whatever the config holds.
  const a = useMarket<ChartData>(pathFor(0), 0);
  const b = useMarket<ChartData>(pathFor(1), 0);
  const c = useMarket<ChartData>(pathFor(2), 0);
  const d = useMarket<ChartData>(pathFor(3), 0);
  const results = [a, b, c, d].slice(0, refs.length);
  const series = useMemo(
    () =>
      results.map((r, i) => {
        const candles = r.data?.available ? r.data.data.candles : [];
        const base = candles[0]?.c;
        return {
          ref: refs[i],
          slot: i,
          points: base
            ? candles.map((k) => ({ t: k.t, v: ((k.c - base) / base) * 100 }))
            : [],
          daily: r.data?.data.interval === 'ONE_DAY',
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a.data, b.data, c.data, d.data, refs.join(',')],
  );
  const host = useRef<HTMLDivElement>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const ready = series.some((s) => s.points.length > 1);

  useEffect(() => {
    const el = host.current;
    if (!el || !ready) return;
    let chart: ChartApi | null = null;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      const made = await createLwChart(el, { height: 280, percent: true });
      if (cancelled) {
        made.chart.remove();
        return;
      }
      chart = made.chart;
      const lines: {
        line: { applyOptions(o: { color: string }): void };
        slot: number;
      }[] = [];
      for (const s of series) {
        if (s.points.length < 2) continue;
        const line = chart.addSeries(made.lc.LineSeries, {
          color: made.colors.series[s.slot],
          lineWidth: 2,
          priceLineVisible: false,
        });
        line.setData(
          s.points.map((p) => ({ time: candleTime(p.t, s.daily), value: p.v })),
        );
        lines.push({ line, slot: s.slot });
      }
      chart.timeScale().fitContent();
      const drawn = chart;
      stop = watchChartColors(el, (colors) => {
        applyChartColors(drawn, colors);
        for (const l of lines) l.line.applyOptions({ color: colors.series[l.slot] });
      });
      setDrawFailed(false);
    })().catch(() => {
      if (!cancelled) setDrawFailed(true);
    });
    return () => {
      cancelled = true;
      stop();
      chart?.remove();
    };
  }, [series, ready]);

  const loading = results.some((r) => r.loading && !r.data);
  const stamp = results.find((r) => r.data?.available)?.data;
  return (
    <WidgetCard
      title={`Comparison · ${RANGE_WORDS[range]}`}
      icon={GitCompareArrows}
      footer={
        stamp && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={stamp.attribution}
            stale={results.some((r) => !!r.error)}
          />
        )
      }
    >
      {drawFailed ? (
        <WidgetMessage kind="error">
          This chart couldn’t be drawn.
        </WidgetMessage>
      ) : ready ? (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {series.map((s) => {
              const last = s.points[s.points.length - 1];
              return (
                <li key={s.ref} className="flex items-center gap-1.5">
                  <span
                    className="size-2.5 rounded-full"
                    // Series 1 is ink: the text colour, which also covers
                    // the portal's dark cards (lw-chart.ts does the same).
                    style={{
                      background:
                        s.slot === 0
                          ? 'currentColor'
                          : `var(--sv-series-${s.slot + 1})`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{s.ref.split(':')[1]}</span>
                  {last ? (
                    <Change
                      change={null}
                      pct={last.v}
                      showAbs={false}
                      className="text-[13px]"
                    />
                  ) : (
                    <span className="text-[13px] text-muted-foreground">
                      no data
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div ref={host} className="h-[280px] w-full" />
          <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
            Change since the start of the period, in %.
          </p>
        </>
      ) : loading ? (
        <WidgetSkeleton rows={5} />
      ) : results.some((r) => r.data?.reason === 'rights') ? (
        <WidgetMessage kind="rights">
          Charts aren’t available under our current market-data licence.
        </WidgetMessage>
      ) : (
        <WidgetMessage kind="error" />
      )}
    </WidgetCard>
  );
}
