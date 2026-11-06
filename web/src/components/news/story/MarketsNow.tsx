import { IndexBoard } from '@/components/market/IndexBoard';
import { MarketStatus } from '@/components/market/MarketStatus';
import { ModuleHead } from '@/components/market/parts';
import { cn } from '@/lib/utils';
import type { Snapshot } from '@/market/types';
import { newsPath } from '@/news/routes';
import c from '../StoryCard.module.css';

/** The module's title and its link (spec §5.9.3, §9.6). */
const TITLE = 'Markets now';
const MORE = 'All markets';

/**
 * "Markets now" for the story rail and the stock page (spec §5.9.3,
 * §5.12, §5.13): the h3, the MarketStatus line beside it, then IndexBoard
 * compact (indices only, at most `limit` rows), whose foot holds the one
 * Stamp and the quiet link "All markets".
 *
 * A rail module: a `div` with an h3 and the 2 px ink rule on top, never a
 * `<section>`, an `<article>` or `.sv-prose`. Its rows are never links.
 * It reads the streamed snapshot (`initial` from the server's
 * getSnapshot()), so it costs no broker call (spec §5.15). The page leaves
 * it out under an OFF licence (the server knows `right`).
 *
 * Server component: IndexBoard and MarketStatus are its client parts.
 */
export function MarketsNow({
  initial,
  limit = 6,
  titleId,
  className,
}: {
  initial: Snapshot | null;
  /** Rows (6 in rails and the stock page's aside, 4 on phones). */
  limit?: number;
  /** The h3's id, for the aside's aria-labelledby. */
  titleId: string;
  className?: string;
}) {
  return (
    <div className={cn(c.railCard, className)}>
      <ModuleHead
        title={TITLE}
        id={titleId}
        // "NSE & BSE open · MCX open · Currency closed": an empty box on the
        // server and the first client render, filled from the live ticker.
        aside={<MarketStatus variant="line" />}
        className="mb-2"
      />
      <IndexBoard
        initial={initial}
        density="compact"
        limit={limit}
        moreHref={newsPath.category('markets')}
        moreLabel={MORE}
      />
    </div>
  );
}
