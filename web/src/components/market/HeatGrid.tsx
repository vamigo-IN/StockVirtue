'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { openWideDisclosures } from '@/lib/disclosure';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/public/ui/Tabs';
import { useSnapshot } from '@/components/widgets/data';
import { fmtPct } from '@/components/widgets/format';
import { clsx } from 'clsx';
import { marketPath, type HeatmapIndex } from '@/market/paths';
import type { Labelled, ListRow } from '@/market/types';
import { BreadthBar } from './BreadthBar';
import { COPY, heatCaption, showMore } from './copy';
import { BOX, ModuleError, ModuleHead, StockName } from './parts';
import { Stamp } from './Stamp';
import { useInViewMarket, type InViewMarket } from './useInViewMarket';
import { useQuotable } from './useQuotable';

/**
 * The alternative view slot (spec §4.10, §6.7; F06). W5 passes the Nifty
 * Field. HeatGrid owns the mode, the highlighted symbol and both buttons.
 */
export type HeatGridAlt = {
  /** The header button's text ("View in 3D"). */
  label: string;
  /** Run once in an effect after mount; the button shows only if it passes. */
  available: () => boolean;
  render: (p: {
    rows: ListRow[];
    index: string;
    highlighted: string | null;
    /**
     * Back to the tiles. HeatGrid runs `available()` again and, if focus
     * was in the card, moves it to the alt button when it is still offered,
     * else to the selected index tab (spec §6.7, a give-up).
     */
    exit: () => void;
    /**
     * Additive (beyond plan Appendix A): the tiles themselves, for the alt
     * view to keep showing while it loads or after it fails to load (spec
     * §6.7: "While it loads, the tiles stay"). Ignore it otherwise.
     */
    grid: ReactNode;
  }) => ReactNode;
};

type HeatRes = Pick<InViewMarket<Labelled<ListRow[]>>, 'data' | 'error' | 'loading'>;

const INDEXES: HeatmapIndex[] = ['NIFTY', 'BANKNIFTY', 'SENSEX'];

/**
 * The seven heat bins by the day's % change (spec §3.1.1): ≤ −2, −2 to −1,
 * −1 to −0.25, ±0.25, +0.25 to +1, +1 to +2, ≥ +2. The fills are the
 * bg-heat-* names (so the blue/orange palette follows); the text colour on
 * each fill is in widgets.css (.sv-heat[data-bin]).
 */
export type HeatBin = 'n3' | 'n2' | 'n1' | '0' | 'p1' | 'p2' | 'p3';
export function heatBin(pct: number): HeatBin {
  if (pct <= -2) return 'n3';
  if (pct <= -1) return 'n2';
  if (pct <= -0.25) return 'n1';
  if (pct < 0.25) return '0';
  if (pct < 1) return 'p1';
  if (pct < 2) return 'p2';
  return 'p3';
}
const FILL: Record<HeatBin, string> = {
  n3: 'bg-heat-n3',
  n2: 'bg-heat-n2',
  n1: 'bg-heat-n1',
  '0': 'bg-heat-0',
  p1: 'bg-heat-p1',
  p2: 'bg-heat-p2',
  p3: 'bg-heat-p3',
};
const LEGEND: HeatBin[] = ['n3', 'n2', 'n1', '0', 'p1', 'p2', 'p3'];

/** "Reliance, up 1.24%" */
function tileLabel(r: ListRow): string {
  const pct = r.changePct ?? 0;
  if (pct === 0) return `${r.name}, unchanged`;
  return `${r.name}, ${pct > 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(2)}%`;
}

