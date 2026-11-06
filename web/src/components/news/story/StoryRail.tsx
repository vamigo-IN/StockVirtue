import type { ReactNode } from 'react';
import { CommodityBoard } from '@/components/market/CommodityBoard';
import { IpoWatch } from '@/components/market/IpoBoard';
import { MostRead } from '@/components/news/MostRead';
import { cn } from '@/lib/utils';
import type { IpoBoard, Snapshot } from '@/market/types';
import type { NewsArticle, NewsCard } from '@/news/types';
import { LeadStockCard } from './LeadStockCard';
import { MarketsNow } from './MarketsNow';
import c from '../StoryCard.module.css';
import s from './story.module.css';

export type CategoryModule = 'markets' | 'commodities' | 'ipo' | null;

/**
 * The rail's category module (spec §5.12), chosen on the server from the
 * story's category, or its parent when it has one:
 * - markets and its children → Markets now;
 * - commodities and its children → CommodityBoard;
 * - ipo and its children → IPO watch;
 * - education → none (the story already ends with the app panel);
 * - any other category, when the story names a stock or a sector → Markets
 *   now; otherwise none.
 * Under an OFF licence Markets now and the commodity board are left out;
 * IPO watch stays (it shows no prices).
 */
export function categoryModule(
  a: Pick<NewsArticle, 'category' | 'stocks' | 'sectors'>,
  snapshot: Snapshot | null,
): CategoryModule {
  const root = a.category?.parent?.slug ?? a.category?.slug ?? null;
  const off = snapshot?.right === 'OFF';
  let pick: CategoryModule;
  if (root === 'markets') pick = 'markets';
  else if (root === 'commodities') pick = 'commodities';
  else if (root === 'ipo') pick = 'ipo';
  else if (root === 'education') pick = null;
  else pick = a.stocks.length > 0 || a.sectors.length > 0 ? 'markets' : null;
  if (off && (pick === 'markets' || pick === 'commodities')) return null;
  return pick;
}

/**
 * The story rail (spec §5.12, §7.6): `<aside aria-label="Market data and
 * most read">`. From 768 px it spans the body, share and end rows beside the
 * story, as a flex column:
 * - the sticky zone (flex: 1) holds ONE module, the lead stock card when
 *   the story names a stock (and the licence isn't OFF), else the category
 *   module. It sticks under the header (tablets: --sv-sticky-top; from
 *   1024 px: --sv-chrome-h + 24 px) and is released before the foot.
 *   Its tallest content, Markets now with 6 rows, stays under 640 px.
 * - the foot, beside the story's end: the category module (when the lead
 *   card took the sticky zone), then Most read. They never stick.
 * Below 768 px it follows the AuthorBox in the DOM (lead card, category
 * module, Most read), then the page's app panel.
 *
 * Rail modules are `div`s with `h3`s, never `<section>`, `<article>` or
 * `.sv-prose`, and nothing here links to a stock page. Every module reads
 * the streamed snapshot, the IPO board or the news API: no broker call is
 * made for the rail on the server (spec §5.15). SERVER component.
 */
export function StoryRail({
  article: a,
  snapshot,
  ipos,
  mostRead,
  className,
}: {
  article: NewsArticle;
  snapshot: Snapshot | null;
  /** getIpos(), fetched only when the category module is IPO watch. */
  ipos: IpoBoard | null;
  /** getTrending(6) without this story, first 5. */
  mostRead: NewsCard[];
  className?: string;
}) {
  const lead = snapshot?.right !== 'OFF' && a.stocks.length > 0;
  const kind = categoryModule(a, snapshot);
  const moduleEl = renderModule(kind, snapshot, ipos);
  const sticky: ReactNode = lead ? (
    <LeadStockCard stocks={a.stocks} initial={snapshot} />
  ) : (
    moduleEl
  );
  const foot: ReactNode[] = [];
  if (lead && moduleEl) foot.push(<div key="module">{moduleEl}</div>);
  if (mostRead.length) {
    foot.push(<MostRead key="most-read" title="Most read" items={mostRead} />);
  }
  if (!sticky && !foot.length) return null;

  return (
    <aside aria-label="Market data and most read" className={cn(s.rail, className)}>
      <div className={s.stickyZone}>{sticky ? <div className={s.sticky}>{sticky}</div> : null}</div>
      {foot.length ? <div className={s.foot}>{foot}</div> : null}
    </aside>
  );
}

function renderModule(
  kind: CategoryModule,
  snapshot: Snapshot | null,
  ipos: IpoBoard | null,
): ReactNode {
  switch (kind) {
    case 'markets':
      return <MarketsNow initial={snapshot} limit={6} titleId="story-markets-now" />;
    case 'commodities':
      return (
        <div className={c.railCard}>
          <CommodityBoard
            initial={snapshot}
            density="rail"
            maxCommodities={4}
            titleId="story-commodities"
          />
        </div>
      );
    case 'ipo':
      return (
        <div className={c.railCard}>
          <IpoWatch initial={ipos} headingLevel="h3" />
        </div>
      );
    default:
      return null;
  }
}
