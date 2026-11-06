'use client';

import { IndexBoard } from '@/components/market/IndexBoard';
import { MarketStatus } from '@/components/market/MarketStatus';
import { useSnapshot } from '@/components/widgets/data';
import type { Snapshot } from '@/market/types';
import c from '../StoryCard.module.css';
import s from './listing.module.css';

/** Interface strings (spec §5.11, §9.6). */
const MARKETS_NOW = 'Markets now';
const ALL_MARKETS = 'All markets';
const HEADING_ID = 'listing-markets-now';

/**
 * "Markets now" in a listing's aside (spec §5.11, §7.5: Latest, tags, the
 * Markets sub-sections): the h3, the session line, IndexBoard compact with
 * up to six INDEX rows (four on phones), its Stamp and the quiet link "All
 * markets". Streamed from the snapshot, with the server's as `initial` so
 * the HTML has real numbers. No story links (official-e2e). Under OFF, or
 * with no index rows, it renders nothing, and ListingView gives the width
 * back to the stories.
 */
export function MarketsNowAside({ initial }: { initial: Snapshot | null }) {
  const live = useSnapshot(15);
  const snap = live.data ?? initial;
  if (!snap || snap.right === 'OFF' || !snap.instruments.some((q) => q.kind === 'INDEX')) {
    return null;
  }
  return (
    <aside aria-labelledby={HEADING_ID} className={s.marketsNow}>
      <div className={c.railCard}>
        <h3 id={HEADING_ID} className={`t-rail-title m-0 text-fg ${c.railHead}`}>
          {MARKETS_NOW}
        </h3>
        <MarketStatus variant="line" className="mt-1" />
        <IndexBoard
          initial={initial}
          density="compact"
          limit={6}
          moreHref="/news/markets"
          moreLabel={ALL_MARKETS}
          className="mt-2"
        />
      </div>
    </aside>
  );
}