/**
 * The index heatmap (spec §4.10, §5.10.1): Radix Tabs [Nifty 50 · Bank
 * Nifty · Sensex] (`heatmap?index=`, 60 s, the selected index only, near
 * the viewport only). Equal tiles on a 2 px grid (up to 10 columns from
 * 1024 px and 8 from 768, never narrower than 80 px so every symbol shows
 * whole; up to 5 on phones, never narrower than 64 px; widgets.css), each
 * the symbol and the signed % on its heat fill; a tile links to its stock
 * page (never prefetched) only when
 * quotable. A legend, then the sorted list:
 * - phones show the list by default (the five biggest risers, "Show {n}
 *   more" for the middle rows, the five biggest fallers; spec §8.1 item
 *   12), with "Show as tiles";
 * - from 768 px the tiles show, with a "View as list" disclosure under them.
 * Then BreadthBar, the caption and a Stamp. LIVE only.
 *
 * `alt` (the Nifty Field): after mount HeatGrid runs `alt.available()`; if
 * it passes, `alt.label` is a secondary button in the header. Pressing it
 * renders `alt.render({ rows, index, highlighted, exit })` in place of the
 * tiles, with "Back to the grid" (which calls `exit()`). Hovering or
 * focusing a list row sets `highlighted` to its symbol; leaving clears it.
 */
export function HeatGrid({
  defaultIndex = 'NIFTY',
  alt,
  boxed = true,
  className,
}: {
  defaultIndex?: HeatmapIndex;
  alt?: HeatGridAlt;
  /**
   * Its own hub box (radius 12, hairline, white; default). False inside a
   * card that already is one (the Markets hub's phone tab card), which also
   * gives the tiles the full width: five 64 px columns from 360 px.
   */
  boxed?: boolean;
  className?: string;
}) {
  const snap = useSnapshot(15);
  const quotable = useQuotable();
  const [index, setIndex] = useState<HeatmapIndex>(defaultIndex);
  const right = snap.data?.right;
  const res = useInViewMarket<Labelled<ListRow[]>>(
    right === 'LIVE' ? marketPath.heatmap(index) : null,
    60,
  );
  if (right && right !== 'LIVE') return null;
  const failed = !snap.data && !!snap.error;
  return (
    <div ref={res.ref} className={className}>
      <HeatGridView
        index={index}
        onIndexChange={setIndex}
        res={failed && !res.data ? { loading: false, error: 'unavailable' } : res}
        quotable={quotable}
        alt={alt}
        boxed={boxed}
      />
    </div>
  );
}

