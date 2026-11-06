'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ISeriesApi } from 'lightweight-charts';
import { ToggleGroup, ToggleGroupItem } from '@/components/public/ui/ToggleGroup';
import { useMarket, useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { fmtPrice, fmtStamp } from '@/components/widgets/format';
import {
  applyChartColors,
  candleColors,
  candleTime,
  createLwChart,
  watchChartColors,
  type ChartApi,
} from '@/components/widgets/lw-chart';
import { useInView } from '@/lib/hooks/useInView';
import { clsx } from 'clsx';
import { marketPath, type ChartRange } from '@/market/paths';
import type { Candle, ChartData, DataRight, InstrumentKind } from '@/market/types';
import { fmtDay, isIntraday, rangeStart, seriesEnd, shortSince } from './chart-utils';
import {
  COPY,
  contractHeader,
  noIntradayText,
  rangeWords,
  shortHistoryReason,
  sinceWords,
} from './copy';
import { BOX, contractMonth, ModuleError, ModuleHead } from './parts';
import { Stamp } from './Stamp';

export type PriceChartInstrument = 'index' | 'stock' | 'commodity';
export type PriceChartMode = 'candles' | 'compare';
type Res = { data?: ChartData; error?: string; loading: boolean };

const INDEX_RANGES: ChartRange[] = ['1M', '6M', '1Y'];
const ALL_RANGES: ChartRange[] = ['1D', '5D', '1M', '6M', '1Y'];
const COMMODITY_COMPARE: ChartRange[] = ['6M', '1Y'];
/** Compare is offered only when every series has this many sessions (spec §4.10). */
const MIN_COMPARE_SESSIONS = 60;
const DAY_MS = 86_400_000;

/**
 * The price chart (spec §4.10, §5.10.1–2, §5.13): lightweight-charts 5.2.1
 * through lw-chart.ts (a dynamic import; candles in --sv-up / --sv-down read
 * at mount; the TradingView logo kept). Heights 260 / 300 / 360 px.
 *
 * - Header: the name, and for MCX and CDS instruments the contract the API
 *   charts ("Gold · Dec future (GOLD26DECFUT)").
 * - Ranges (a ToggleGroup, 44 px): indices "3 months · 6 months · 1 year"
 *   (Daily; never 1D or 5D); stocks and commodities "1 day · 5 days · 1
 *   month · 6 months · 1 year", the intraday ones disabled with "Needs our
 *   live data licence" unless the licence is LIVE. Several `refs` with
 *   Candles only (the Commodities hub) add a scrollable instrument toggle.
 * - Short history: a first candle more than 7 days after the range's start
 *   makes the caption say "since 2 Jul 2026, when this contract began
 *   trading" (stocks: "…, the earliest price we have"), and longer ranges
 *   are disabled with their reason.
 * - An intraday range answered with daily candles shows "Intraday prices
 *   aren't available for …" instead of a chart: never days under an
 *   intraday label.
 * - Compare (`modes` includes it): rebased % lines for 2–4 refs in
 *   --sv-series-*, from the latest first date among them, offered only when
 *   every series has ≥ 60 sessions; a compare-only chart is left out
 *   otherwise.
 * - The figcaption sentence, then a Stamp beside the TradingView logo; on
 *   hubs (`numbers`) "Show the numbers" with the last 10 closes.
 * - `load` (default 'view'): mounts and fetches within 200 px of the
 *   viewport after hydration; 'eager' at mount; 'interaction' on the first
 *   pointer, touch or focus inside it. Only "1 day" refreshes (60 s, while
 *   selected and in view); other ranges load once.
 * - Refused by the licence: "Charts aren't available under our current
 *   market-data licence." ("Intraday charts…" for 1 day and 5 days). An
 *   unknown instrument (404) renders nothing.
 */
export function PriceChart({
  refs,
  names,
  instrument,
  defaultRange,
  modes = ['candles'],
  height,
  load = 'view',
  numbers = false,
  boxed = true,
  right: knownRight,
  title,
  className,
}: {
  refs: string[];
  names: Record<string, string>;
  instrument: PriceChartInstrument;
  defaultRange: '1M' | '6M' | '1Y' | '1D';
  modes?: PriceChartMode[];
  /** A fixed canvas height (default 260 / 300 / 360 by width). */
  height?: number;
  load?: 'eager' | 'view' | 'interaction';
  /** "Show the numbers" (hubs). */
  numbers?: boolean;
  /** Draw the hub box around it (default true). */
  boxed?: boolean;
  /**
   * The licence when the page already knows it from its server snapshot
   * (the stock page): no wait for the stream before an intraday range.
   * Otherwise it is read from the live snapshot.
   */
  right?: DataRight;
  /**
   * Additive (W5): the header in Compare mode instead of the series names
   * ("Gold and silver, rebased" on the Commodities hub, spec §5.10.2).
   */
  title?: string;
  className?: string;
}) {
  const index = instrument === 'index';
  const list = useMemo(() => refs.map((r) => r.trim().toUpperCase()).filter(Boolean), [refs]);
  const snap = useSnapshot(15);
  const right = knownRight ?? snap.data?.right;
  const [mode, setMode] = useState<PriceChartMode>(modes[0] ?? 'candles');
  const [pick, setPick] = useState(0);
  const selector = !modes.includes('compare') && list.length > 1;
  const ref = list[selector ? Math.min(pick, list.length - 1) : 0] ?? '';
  const ranges =
    mode === 'compare' ? (index ? INDEX_RANGES : COMMODITY_COMPARE) : index ? INDEX_RANGES : ALL_RANGES;
  const [chosen, setChosen] = useState<ChartRange>(
    index && isIntraday(defaultRange) ? '1M' : defaultRange,
  );
  const range: ChartRange = ranges.includes(chosen) ? chosen : (ranges[1] ?? ranges[0]);

  // Activation (`load`): nothing is fetched before it.
  const [viewRef, inView] = useInView<HTMLDivElement>({ rootMargin: '200px' });
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (load === 'eager' || (load === 'view' && inView)) setActive(true);
  }, [load, inView]);
  const wake = load === 'interaction' && !active ? () => setActive(true) : undefined;

  // The licence decides before anything is asked (spec §7.12 rule 4).
  const off = right === 'OFF';
  const intradayBlocked = !!right && right !== 'LIVE';
  const waitForLicence = !right && isIntraday(range);
  // No snapshot at all (the stream and a poll both failed): an intraday
  // range can't learn the licence, so it says the data is out instead of
  // waiting for ever behind a skeleton.
  const licenceLost = waitForLicence && !snap.data && !!snap.error;
  const blocked = off || (isIntraday(range) && intradayBlocked);
  const candlesPath =
    active && mode === 'candles' && ref && !blocked && !waitForLicence
      ? marketPath.chart(ref, range)
      : null;
  const candles = useChartData(candlesPath, range === '1D', inView);

  // Compare series (fixed slots keep the hook order): fetched in Compare
  // mode, and on a daily range in Candles mode to decide whether to offer it.
  const cmpOn = modes.includes('compare') && list.length > 1 && active && !off;
  const cmpRange: ChartRange = isIntraday(range) ? '6M' : range;
  const slot = (i: number) =>
    cmpOn && list[i] && i < 4 ? marketPath.chart(list[i], cmpRange) : null;
  const c0 = useChartData(slot(0), false, inView);
  const c1 = useChartData(slot(1), false, inView);
  const c2 = useChartData(slot(2), false, inView);
  const c3 = useChartData(slot(3), false, inView);
  const cmp = [c0, c1, c2, c3].slice(0, Math.min(4, list.length));

  // What we've learnt about each instrument's history (the short-history rule).
  const [since, setSince] = useState<Record<string, { first: number; end: number }>>({});
  const loaded = candles.data;
  useEffect(() => {
    if (!loaded?.available || mode !== 'candles') return;
    const cs = loaded.data.candles;
    if (!cs.length || isIntraday(range) || loaded.data.interval !== 'ONE_DAY') return;
    const first = shortSince(cs, range, loaded.asOf, index);
    if (first === null) return;
    const end = seriesEnd(cs, loaded.asOf);
    setSince((s) => (s[ref]?.first === first ? s : { ...s, [ref]: { first, end } }));
  }, [loaded, range, ref, index, mode]);

  const q = snap.data?.instruments.find((i) => i.ref === ref);
  const kind: InstrumentKind | undefined =
    q?.kind ?? (ref.startsWith('CDS:') ? 'CURRENCY' : undefined);
  const contract = instrument === 'commodity' || /^(MCX|CDS):/.test(ref);
  const name = names[ref] ?? q?.name ?? ref.split(':')[1] ?? ref;
  const header =
    mode === 'compare'
      ? (title ?? list.map((r) => names[r] ?? r.split(':')[1]).join(', '))
      : contract && q?.contract
        ? contractHeader(name, contractMonth(q.contract), q.contract)
        : name;

  // Disabled ranges and their reasons (visible text near the group).
  const known = mode === 'candles' ? since[ref] : undefined;
  const shortest = known
    ? ranges.find(
        (r) => !isIntraday(r) && known.first - rangeStart(r, known.end, index) > 7 * DAY_MS,
      )
    : undefined;
  const reasonFor = (r: ChartRange): string | null => {
    if (isIntraday(r) && intradayBlocked) return COPY.intradayDisabled;
    if (
      known &&
      shortest &&
      r !== range &&
      ranges.indexOf(r) > ranges.indexOf(shortest)
    ) {
      return shortHistoryReason(contract, name, fmtDay(known.first));
    }
    return null;
  };
  const reasons = [...new Set(ranges.map(reasonFor).filter((x): x is string => !!x))];
  const reasonId = `sv-pc-reason-${ref.replace(/[^A-Z0-9]/gi, '')}`;

  // Compare: offered only when every series is long enough.
  const cmpReady = cmp.length > 1 && cmp.every((r) => r.data?.available);
  const rebased = useMemo(() => (cmpReady ? rebase(cmp.map((r) => r.data!)) : null), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    cmpReady, c0.data, c1.data, c2.data, c3.data,
  ]);
  const cmpOk = !!rebased && rebased.every((s) => s.points.length >= MIN_COMPARE_SESSIONS);
  const cmpSettled = cmp.every((r) => !!r.data || !!r.error);
  const compareOnly = modes.length === 1 && modes[0] === 'compare';
  useEffect(() => {
    if (mode === 'compare' && !compareOnly && cmpSettled && !cmpOk) setMode('candles');
  }, [mode, compareOnly, cmpSettled, cmpOk]);

  if (candles.error === 'not_found') return null;
  if (compareOnly && cmpSettled && cmpOn && !cmpOk) return null;
  // Under OFF a compare-only chart (the Commodities hub's gold and silver)
  // is left out: the page's main chart already says the licence line once.
  if (compareOnly && off) return null;

  const showModes = modes.length > 1 && cmpOk;
  const hClass = height ? undefined : 'h-[260px] md:h-[300px] lg:h-[360px]';
  const hStyle = height ? { height } : undefined;

  return (
    <figure
      ref={viewRef}
      className={clsx('sv-pricechart m-0', boxed && BOX, className)}
      data-market-module={
        (mode === 'candles' && candles.data?.available) || (mode === 'compare' && cmpOk)
          ? 'price-chart'
          : undefined
      }
      onPointerEnter={wake}
      onTouchStart={wake}
      onFocusCapture={wake}
    >
      <ModuleHead
        title={header}
        aside={
          showModes ? (
            <ToggleGroup
              label="Chart type"
              value={mode}
              onValueChange={(v) => setMode(v as PriceChartMode)}
            >
              {modes.map((m) => (
                <ToggleGroupItem key={m} value={m}>
                  {COPY.chartModes[m]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null
        }
      />
      {selector ? (
        <ToggleGroup
          label="Instrument"
          value={String(pick)}
          onValueChange={(v) => setPick(Number(v))}
          variant="line"
          scrollable
          className="mt-2"
        >
          {list.map((r, i) => (
            <ToggleGroupItem key={r} value={String(i)}>
              {names[r] ?? r.split(':')[1]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <ToggleGroup
          label="Chart range"
          value={range}
          onValueChange={(v) => setChosen(v as ChartRange)}
          aria-describedby={reasons.length ? reasonId : undefined}
          // Five ranges (stocks, commodities) need about 280 px even with the
          // phone padding (widgets.css): below that the group scrolls
          // sideways instead of widening the card (W6, B-2).
          scrollable
        >
          {ranges.map((r) => {
            const why = reasonFor(r);
            return (
              <ToggleGroupItem key={r} value={r} disabled={!!why} title={why ?? undefined}>
                {rangeWords(r, index)}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        {index ? <span className="t-meta text-fg-3">{COPY.daily}</span> : null}
      </div>
      {reasons.length ? (
        <p id={reasonId} className="t-meta mt-2 text-fg-3">
          {reasons.join(' · ')}
        </p>
      ) : null}
      <div className="mt-3">
        {mode === 'compare' ? (
          <CompareBody
            res={cmp}
            rebased={cmpOk ? rebased : null}
            names={names}
            hClass={hClass}
            hStyle={hStyle}
            off={off}
            active={active}
            range={range}
            index={index}
          />
        ) : (
          <CandlesBody
            res={candles}
            active={active}
            blocked={blocked}
            lost={licenceLost}
            off={off}
            range={range}
            index={index}
            contract={contract}
            name={name}
            kind={kind}
            hClass={hClass}
            hStyle={hStyle}
            numbers={numbers}
          />
        )}
      </div>
    </figure>
  );
}

/* ── Candles ─────────────────────────────────────────────────────────────── */

function CandlesBody({
  res,
  active,
  blocked,
  lost,
  off,
  range,
  index,
  contract,
  name,
  kind,
  hClass,
  hStyle,
  numbers,
}: {
  res: Res;
  active: boolean;
  blocked: boolean;
  /** No licence to go on: the snapshot never arrived. */
  lost: boolean;
  off: boolean;
  range: ChartRange;
  index: boolean;
  contract: boolean;
  name: string;
  kind?: InstrumentKind;
  hClass?: string;
  hStyle?: React.CSSProperties;
  numbers: boolean;
}) {
  if (blocked) {
    return (
      <ChartLine>
        {!off && isIntraday(range) ? COPY.chartRightsIntraday : COPY.chartRights}
      </ChartLine>
    );
  }
  const d = res.data;
  if (!d) {
    if (res.error || (lost && active)) return <ModuleError />;
    return <ChartSkeleton hClass={hClass} hStyle={hStyle} waiting={!active} />;
  }
  if (!d.available) {
    if (d.reason === 'rights') {
      return (
        <ChartLine>
          {isIntraday(range) ? COPY.chartRightsIntraday : COPY.chartRights}
        </ChartLine>
      );
    }
    return <ModuleError />;
  }
  const cs = d.data.candles;
  const daily = d.data.interval === 'ONE_DAY';
  // An intraday range answered with daily candles (the intraday call failed
  // upstream): say so, never draw days under an intraday label (§5.10.2).
  if (isIntraday(range) && daily) {
    return <ChartLine>{noIntradayText(contract, name)}</ChartLine>;
  }
  if (cs.length < 2 || !d.label || !d.asOf) return <ModuleError />;
  return (
    <ChartView
      data={d}
      stale={!!res.error}
      range={range}
      index={index}
      contract={contract}
      name={name}
      kind={kind}
      hClass={hClass}
      hStyle={hStyle}
      numbers={numbers}
    />
  );
}

/** The drawn candles, the sentence and the stamp (also the gallery's fixtures). */
export function ChartView({
  data,
  stale = false,
  range,
  index,
  contract,
  name,
  kind,
  hClass = 'h-[260px] md:h-[300px] lg:h-[360px]',
  hStyle,
  numbers = false,
}: {
  data: ChartData;
  stale?: boolean;
  range: ChartRange;
  index: boolean;
  contract: boolean;
  name: string;
  kind?: InstrumentKind;
  hClass?: string;
  hStyle?: React.CSSProperties;
  numbers?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drawn = useRef<{ chart: ChartApi; series: ISeriesApi<'Candlestick'> } | null>(null);
  const [made, setMade] = useState(0);
  const [failed, setFailed] = useState(false);
  const cs = data.data.candles;
  const daily = data.data.interval === 'ONE_DAY';

  // The chart itself, made once per mount (again only when the candle unit
  // changes between days and minutes), so the 60 s refresh of "1 day"
  // never rebuilds it: no blank frame, no lost crosshair.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let chart: ChartApi | null = null;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      const lw = await createLwChart(el, { height: el.clientHeight || 300 });
      if (cancelled) {
        lw.chart.remove();
        return;
      }
      chart = lw.chart;
      // The top and bottom tick labels sit on the pane edge and were drawn
      // half cut off ("290.00" on Natural Gas 6M at 390 px): show an edge
      // label only when it fits whole (W6 handoff nit).
      chart.priceScale('right').applyOptions({ entireTextOnly: true });
      const series = chart.addSeries(lw.lc.CandlestickSeries, candleColors(lw.colors));
      drawn.current = { chart, series };
      const live = chart;
      stop = watchChartColors(el, (colors) => {
        applyChartColors(live, colors);
        series.applyOptions(candleColors(colors));
      });
      setFailed(false);
      setMade((n) => n + 1);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      stop();
      drawn.current = null;
      chart?.remove();
    };
  }, [daily]);

  // The candles, set in place on every answer.
  useEffect(() => {
    const d = drawn.current;
    if (!d) return;
    d.series.setData(
      cs.map((c) => ({
        time: candleTime(c.t, daily),
        open: c.o,
        high: c.h,
        low: c.l,
        close: c.c,
      })),
    );
    d.chart.timeScale().fitContent();
  }, [cs, daily, made]);

  const first = cs[0];
  const last = cs[cs.length - 1];
  const since = shortSince(cs, range, data.asOf, index);
  const pct = first.c ? ((last.c - first.c) / first.c) * 100 : 0;
  const lastDay = fmtDay(last.t);
  // "closed at" for a finished session; "was at" while the label is Live.
  const verb = data.label === 'LIVE' ? 'was at' : 'closed at';
  const span = since ? sinceWords(contract, fmtDay(since)) : `over ${rangeWords(range, index)}`;
  const sentence = `${name} ${verb} ${fmtPrice(last.c, kind)} on ${lastDay}, ${
    pct >= 0 ? 'up' : 'down'
  } ${Math.abs(pct).toFixed(1)}% ${span}.`;

  return (
    <>
      {failed ? (
        <ChartLine>This chart couldn’t be drawn.</ChartLine>
      ) : (
        <div ref={host} className={clsx('sv-chart-host w-full', hClass)} style={hStyle} />
      )}
      <figcaption className="t-small mt-3 text-fg-2">{sentence}</figcaption>
      <div className="sv-mk-foot">
        <Stamp label={data.label} asOf={data.asOf} attribution={data.attribution} stale={stale} />
      </div>
      {numbers ? <Numbers candles={cs} daily={daily} kind={kind} /> : null}
    </>
  );
}

/** "Show the numbers": the last 10 closes (hubs). */
function Numbers({
  candles,
  daily,
  kind,
}: {
  candles: Candle[];
  daily: boolean;
  kind?: InstrumentKind;
}) {
  const rows = candles.slice(-10).reverse();
  return (
    <details className="sv-chart-numbers mt-3">
      <summary className="t-small">{COPY.showNumbers}</summary>
      <table className="sv-mk-table mt-2 w-full">
        <caption className="sr-only">The last {rows.length} closes</caption>
        <thead>
          <tr>
            <th scope="col">{daily ? 'Date' : 'Time'}</th>
            <th scope="col" className="text-right">
              Close
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.t}>
              <td className="t-small">
                {daily ? fmtDay(c.t) : fmtStamp(new Date(c.t).toISOString())}
              </td>
              <td className="t-num text-right">{fmtPrice(c.c, kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ── Compare ─────────────────────────────────────────────────────────────── */

type Rebased = { ref: string; slot: number; points: { t: number; v: number }[]; data: ChartData };

/** Rebases each series to % from the latest first date among them. */
function rebase(series: ChartData[]): Rebased[] {
  const start = Math.max(...series.map((s) => s.data.candles[0]?.t ?? Infinity));
  return series.map((s, slot) => {
    const cs = s.data.candles.filter((c) => c.t >= start);
    const base = cs[0]?.c;
    return {
      ref: s.data.ref,
      slot,
      data: s,
      points: base ? cs.map((c) => ({ t: c.t, v: ((c.c - base) / base) * 100 })) : [],
    };
  });
}

function CompareBody({
  res,
  rebased,
  names,
  hClass,
  hStyle,
  off,
  active,
  range,
  index,
}: {
  res: Res[];
  rebased: Rebased[] | null;
  names: Record<string, string>;
  hClass?: string;
  hStyle?: React.CSSProperties;
  off: boolean;
  /** Fetching has started (the chart came near the viewport, or was used). */
  active: boolean;
  range: ChartRange;
  index: boolean;
}) {
  if (off || res.some((r) => r.data?.reason === 'rights')) {
    return <ChartLine>{COPY.chartRights}</ChartLine>;
  }
  if (!rebased) {
    if (res.some((r) => !r.data && r.error) || res.some((r) => r.data && !r.data.available)) {
      return <ModuleError />;
    }
    return <ChartSkeleton hClass={hClass} hStyle={hStyle} waiting={!active} />;
  }
  return (
    <CompareView
      series={rebased}
      names={names}
      stale={res.some((r) => !!r.error)}
      hClass={hClass}
      hStyle={hStyle}
      range={range}
      index={index}
    />
  );
}

function CompareView({
  series,
  names,
  stale,
  hClass,
  hStyle,
  range,
  index,
}: {
  series: Rebased[];
  names: Record<string, string>;
  stale: boolean;
  hClass?: string;
  hStyle?: React.CSSProperties;
  range: ChartRange;
  index: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const nameOf = (ref: string) => names[ref] ?? ref.split(':')[1] ?? ref;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let chart: ChartApi | null = null;
    let stop = () => {};
    let cancelled = false;
    void (async () => {
      const made = await createLwChart(el, { height: el.clientHeight || 300, percent: true });
      if (cancelled) {
        made.chart.remove();
        return;
      }
      chart = made.chart;
      chart.priceScale('right').applyOptions({ entireTextOnly: true });
      const lines: { line: { applyOptions(o: { color: string }): void }; slot: number }[] = [];
      for (const s of series) {
        const line = chart.addSeries(made.lc.LineSeries, {
          color: made.colors.series[s.slot],
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          // The name on the price axis at the line's end (spec §4.10).
          title: nameOf(s.ref),
        });
        line.setData(s.points.map((p) => ({ time: candleTime(p.t, true), value: p.v })));
        lines.push({ line, slot: s.slot });
      }
      chart.timeScale().fitContent();
      const drawn = chart;
      stop = watchChartColors(el, (colors) => {
        applyChartColors(drawn, colors);
        for (const l of lines) l.line.applyOptions({ color: colors.series[l.slot] });
      });
      setFailed(false);
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
      stop();
      chart?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const start = series[0]?.points[0]?.t;
  const stamp = series[0].data;
  return (
    <>
      <ul className="sv-compare-legend t-small">
        {series.map((s) => {
          const end = s.points[s.points.length - 1];
          return (
            <li key={s.ref}>
              <span className="sv-compare-key" data-slot={s.slot + 1} aria-hidden="true" />
              <span className="font-semibold text-fg">{nameOf(s.ref)}</span>{' '}
              {end ? <Change change={null} pct={end.v} showAbs={false} /> : null}
            </li>
          );
        })}
      </ul>
      {failed ? (
        <ChartLine>This chart couldn’t be drawn.</ChartLine>
      ) : (
        <div ref={host} className={clsx('sv-chart-host mt-3 w-full', hClass)} style={hStyle} />
      )}
      <figcaption className="t-small mt-3 text-fg-2">
        {start
          ? `Change in per cent since ${fmtDay(start)}, when every line starts (${rangeWords(range, index)}, daily).`
          : null}
      </figcaption>
      <div className="sv-mk-foot">
        <Stamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={stamp.attribution}
          stale={stale}
        />
      </div>
    </>
  );
}

/* ── Shared ──────────────────────────────────────────────────────────────── */

/**
 * One chart address. "1 day" (`live`) refreshes every 60 s, and only while
 * the chart is in view (spec §5.13, §7.12 rule 5): out of view it keeps its
 * subscription (and any answer on its way) but stops polling, and catches
 * up when it is back if the minute has passed. Every address also keeps its
 * last answer here, so a switch back to a range already seen shows it at
 * once, with no skeleton, until the new answer arrives.
 */
function useChartData(path: string | null, live: boolean, inView: boolean): Res {
  const res = useMarket<ChartData>(path, live && inView ? 60 : 0);
  const [kept, setKept] = useState<Record<string, ChartData>>({});
  const fresh = res.data;
  useEffect(() => {
    if (!path || fresh === undefined) return;
    setKept((k) => (k[path] === fresh ? k : { ...k, [path]: fresh }));
  }, [path, fresh]);
  const data = fresh ?? (path ? kept[path] : undefined);
  return { data, error: res.error, loading: data === undefined && !res.error };
}

/** One honest line in place of the chart (licence, intraday fallback). */
function ChartLine({ children }: { children: React.ReactNode }) {
  return <p className="t-small text-fg-2">{children}</p>;
}

/** The chart's loading box (also the design gallery's fixtures). */
export function ChartSkeleton({
  hClass,
  hStyle,
  waiting,
}: {
  hClass?: string;
  hStyle?: React.CSSProperties;
  waiting: boolean;
}) {
  return (
    <div
      className={clsx('sv-chart-skeleton w-full rounded-[4px]', hClass)}
      style={hStyle}
      aria-busy={waiting ? undefined : true}
      aria-label={waiting ? undefined : COPY.loading}
      role={waiting ? undefined : 'group'}
    />
  );
}
