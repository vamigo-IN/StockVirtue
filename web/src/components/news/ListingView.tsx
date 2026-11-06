import Link from 'next/link';
import type { ReactNode } from 'react';
import { Container } from '@/components/public/Container';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { NewsCard, NewsPage } from '@/news/types';
import { EmptyState, Pagination } from './blocks';
import { DayGroups } from './DayGroups';
import { ListingHead, type Crumb } from './listing/ListingHead';
import s from './listing/listing.module.css';
import { StoryCard, type StoryHeadingLevel } from './StoryCard';

/**
 * Page 1 opens with a `splash` (image left, text right from 768 px), then
 * `row`s; later pages are rows only (spec §5.10, §5.11). One `<article>`
 * per story (StoryCard), so `main article` counts stories only.
 */
export function StoryList({
  items,
  splash,
  headingLevel = 'h2',
  priority = false,
  clock = true,
  highlight,
  className,
}: {
  items: NewsCard[];
  /** Open with a splash (page 1 of a category, a hub). */
  splash: boolean;
  headingLevel?: StoryHeadingLevel;
  /** Load the splash image eagerly (it is in the first viewport). */
  priority?: boolean;
  /** false: "{author} · {n} min read", no clock time (Learn). */
  clock?: boolean;
  /** The search query, wrapped in <mark> in headlines and summaries. */
  highlight?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {items.map((card, i) =>
        splash && i === 0 ? (
          <StoryCard
            key={card.id}
            card={card}
            variant="splash"
            orientation="horizontal"
            headingLevel={headingLevel}
            priority={priority}
            clock={clock}
            className="mb-4"
          />
        ) : (
          <StoryCard
            key={card.id}
            card={card}
            variant="row"
            headingLevel={headingLevel}
            clock={clock}
            highlight={highlight}
            className={i === 0 ? 'border-t-0' : undefined}
          />
        ),
      )}
    </div>
  );
}

/**
 * A section, tag, byline or latest page (spec §5.11; W5): the head, the
 * story list and `Pagination`, with an optional aside.
 *
 * - The head is `ListingHead` (no eyebrow, no count line), or `head` when
 *   the page brings its own (the author's profile head).
 * - `layout="stories"` (default): page 1 opens with a splash (`splash`,
 *   default true), then rows. `layout="days"`: DayGroups (Latest, author).
 * - `rail`: the aside slot, cols 10–12 from 1024 and 6–8 (5 + 3) from 768;
 *   after the list on phones. Pass a complete module (an `<aside>`); a
 *   client module that renders nothing gives the width back.
 * - `main article` is stories only: rails, boards and the head never use
 *   `<article>`.
 * - `aside` is the head's extra content (the sub-section links).
 *
 * Server component.
 */
export function ListingView({
  title,
  description,
  crumbs,
  aside,
  listing,
  hrefFor,
  emptyTitle,
  emptyBody,
  head,
  storiesHead,
  layout = 'stories',
  splash = true,
  rail,
  railBelowOnTablet = false,
  headingLevel,
  emptyHeadingLevel,
  clock = true,
  highlight,
}: {
  title: string;
  description?: ReactNode;
  crumbs: Crumb[];
  /** Extra head content under the summary: the sub-section links. */
  aside?: ReactNode;
  listing: NewsPage | null;
  hrefFor: (page: number) => string;
  emptyTitle: string;
  emptyBody?: ReactNode;
  /** Replaces the ListingHead (the author's profile head). */
  head?: ReactNode;
  /** A section head between the page head and the list ("Stories by …"). */
  storiesHead?: ReactNode;
  layout?: 'stories' | 'days';
  /** stories layout: page 1 opens with a splash. */
  splash?: boolean;
  /** The aside slot (cols 10–12; 5 + 3 on tablets). */
  rail?: ReactNode;
  /** Tablets show the aside after the list instead of 5 + 3. */
  railBelowOnTablet?: boolean;
  /** Story headline level: h2 under the H1, h3 under a section head. */
  headingLevel?: StoryHeadingLevel;
  /** The empty state's heading (h2 by default, h3 under a section head). */
  emptyHeadingLevel?: 'h2' | 'h3';
  clock?: boolean;
  highlight?: string;
}) {
  const items = listing?.items ?? [];
  const page = listing?.page ?? 1;
  const level = headingLevel ?? (storiesHead ? 'h3' : 'h2');
  return (
    <>
      {head ?? (
        <ListingHead title={title} summary={description} crumbs={crumbs}>
          {aside}
        </ListingHead>
      )}
      <Container className={s.area}>
        <div
          className={cn('sv-grid', s.grid)}
          data-aside={rail ? (railBelowOnTablet ? 'below-tablet' : '') : undefined}
        >
          <div className={s.main}>
            {storiesHead}
            {items.length === 0 ? (
              <EmptyState title={emptyTitle} headingLevel={emptyHeadingLevel ?? (storiesHead ? 'h3' : 'h2')}>
                {emptyBody}
              </EmptyState>
            ) : layout === 'days' ? (
              <DayGroups items={items} headingLevel={storiesHead ? 'h3' : 'h2'} />
            ) : (
              <StoryList
                items={items}
                splash={splash && page === 1}
                headingLevel={level}
                priority={!storiesHead}
                clock={clock}
                highlight={highlight}
              />
            )}
            {listing ? (
              <Pagination page={listing.page} totalPages={listing.totalPages} hrefFor={hrefFor} />
            ) : null}
          </div>
          {rail ? <div className={s.side}>{rail}</div> : null}
        </div>
      </Container>
    </>
  );
}

/**
 * A section's sub-sections under its heading (spec §5.10, §5.11): quiet
 * links in a row, 44 px tall. public-e2e finds "Derivatives" here on
 * /news/markets.
 */
export function SubSections({
  items,
}: {
  items: { slug: string; name: string }[];
}) {
  if (!items.length) return null;
  return (
    <ul className={s.subs} aria-label="Sub-sections">
      {items.map((x) => (
        <li key={x.slug}>
          <Link href={newsPath.category(x.slug)} className="sv-quiet t-small">
            {x.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
