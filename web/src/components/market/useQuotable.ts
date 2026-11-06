'use client';

import { useMemo } from 'react';
import { useSnapshot } from '@/components/widgets/data';
import type { Snapshot } from '@/market/types';

const EMPTY = new Set<string>();

/**
 * The refs ("NSE:INFY", upper case) whose stock pages will have a price
 * (spec §4.10, §7.0 rule 7): the curated STOCK refs in the snapshot, plus
 * `snapshot.quotableStocks` (backend B1: every stock on the tracked movers
 * lists and in the Nifty 50, Bank Nifty and Sensex). On an older backend
 * without the field only the curated stocks count. Rows of movers, heatmap
 * tiles and list rows link to `/news/stocks/{SYM}` only when their ref is
 * in this set, and every such link has `prefetch={false}` (plan §0.13);
 * other rows show the name as plain text.
 *
 * Reads the streamed snapshot (one store, one stream). Empty on the server,
 * while the page hydrates and while no snapshot has arrived, unless an
 * `initial` snapshot is passed; the rows that use it render after their
 * own data arrives, so that is never visible. Empty under an OFF licence,
 * when no stock page has a price.
 */
export function useQuotable(initial?: Snapshot | null): Set<string> {
  const live = useSnapshot(15);
  const snap = live.data ?? initial ?? null;
  return useMemo(() => {
    if (!snap || snap.right === 'OFF') return EMPTY;
    const set = new Set<string>();
    for (const q of snap.instruments ?? []) {
      if (q.kind === 'STOCK') set.add(q.ref.toUpperCase());
    }
    for (const ref of snap.quotableStocks ?? []) set.add(ref.toUpperCase());
    return set;
  }, [snap]);
}