/** The heatmap for a resolved answer (also the design gallery's fixtures). */
export function HeatGridView({
  index,
  onIndexChange,
  res,
  quotable,
  alt,
  boxed = true,
  className,
}: {
  index: HeatmapIndex;
  onIndexChange?: (index: HeatmapIndex) => void;
  res: HeatRes;
  quotable: Set<string>;
  alt?: HeatGridAlt;
  boxed?: boolean;
  className?: string;
}) {
  const [mode, setMode] = useState<'grid' | 'alt'>('grid');
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [phoneView, setPhoneView] = useState<'list' | 'tiles'>('list');
  const [listOpen, setListOpen] = useState(false);
  const [altOk, setAltOk] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const altBtn = useRef<HTMLButtonElement>(null);
  const tryAlt = useCallback(() => {
    try {
      return !!alt?.available();
    } catch {
      return false;
    }
  }, [alt]);
  useEffect(() => {
    const ok = tryAlt();
    setAltOk(ok);
    if (!ok) setMode('grid');
  }, [tryAlt]);
  const exit = useCallback(() => {
    const root = rootRef.current;
    const active = typeof document === 'undefined' ? null : document.activeElement;
    const hadFocus = !!root && (root.contains(active) || active === document.body);
    const ok = tryAlt();
    setAltOk(ok);
    setMode('grid');
    if (!hadFocus) return;
    requestAnimationFrame(() => {
      const target = ok
        ? altBtn.current
        : root?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      target?.focus();
    });
  }, [tryAlt]);

  const payload = res.data;
  const rows = (payload?.available ? payload.data : [])
    .filter((r) => r.changePct !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const shows = !!payload?.available && rows.length > 0 && !!payload.label && !!payload.asOf;
  const indexName = COPY.heatTabs[index];
  const showAlt = mode === 'alt' && altOk && !!alt && shows;

  const tiles = () => (
    <ul className="sv-heat-tiles mt-3" aria-label={`${indexName} heatmap`}>
      {rows.map((r) => {
        const bin = heatBin(r.changePct ?? 0);
        const label = tileLabel(r);
        const tip = `${r.name} (${r.symbol}) ${fmtPct(r.changePct)}`;
        const face = (
          <>
            <span className="sv-heat-sym" aria-hidden="true">{r.symbol}</span>
            <span className="sv-heat-pct" aria-hidden="true">{fmtPct(r.changePct)}</span>
          </>
        );
        return (
          <li key={r.ref}>
            {quotable.has(r.ref) ? (
              <StockName
                refId={r.ref}
                quotable
                aria-label={label}
                title={tip}
                data-bin={bin}
                className={clsx('sv-heat sv-heat-tile', FILL[bin])}
              >
                {face}
              </StockName>
            ) : (
              <div className={clsx('sv-heat sv-heat-tile', FILL[bin])} data-bin={bin} title={tip}>
                {face}
                <span className="sr-only">{label}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  const listId = `sv-heat-list-${index}`;
  const body = !payload ? (
    res.loading ? (
      <div
        className="sv-heat-skeleton"
        aria-busy="true"
        aria-label={COPY.loading}
        role="group"
      />
    ) : (
      <ModuleError className="mt-3" />
    )
  ) : !shows ? (
    <ModuleError className="mt-3">
      {payload.reason === 'rights' ? COPY.rights : undefined}
    </ModuleError>
  ) : (
    <>
      {showAlt ? (
        <div className="sv-heat-alt mt-3">
          {alt.render({ rows, index, highlighted, exit, grid: tiles() })}
        </div>
      ) : (
        tiles()
      )}
      <HeatLegend />
      <div className="sv-heat-toggles">
        <button
          type="button"
          className="sv-heat-phonetoggle sv-quiet t-small"
          onClick={() => setPhoneView((v) => (v === 'list' ? 'tiles' : 'list'))}
        >
          {phoneView === 'list' ? COPY.showAsTiles : COPY.showAsList}
        </button>
        <button
          type="button"
          className="sv-heat-listtoggle sv-quiet t-small"
          aria-expanded={listOpen}
          aria-controls={listId}
          onClick={() => setListOpen((v) => !v)}
        >
          {COPY.viewAsList}
        </button>
      </div>
      <HeatList
        id={listId}
        rows={rows}
        quotable={quotable}
        onHighlight={setHighlighted}
      />
      <BreadthBar rows={rows} indexName={indexName} className="mt-4" />
      {/* The tiles' caption; the alt view (the Nifty Field) brings its own
          under its canvas (spec §6.7), so it isn't repeated there. */}
      {showAlt ? null : (
        <p className="sv-heat-caption t-meta mt-2 text-fg-3">{heatCaption(indexName)}</p>
      )}
      <div className="sv-mk-foot">
        <Stamp
          label={payload.label}
          asOf={payload.asOf}
          attribution={payload.attribution}
          stale={!!res.error}
        />
      </div>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={clsx('sv-heatgrid', boxed && BOX, className)}
      data-market-module={shows ? 'heatmap' : undefined}
      data-phone-view={phoneView}
      data-list-open={listOpen ? '' : undefined}
      data-mode={showAlt ? 'alt' : 'grid'}
    >
      <ModuleHead
        title="Heatmap"
        aside={
          altOk && alt && shows ? (
            showAlt ? (
              <button
                ref={altBtn}
                type="button"
                className="sv-btn sv-btn-secondary"
                data-size="sm"
                onClick={exit}
              >
                {COPY.backToGrid}
              </button>
            ) : (
              <button
                ref={altBtn}
                type="button"
                className="sv-btn sv-btn-secondary"
                data-size="sm"
                onClick={() => setMode('alt')}
              >
                {alt.label}
              </button>
            )
          ) : null
        }
      />
      <Tabs
        value={index}
        onValueChange={(v) => {
          setHighlighted(null);
          onIndexChange?.(v as HeatmapIndex);
        }}
        className="mt-2"
      >
        <TabsList aria-label="Index" scrollable>
          {INDEXES.map((i) => (
            <TabsTrigger key={i} value={i}>
              {COPY.heatTabs[i]}
            </TabsTrigger>
          ))}
        </TabsList>
        {INDEXES.map((i) => (
          <TabsContent key={i} value={i}>
            {i === index ? body : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * The scale (design I): the seven swatches as one bar, the bin edges
 * labelled under it in mono ("−2%", "−1%", "0", "+1%", "+2%"; the ends from
 * COPY.heatLegend). Decorative: each tile prints its own %.
 */
const LEGEND_TICKS: readonly { at: number; text: string }[] = [
  { at: 1 / 7, text: COPY.heatLegend.low },
  { at: 2 / 7, text: '−1%' },
  { at: 3.5 / 7, text: '0' },
  { at: 5 / 7, text: '+1%' },
  { at: 6 / 7, text: COPY.heatLegend.high },
];
function HeatLegend() {
  return (
    <div className="sv-heat-legend sv-heat-scale" aria-hidden="true">
      <span className="sv-heat-scale-bar">
        {LEGEND.map((b) => (
          <span key={b} className={FILL[b]} />
        ))}
      </span>
      <span className="sv-heat-scale-ticks">
        {LEGEND_TICKS.map((t) => (
          <span key={t.text} style={{ left: `${(t.at * 100).toFixed(3)}%` }}>
            {t.text}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * The sorted list: the five biggest risers, then "Show {n} more" (a
 * PhoneDisclosure, closed on phones and open from 768 px) for the middle,
 * then the five biggest fallers. Rows: the name (a link only when
 * quotable), the %, a 24 px swatch.
 */
function HeatList({
  id,
  rows,
  quotable,
  onHighlight,
}: {
  id: string;
  rows: ListRow[];
  quotable: Set<string>;
  onHighlight: (symbol: string | null) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  // Mounted after hydration (when the data arrives): open the middle rows'
  // disclosure from 768 px, as DISCLOSURE_SCRIPT does for server HTML.
  useLayoutEffect(() => {
    if (root.current) openWideDisclosures(root.current);
  }, [rows.length]);
  const head = rows.length > 10 ? rows.slice(0, 5) : rows;
  const middle = rows.length > 10 ? rows.slice(5, -5) : [];
  const tail = rows.length > 10 ? rows.slice(-5) : [];
  const row = (r: ListRow) => {
    const pct = r.changePct ?? 0;
    return (
      <li
        key={r.ref}
        onMouseEnter={() => onHighlight(r.symbol)}
        onMouseLeave={() => onHighlight(null)}
        onFocus={() => onHighlight(r.symbol)}
        onBlur={() => onHighlight(null)}
      >
        <StockName refId={r.ref} quotable={quotable.has(r.ref)} className="t-small sv-heat-name">
          {r.name}
        </StockName>
        <span className={clsx('t-num', pct > 0 ? 'text-up' : pct < 0 ? 'text-down' : 'text-fg-3')}>
          {fmtPct(pct)}
        </span>
        <span className={clsx('sv-heat-swatch', FILL[heatBin(pct)])} aria-hidden="true" />
      </li>
    );
  };
  return (
    <div ref={root} id={id} className="sv-heat-list">
      <ul>{head.map(row)}</ul>
      {middle.length ? (
        <PhoneDisclosure variant="tail" summary={showMore(middle.length)}>
          <ul>{middle.map(row)}</ul>
        </PhoneDisclosure>
      ) : null}
      {tail.length ? <ul>{tail.map(row)}</ul> : null}
    </div>
  );
}
