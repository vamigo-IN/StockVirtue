'use client';

import Link from 'next/link';
import { useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { fmtPrice, stampOf } from '@/components/widgets/format';
import { clsx } from 'clsx';
import type { InstrumentKind, MarketQuote, Snapshot } from '@/market/types';
import { COPY } from './copy';
import { DayRange } from './DayRange';
import { delayFor, isVolatilityIndex } from './gate';
import { BOX, ModuleError, ModuleHead, ModuleSkeleton, RowStamp, SignedChange } from './parts';
import { PriceCell } from './PriceCell';
import { Stamp } from './Stamp';

export type IndexBoardDensity = 'compact' | 'rail' | 'board';

export interface IndexBoardProps {
  /** The server's snapshot (`getSnapshot()`); the stream takes over after hydration. */
  initial: Snapshot | null;
  /** Instrument kinds to list (default: indices only). */
  kinds?: InstrumentKind[];
  /** Exactly these refs, in this order (default: every curated row of `kinds`). */
  refs?: string[];
  limit?: number;
  density: IndexBoardDensity;
  /** Rendered as an h3. */
  title?: string;
  /** The h3's id, for an aside's aria-labelledby. */
  titleId?: string;
  moreHref?: string;
  moreLabel?: string;
  className?: string;
}

/**
 * Index values in a table (spec §4.10): Markets now on /news, listings and
 * story rails (`compact`), rails (`rail`), the Markets hub (`board`, in its
 * box). Rows are never links (indices have no pages); India VIX reads
 * "volatility index" and its change is never coloured.
 *
 * Columns: compact = Name · Last · %; rail adds Change (from 768 px);
 * board adds Change (768) and Day range · Prev close (1024). Phones show at
 * most three columns (spec §8.1 item 12).
 *
 * Streamed: `initial` from the server, then the live snapshot, so the
 * server HTML has real numbers and hydration matches (spec §7.0 rule 2).
 * One Stamp ends it; a row whose label or time differs carries its own
 * pill and time. OFF → nothing. Not used on the home page.
 */
export function IndexBoard(props: IndexBoardProps) {
  const live = useSnapshot(15);
  return (
    <IndexBoardView
      {...props}
      snapshot={live.data ?? props.initial}
      live={!!live.data}
      stale={!!live.error}
      failed={!live.data && !props.initial && !!live.error}
    />
  );
}

/** The table for a resolved snapshot (also the design gallery's fixtures). */
export function IndexBoardView({
  snapshot,
  live = false,
  stale = false,
  failed = false,
  kinds = ['INDEX'],
  refs,
  limit,
  density,
  title,
  titleId,
  moreHref,
  moreLabel,
  className,
}: Omit<IndexBoardProps, 'initial'> & {
  snapshot: Snapshot | null;
  /** The values come from live data (enables the PriceCell wash). */
  live?: boolean;
  /** The last refresh failed: the stamp says these are older values. */
  stale?: boolean;
  /** No data at all and the fetch failed. */
  failed?: boolean;
}) {
  const boxed = density === 'board';
  const root = clsx(boxed && BOX, className);
  const head = title ? <ModuleHead title={title} id={titleId} className="mb-2" /> : null;

  if (!snapshot) {
    if (failed) {
      return (
        <div className={root}>
          {head}
          <ModuleError />
        </div>
      );
    }
    return (
      <ModuleSkeleton
        className={root}
        rows={refs?.length ?? limit ?? 6}
        head={!title}
      >
        {head}
      </ModuleSkeleton>
    );
  }
  if (snapshot.right === 'OFF') return null;

  const pool = snapshot.instruments.filter((q) => kinds.includes(q.kind));
  const chosen = refs
    ? refs
        .map((r) => pool.find((q) => q.ref === r.toUpperCase()))
        .filter((q): q is MarketQuote => !!q)
    : pool;
  const rows = typeof limit === 'number' ? chosen.slice(0, limit) : chosen;
  if (!rows.length) return null;

  const stamp = stampOf(rows);
  const delay = delayFor(snapshot.right, snapshot.delayMinutes);
  const showChange = density !== 'compact';
  const showWide = density === 'board';

  return (
    <div className={root} data-market-module="index-board">
      {head}
      <table className="sv-mk-table w-full">
        <caption className="sr-only">{title ?? 'Indices'}</caption>
        <thead className={density === 'board' ? undefined : 'sr-only'}>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" className="text-right">Last</th>
            {showChange ? (
              <th scope="col" className="hidden text-right md:table-cell">Change</th>
            ) : null}
            <th scope="col" className="text-right">%</th>
            {showWide ? (
              <>
                <th scope="col" className="hidden text-right lg:table-cell">Day range</th>
                <th scope="col" className="hidden text-right lg:table-cell">Prev close</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => {
            const vix = isVolatilityIndex(q.ref);
            return (
              <tr key={q.ref}>
                <th scope="row" className="t-small font-semibold text-fg">
                  {q.name}
                  {vix ? (
                    <span className="t-meta block font-normal text-fg-3">
                      {COPY.volatilityIndex}
                    </span>
                  ) : null}
                  {stamp.own(q) ? <RowStamp label={q.label} asOf={q.asOf} /> : null}
                </th>
                <td className="text-right">
                  <PriceCell value={q.ltp} kind={q.kind} size="num" live={live} />
                </td>
                {showChange ? (
                  <td className="t-num hidden text-right md:table-cell">
                    <SignedChange value={q.change} kind={q.kind} neutral={vix} />
                  </td>
                ) : null}
                <td className="t-num text-right">
                  <Change
                    change={null}
                    pct={q.changePct}
                    showAbs={false}
                    neutral={vix}
                  />
                </td>
                {showWide ? (
                  <>
                    <td className="hidden text-right lg:table-cell">
                      <DayRange
                        low={q.low}
                        high={q.high}
                        prevClose={q.prevClose}
                        ltp={q.ltp}
                        size="lg"
                        showValues
                        kind={q.kind}
                      />
                    </td>
                    <td className="t-num hidden text-right lg:table-cell">
                      {q.prevClose === null ? '–' : fmtPrice(q.prevClose, q.kind)}
                    </td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="sv-mk-foot">
        <Stamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={snapshot.attribution}
          delay={delay}
          stream="snapshot"
          stale={stale}
        />
        {moreHref && moreLabel ? (
          <Link href={moreHref} className="sv-quiet sv-quiet-hit t-small">
            {moreLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
