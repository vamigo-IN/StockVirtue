'use client';

import { ChartCandlestick, ChartSpline, GitCompareArrows } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Candle, ChartData } from '@/market/types';
import { useMarket } from './data';
import { fmtPct, fmtPrice } from './format';
import {
  Change,
  DataStamp,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import type { WidgetConfig } from './meta';
import { useQuotes } from './quotes';

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const RANGES = ['1D', '5D', '1M', '6M', '1Y'] as const;
const IST = 330 * 60;
const COLORS = ['#16a34a', '#2563eb', '#d97706', '#9333ea'];

function chartPath(ref: string, range: string) {
  return `chart?symbol=${encodeURIComponent(ref)}&range=${range}`;
}

/** Intraday candles in IST seconds; daily ones as business days. */
function timeOf(c: Candle, daily: boolean) {
  if (daily) return new Date(c.t + IST * 1000).toISOString().slice(0, 10);
  return Math.floor(c.t / 1000) + IST;
}

function ChartState({ res }: { res: { data?: ChartData; loading: boolean } }) {
  if (res.loading && !res.data) return <WidgetSkeleton rows={5} />;
  if (res.data?.reason === 'rights') {
    return (
      <WidgetMessage kind="rights">
        Intraday charts aren’t available under our current market-data licence.
      </WidgetMessage>
    );
  }
  return (
    <WidgetMessage kind="error">
      The chart isn’t available right now.
    </WidgetMessage>
  );
}

/** A small price line: closes over the range, filled under. */
function Sparkline({ candles, up }: { candles: Candle[]; up: boolean }) {
  const closes = candles.map((c) => c.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map(
    (v, i) =>
      `${(i / Math.max(1, closes.length - 1)) * 100},${40 - ((v - min) / span) * 36 - 2}`,
  );
  const color = up ? '#16a34a' : '#dc2626';
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-24 w-full"
      aria-hidden="true"
    >
      <polygon
        points={`0,40 ${pts.join(' ')} 100,40`}
        fill={color}
        opacity="0.1"
      />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MiniChartWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '');
  const range = String(config.range ?? '1D');
  const refresh = num(config.refresh, 60);
  const chart = useMarket<ChartData>(
    ref ? chartPath(ref, range) : null,
    refresh,
  );
  const quotes = useQuotes(ref ? [ref] : [], Math.min(refresh || 15, 15));
  const q = quotes.data?.quotes.find((x) => x.ref === ref);
  const candles = chart.data?.available ? chart.data.data.candles : [];
  const up =
    candles.length > 1
      ? candles[candles.length - 1].c >= candles[0].c
      : (q?.changePct ?? 0) >= 0;
  return (
    <WidgetCard
      title={q?.name ?? ref.split(':')[1] ?? 'Chart'}
      icon={ChartSpline}
      aside={
        <span className="font-mono text-xs text-muted-foreground">{range}</span>
      }
      footer={
        (q || chart.data?.available) && (
          <DataStamp
            label={q?.label ?? chart.data?.label}
            asOf={q?.asOf ?? chart.data?.asOf}
            attribution={quotes.data?.attribution ?? chart.data?.attribution}
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
            className="text-sm"
          />
        </p>
      )}
      {candles.length > 1 ? (
        <Sparkline candles={candles} up={up} />
      ) : (
        <div className="mt-2">
          <ChartState res={chart} />
        </div>
      )}
    </WidgetCard>
  );
}

type ChartApi = import('lightweight-charts').IChartApi;

/**
 * Any CSS colour as rgba(). lightweight-charts parses hex and rgb() only,
 * while the site's theme colours are oklch(); drawing one pixel lets the
 * browser do the conversion.
 */
function toRgba(color: string): string {
  const ctx = document
    .createElement('canvas')
    .getContext('2d', { willReadFrequently: true });
  if (!ctx) return 'rgb(107, 114, 128)';
  ctx.fillStyle = 'rgb(107, 114, 128)';
  ctx.fillStyle = color; // left as is if the browser can't parse `color`
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`;
}

/** Creates a lightweight-charts chart in `el`, matched to the page's colours. */
async function makeChart(el: HTMLElement, height: number): Promise<ChartApi> {
  const lc = await import('lightweight-charts');
  const style = getComputedStyle(el);
  return lc.createChart(el, {
    height,
    autoSize: true,
    layout: {
      background: { color: 'transparent' },
      textColor: toRgba(style.color),
      fontFamily: style.fontFamily,
      // The library's licence requires crediting TradingView with a link to
      // tradingview.com; this on-chart logo is its documented way to do so.
      attributionLogo: true,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: { color: 'rgba(128,128,128,0.15)' },
    },
    rightPriceScale: { borderVisible: false },
    timeScale: {
      borderVisible: false,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: { mode: lc.CrosshairMode.Magnet },
    localization: { priceFormatter: (p: number) => fmtPrice(p) },
  });
}

export function CandleChartWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '');
  const [range, setRange] = useState(String(config.range ?? '1M'));
  useEffect(() => setRange(String(config.range ?? '1M')), [config.range]);
  const res = useMarket<ChartData>(
    ref ? chartPath(ref, range) : null,
    num(config.refresh, 60),
  );
  const host = useRef<HTMLDivElement>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const candles = useMemo(
    () => (res.data?.available ? res.data.data.candles : []),
    [res.data],
  );
  const daily = res.data?.data.interval === 'ONE_DAY';

  useEffect(() => {
    if (!host.current || candles.length === 0) return;
    let chart: ChartApi | null = null;
    let cancelled = false;
    void (async () => {
      const lc = await import('lightweight-charts');
      if (cancelled || !host.current) return;
      chart = await makeChart(host.current, 300);
      const series = chart.addSeries(lc.CandlestickSeries, {
        upColor: '#16a34a',
        downColor: '#dc2626',
        borderVisible: false,
        wickUpColor: '#16a34a',
        wickDownColor: '#dc2626',
      });
      series.setData(
        candles.map((c) => ({
          time: timeOf(c, daily) as import('lightweight-charts').Time,
          open: c.o,
          high: c.h,
          low: c.l,
          close: c.c,
        })),
      );
      chart.timeScale().fitContent();
      setDrawFailed(false);
    })().catch(() => {
      if (!cancelled) setDrawFailed(true);
    });
    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [candles, daily]);

  const first = candles[0];
  const last = candles[candles.length - 1];
  return (
    <WidgetCard
      title={`${ref.split(':')[1] ?? ''} · candlestick`}
      icon={ChartCandlestick}
      aside={
        <div className="flex gap-0.5" role="tablist" aria-label="Chart range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === range}
              onClick={() => setRange(r)}
              className={cn(
                'rounded px-2 py-1 font-mono text-[11px]',
                r === range
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {r}
            </button>
          ))}
        </div>
      }
      footer={
        res.data?.available && (
          <DataStamp
            label={res.data.label}
            asOf={res.data.asOf}
            attribution={res.data.attribution}
          />
        )
      }
    >
      {drawFailed ? (
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
                className="text-xs"
              />{' '}
              <span className="text-xs text-muted-foreground">
                over {range}
              </span>
            </p>
          )}
          <div ref={host} className="h-[300px] w-full" />
        </>
      ) : (
        <ChartState res={res} />
      )}
    </WidgetCard>
  );
}

export function StockCompareWidget({ config }: { config: WidgetConfig }) {
  const refs = (
    Array.isArray(config.symbols) ? (config.symbols as string[]) : []
  ).slice(0, 4);
  const range = String(config.range ?? '6M');
  // Four fixed slots keep the hook order stable whatever the config holds.
  const a = useMarket<ChartData>(refs[0] ? chartPath(refs[0], range) : null, 0);
  const b = useMarket<ChartData>(refs[1] ? chartPath(refs[1], range) : null, 0);
  const c = useMarket<ChartData>(refs[2] ? chartPath(refs[2], range) : null, 0);
  const d = useMarket<ChartData>(refs[3] ? chartPath(refs[3], range) : null, 0);
  const results = [a, b, c, d].slice(0, refs.length);
  const series = useMemo(
    () =>
      results.map((r, i) => {
        const candles = r.data?.available ? r.data.data.candles : [];
        const base = candles[0]?.c;
        return {
          ref: refs[i],
          color: COLORS[i],
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
    if (!host.current || !ready) return;
    let chart: ChartApi | null = null;
    let cancelled = false;
    void (async () => {
      const lc = await import('lightweight-charts');
      if (cancelled || !host.current) return;
      chart = await makeChart(host.current, 280);
      chart.applyOptions({
        localization: { priceFormatter: (p: number) => fmtPct(p) },
      });
      for (const s of series) {
        if (s.points.length < 2) continue;
        const line = chart.addSeries(lc.LineSeries, {
          color: s.color,
          lineWidth: 2,
          priceLineVisible: false,
        });
        line.setData(
          s.points.map((p) => ({
            time: timeOf(
              { t: p.t } as Candle,
              s.daily,
            ) as import('lightweight-charts').Time,
            value: p.v,
          })),
        );
      }
      chart.timeScale().fitContent();
      setDrawFailed(false);
    })().catch(() => {
      if (!cancelled) setDrawFailed(true);
    });
    return () => {
      cancelled = true;
      chart?.remove();
    };
  }, [series, ready]);

  const loading = results.some((r) => r.loading && !r.data);
  const stamp = results.find((r) => r.data?.available)?.data;
  return (
    <WidgetCard
      title={`Comparison · ${range}`}
      icon={GitCompareArrows}
      footer={
        stamp && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={stamp.attribution}
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
                    style={{ background: s.color }}
                    aria-hidden="true"
                  />
                  <span className="font-medium">{s.ref.split(':')[1]}</span>
                  {last ? (
                    <Change
                      change={null}
                      pct={last.v}
                      showAbs={false}
                      className="text-xs"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      no data
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div ref={host} className="h-[280px] w-full" />
          <p className="mt-2 text-xs text-muted-foreground">
            Change since the start of the period, in %.
          </p>
        </>
      ) : loading ? (
        <WidgetSkeleton rows={5} />
      ) : (
        <WidgetMessage
          kind={
            results.some((r) => r.data?.reason === 'rights')
              ? 'rights'
              : 'error'
          }
        >
          {undefined}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}
