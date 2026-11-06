import { EmptyState, Pagination } from '@/components/news/blocks';
import s from '@/components/news/listing/listing.module.css';
import { StoryList } from '@/components/news/ListingView';
import { MostRead } from '@/components/news/MostRead';
import { Container } from '@/components/public/Container';
import { RuleHead } from '@/components/public/Heads';
import { cn } from '@/lib/utils';
import { newsPath, type LandingSlug } from '@/news/routes';
import type { NewsCard, NewsListing } from '@/news/types';
import h from './hubs.module.css';

const HEAD_ID = 'hub-stories';
const MOST_READ_ID = 'hub-most-read';

/**
 * A hub's stories (spec §5.10, §9.6): RuleHead "{Hub name} stories", then
 * page 1 as a `splash` and `row`s (12 per page) in cols 1–9 with "Most read
 * in {hub}" in the aside (cols 10–12; 5 + 3 on tablets, or after the list
 * with `mostReadBelowOnTablet`, the Markets hub), then Pagination to
 * /news/category/<slug>/page/N. The existing empty state when the category
 * has no stories. `main article` is these stories only. Server component.
 */
export function HubStories({
  slug,
  title,
  listing,
  mostRead,
  mostReadBelowOnTablet = false,
  storiesTitle,
  className,
}: {
  slug: LandingSlug;
  /** The hub's name (the CMS name, else the LANDING_PAGES title). */
  title: string;
  listing: NewsListing | null;
  /** getListing({ category, sort: 'trending', limit: 5 }).items */
  mostRead: NewsCard[];
  mostReadBelowOnTablet?: boolean;
  /** The RuleHead's text when it isn't "{title} stories" (IPOs: "IPO stories"). */
  storiesTitle?: string;
  className?: string;
}) {
  const items = listing?.items ?? [];
  const aside = mostRead.length > 0;
  return (
    <section aria-labelledby={`section-${HEAD_ID}`} className={className}>
      <Container className={h.stories}>
        <RuleHead id={HEAD_ID} title={storiesTitle ?? `${title} stories`} className="mb-[var(--sv-head-gap)]" />
        <div
          className={cn('sv-grid', s.grid)}
          data-aside={aside ? (mostReadBelowOnTablet ? 'below-tablet' : '') : undefined}
        >
          <div className={s.main}>
            {items.length ? (
              <StoryList items={items} splash={listing?.page === 1} headingLevel="h3" />
            ) : (
              // Existing copy (the old LandingPage's empty state).
              <EmptyState title={`No ${title} stories yet`} headingLevel="h3">
                Stories appear here as soon as the newsroom publishes them.
              </EmptyState>
            )}
            {listing ? (
              <Pagination
                page={listing.page}
                totalPages={listing.totalPages}
                hrefFor={(p) => newsPath.category(slug, p)}
              />
            ) : null}
          </div>
          {aside ? (
            <div className={s.side}>
              <aside aria-labelledby={MOST_READ_ID}>
                <MostRead title={`Most read in ${title}`} items={mostRead} headingId={MOST_READ_ID} />
              </aside>
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
