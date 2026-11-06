'use client';

import { COPY } from '@/components/market/copy';
import { delayFor } from '@/components/market/gate';
import { stockHref } from '@/components/market/parts';
import { QuoteChip } from '@/components/market/QuoteChip';
import { Stamp } from '@/components/market/Stamp';
import { useSnapshot } from '@/components/widgets/data';
import { stampOf } from '@/components/widgets/format';
import { LabelPill } from '@/components/widgets/frame';
import { StampTime } from '@/components/widgets/StampTime';
import type { MarketQuote, Snapshot } from '@/market/types';
import s from './listing.module.css';

/** Interface string (spec §5.11, §9.6). */
const TITLE = 'Matching instruments';
const MAX = 6;

/** The curated instruments whose name or symbol contains the query (case-insensitive). */
export function matchInstruments(snapshot: Snapshot | null | undefined, query: string): MarketQuote[] {
  const q = query.trim().toLowerCase();
  if (!snapshot || snapshot.right === 'OFF' || q.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return [];
  return snapshot.instruments
    .filter((i) => {
      const symbol = i.ref.slice(i.ref.indexOf(':') + 1).toLowerCase();
      return (i.name ?? '').toLowerCase().includes(q) || symbol.includes(q);
    })
    .slice(0, MAX);
}

/**
 * Matching instruments on /news/search (spec §5.11, §7.5): up to six
 * QuoteChips from the curated snapshot whose name or symbol contains the
 * query (filtered here; no new endpoint), in a `<ul aria-label="Matching
 * instruments">`, then ONE Stamp. Stock chips link to their stock pages
 * (curated stocks are always quotable; never prefetched); index, commodity
 * and currency chips are not links. Never an `<article>`. Hidden when
 * nothing matches, when the query has fewer than 2 letters, and under OFF.
 * Streamed from the snapshot, with the server's as `initial`.
 */
export function SearchInstruments({ query, initial }: { query: string; initial: Snapshot | null }) {
  const live = useSnapshot(15);
  const snap = live.data ?? initial;
  const matches = matchInstruments(snap, query);
  if (!snap || !matches.length) return null;
  const stamp = stampOf(matches);
  return (
    <div className={s.instruments} data-market-module="search-instruments">
      <p className="t-label m-0 text-fg-2">{TITLE}</p>
      <ul className={s.chips} aria-label={TITLE}>
        {matches.map((q) => {
          const symbol = q.ref.slice(q.ref.indexOf(':') + 1);
          return (
            <li key={q.ref}>
              <QuoteChip
                refId={q.ref}
                symbol={symbol}
                name={q.name}
                href={q.kind === 'STOCK' ? stockHref(q.ref) : undefined}
                quote={q}
                live={!!live.data}
              />
              {stamp.own(q) ? (
                // A chip whose label or time differs from the Stamp's
                // carries its own (MCX live at night, NSE closed).
                <span className="t-meta mt-1 block whitespace-nowrap text-fg-3">
                  <LabelPill label={q.label} /> <span className="sr-only">{COPY.pricesAsOf}</span>
                  <StampTime iso={q.asOf} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="mt-2">
        <Stamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={snap.attribution}
          delay={delayFor(snap.right, snap.delayMinutes)}
        />
      </div>
    </div>
  );
}
