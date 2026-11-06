import type { DataLabel, IpoBoard, Snapshot } from '@/market/types';

/**
 * The IPO listing-price rule, in ONE place for the IPO calendar (IpoBoard)
 * and the article IPO widget (widgets/lists.tsx). No directive and no React,
 * so either chunk imports it without pulling in the other.
 *
 * Spec §4.10, §5.10.3, fix b: the board has no label or time per row and the
 * backend keeps it for 600 s, so the "Last price" and "Since issue" columns
 * show only when the licence is LIVE and every recently listed row that
 * trades has its `ltp`. They are then "End of day" while the equity session
 * is closed and "Delayed" while it is open (a 10-minute-old answer is
 * delayed by the backend's own five-minute rule). NEVER "Live". Otherwise
 * the columns are dropped, not dashed.
 *
 * Spec clarification (lead decision, 5 Nov 2026): a row with
 * `tradeable === false` never has a price (it doesn't resolve in the scrip
 * master), so it is left out of the "every ltp" test. Such a row prints "–"
 * in the price cells when the columns show. A board whose recent listings
 * are ALL untradeable shows no price columns.
 */
export function listingPriceLabel(
  board: Pick<IpoBoard, 'recentlyListed'>,
  snap: Pick<Snapshot, 'right' | 'sessions'> | null | undefined,
): DataLabel | null {
  if (snap?.right !== 'LIVE' || !snap.sessions) return null;
  const priced = board.recentlyListed.filter((l) => l.tradeable !== false);
  if (!priced.length) return null;
  if (priced.some((l) => l.ltp === null)) return null;
  return snap.sessions.equity ? 'DELAYED' : 'EOD';
}

/** "3.4×"; two decimals below 1× so a thin book still reads ("0.18×"). */
export const fmtTimes = (n: number) => `${n.toFixed(n < 1 ? 2 : 1)}×`;
