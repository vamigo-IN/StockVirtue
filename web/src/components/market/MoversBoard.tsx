'use client';

import { useCallback, useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/public/ui/Tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/public/ui/ToggleGroup';
import { useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { fmtVolume, stampOf } from '@/components/widgets/format';
import { clsx } from 'clsx';
import { marketPath, type CapSegment, type MoversType } from '@/market/paths';
import type { DataLabel, Labelled, ListRow } from '@/market/types';
import { activeFootnote, COPY, moversFootnote, volText } from './copy';
import { BOX, ModuleError, ModuleHead, ModuleSkeleton, StockName } from './parts';
import { PriceCell } from './PriceCell';
import { Stamp } from './Stamp';
import { useInViewMarket, type InViewMarket } from './useInViewMarket';
import { STACKED_PANEL, useMinWidth } from './useMinWidth';
import { useQuotable } from './useQuotable';

export type MoversVariant = 'home' | 'rail' | 'hub';
type MoversRes = Pick<InViewMarket<Labelled<ListRow[]>>, 'data' | 'error' | 'loading'>;
/** What a list's answer says about its prices, for the home variant's one Stamp. */
type ListStampInfo = { label: DataLabel; asOf: string; attribution: string; stale: boolean };

const ROWS: Record<MoversVariant, number> = { home: 5, rail: 5, hub: 10 };
/** The magnitude bar's full length is a 5% move. */
const BAR_CAP = 5;

/**
 * "Biggest moves" (spec §4.10): Radix Tabs [Gainers · Losers · Most
 * active]; on the hub a ToggleGroup [Large caps · Mid caps · Small caps].
 * Rows: rank, the name (a stock-page link only when quotable, never
 * prefetched), the last price, the % with a 48 px magnitude bar (Most
 * active: "Vol 1.20 Cr" instead). 5 rows (home, rail) or 10 (hub).
 *
 * - Every request is `limit=10` (sliced here), so home, rails and the hub
 *   share one cache key per type and segment (spec §7.0 rule 1).
 * - Most active is one list ranked by volume across all three tracked
 *   lists: its toggle is hidden, the request is always `segment=largecap`,
 *   and a ref that comes back twice (CONCOR is on two lists) shows once.
 * - Only the active tab polls (30 s), and only near the viewport. `home`
 *   shows Gainers and Losers side by side from 768 px (both poll then);
 *   below that they are tabs.
 * - LIVE only: under any other licence it renders nothing (the hub shows
 *   one DataNotice instead; spec §5.10). It asks for nothing until the
 *   snapshot says the licence is LIVE (spec §7.12 rule 4).
 * - It ends with its Stamp: each list's own in `rail` and `hub` (after the
 *   footnote); in `home` one Stamp for both columns, after the shared
 *   footnote (spec §5.1: "footnote, Stamp").
 */
export function MoversBoard({
  variant,
  linkRows = true,
  boxed,
  className,
}: {
  variant: MoversVariant;
  /** Link quotable rows to their stock pages (default true). */
  linkRows?: boolean;
  /** Its own hub box (default: only the `hub` variant has one). */
  boxed?: boolean;
  className?: string;
}) {
  const snap = useSnapshot(15);
  const quotable = useQuotable();
  const [type, setType] = useState<MoversType>('gainers');
  const [segment, setSegment] = useState<CapSegment>('largecap');
  // home: each column reports its answer's stamp; one Stamp covers both.
  const [stamps, setStamps] = useState<Partial<Record<MoversType, ListStampInfo | null>>>({});
  const report = useCallback((t: MoversType, s: ListStampInfo | null) => {
    setStamps((prev) => {
      const p = prev[t];
      const same =
        p === s ||
        (!!p &&
          !!s &&
          p.label === s.label &&
          p.asOf === s.asOf &&
          p.attribution === s.attribution &&
          p.stale === s.stale);
      return same ? prev : { ...prev, [t]: s };
    });
  }, []);
  // home, from 768 px: both lists side by side and the tab list hidden, so
  // the panels drop their tab semantics (A-5). A hook: above the return.
  const stacked = useMinWidth(768);
  const right = snap.data?.right;
  if (right && right !== 'LIVE') return null;
  const home = variant === 'home';
  const shown = Object.values(stamps).filter((x): x is ListStampInfo => !!x);
  const homeStamp = stampOf(shown);
  const types: MoversType[] = home ? ['gainers', 'losers'] : ['gainers', 'losers', 'active'];
  const ready = right === 'LIVE';
  // The snapshot never arrived: no licence to go on, so say the data is out.
  const failed = !snap.data && !!snap.error;
  const rows = ROWS[variant];

  return (
    <div
      className={clsx('sv-movers', (boxed ?? variant === 'hub') && BOX, className)}
      data-variant={variant}
      data-market-module="movers"
    >
      <ModuleHead title={COPY.moversTitle} className="mb-1" />
      <Tabs value={type} onValueChange={(v) => setType(v as MoversType)}>
        <TabsList aria-label={COPY.moversTitle} className="sv-movers-tabs">
          {types.map((t) => (
            <TabsTrigger key={t} value={t}>
              {COPY.moversTabs[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        {variant === 'hub' && type !== 'active' ? (
          <ToggleGroup
            label="Market cap"
            value={segment}
            onValueChange={(v) => setSegment(v as CapSegment)}
            className="mt-3"
          >
            {(['largecap', 'midcap', 'smallcap'] as const).map((s) => (
              <ToggleGroupItem key={s} value={s}>
                {COPY.segments[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <div className="sv-movers-cols">
          {types.map((t) => (
            <TabsContent
              key={t}
              value={t}
              forceMount={home ? true : undefined}
              className="sv-movers-panel"
              {...(home && stacked ? STACKED_PANEL : {})}
            >
              {home ? (
                <h4 className="sv-movers-colhead t-label text-fg-2">
                  {COPY.moversTabs[t]}
                </h4>
              ) : null}
              <MoversList
                type={t}
                segment={variant === 'hub' ? segment : 'largecap'}
                rows={rows}
                ready={ready}
                failed={failed}
                quotable={linkRows ? quotable : EMPTY}
                footnote={!home}
                stamp={!home}
                onStamp={home ? report : undefined}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
      {home ? (
        <>
          <p className="t-meta mt-3 text-fg-3">{moversFootnote('largecap')}</p>
          {/* Reserved while the lists load, so nothing shifts when it fills. */}
          <div className="sv-mk-foot">
            <Stamp
              label={homeStamp.label}
              asOf={homeStamp.asOf}
              attribution={shown[0]?.attribution}
              stale={shown.some((x) => x.stale)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

const EMPTY = new Set<string>();

/** One list, polled only while it has a box near the viewport. */
function MoversList({
  type,
  segment,
  rows,
  ready,
  failed,
  quotable,
  footnote,
  stamp,
  onStamp,
}: {
  type: MoversType;
  segment: CapSegment;
  rows: number;
  ready: boolean;
  failed: boolean;
  quotable: Set<string>;
  footnote: boolean;
  stamp: boolean;
  onStamp?: (type: MoversType, s: ListStampInfo | null) => void;
}) {
  const res = useInViewMarket<Labelled<ListRow[]>>(
    ready ? marketPath.movers(type, segment) : null,
    30,
  );
  const p = res.data;
  const ok = !!p?.available && !!p.label && !!p.asOf && p.data.length > 0;
  const label = ok ? p!.label : null;
  const asOf = ok ? p!.asOf : null;
  const attribution = ok ? p!.attribution : null;
  const stale = !!res.error;
  useEffect(() => {
    onStamp?.(
      type,
      label && asOf ? { label, asOf, attribution: attribution ?? '', stale } : null,
    );
  }, [onStamp, type, label, asOf, attribution, stale]);
  return (
    <div ref={res.ref}>
      <MoversListView
        type={type}
        segment={segment}
        rows={rows}
        res={failed && !res.data ? { loading: false, error: 'unavailable' } : res}
        quotable={quotable}
        footnote={footnote}
        stamp={stamp}
      />
    </div>
  );
}

/** A movers list for a resolved answer (also the design gallery's fixtures). */
export function MoversListView({
  type,
  segment,
  rows,
  res,
  quotable,
  footnote = true,
  stamp = true,
}: {
  type: MoversType;
  segment: CapSegment;
  rows: number;
  res: MoversRes;
  quotable: Set<string>;
  footnote?: boolean;
  /** End with this list's Stamp (false: the home variant's shared one). */
  stamp?: boolean;
}) {
  const payload = res.data;
  if (!payload) {
    return res.loading ? (
      <ModuleSkeleton rows={rows} head={false} stamp={stamp} className="mt-2" />
    ) : (
      <ModuleError className="mt-3" />
    );
  }
  if (!payload.available) {
    return (
      <ModuleError className="mt-3">
        {payload.reason === 'rights' ? COPY.rights : undefined}
      </ModuleError>
    );
  }
  // Most active spans three lists: a ref on two of them comes back twice.
  const seen = new Set<string>();
  const list = payload.data
    .filter((r) => !seen.has(r.ref) && !!seen.add(r.ref))
    .slice(0, rows);
  if (!list.length || !payload.label || !payload.asOf) {
    return <ModuleError className="mt-3" />;
  }
  const active = type === 'active';
  return (
    <>
      <ol className="sv-movers-list mt-1">
        {list.map((r, i) => {
          const pct = r.changePct;
          const width =
            pct === null ? 0 : (Math.min(Math.abs(pct), BAR_CAP) / BAR_CAP) * 48;
          const vol = active && r.volume ? volText(fmtVolume(r.volume)) : null;
          return (
            <li key={r.ref}>
              <span className="sv-movers-rank t-num-s text-fg-3">{i + 1}</span>
              <span className="sv-movers-name t-small">
                <StockName refId={r.ref} quotable={quotable.has(r.ref)} className="font-semibold">
                  {r.name}
                </StockName>
              </span>
              <span className="sv-movers-last">
                <PriceCell value={r.ltp} size="num" live />
              </span>
              {/* The % over its 48 px magnitude bar; Most active: the volume. */}
              <span className="sv-movers-pct t-num">
                <Change change={null} pct={pct} showAbs={false} />
                {vol ? (
                  <span className="t-meta block whitespace-nowrap text-fg-3">{vol}</span>
                ) : (
                  <span className="sv-movers-track" aria-hidden="true">
                    <span
                      className={clsx('sv-movers-bar', pct !== null && pct < 0 ? 'bg-down' : 'bg-up')}
                      style={{ width: `${width}px` }}
                    />
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {footnote ? (
        <p className="t-meta mt-3 text-fg-3">
          {active ? activeFootnote() : moversFootnote(segment)}
        </p>
      ) : null}
      {stamp ? (
        <div className="sv-mk-foot">
          <Stamp
            label={payload.label}
            asOf={payload.asOf}
            attribution={payload.attribution}
            stale={!!res.error}
          />
        </div>
      ) : null}
    </>
  );
}
