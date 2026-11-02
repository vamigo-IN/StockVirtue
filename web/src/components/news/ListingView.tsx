import Link from 'next/link';
import { cn } from '@/lib/utils';
import { pluralize } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { NewsCard, NewsPage } from '@/news/types';
import { ArticleCard } from './ArticleCard';
import { Breadcrumbs, Container, EmptyState, Pagination } from './blocks';

/** Stories in a grid; the first page opens with a lead story. */
export function StoryGrid({
  items,
  lead = true,
}: {
  items: NewsCard[];
  lead?: boolean;
}) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((card, i) => (
        <ArticleCard
          key={card.id}
          card={card}
          variant={lead && i === 0 ? 'lead' : 'standard'}
          priority={i === 0}
          className={cn(lead && i === 0 && 'sm:col-span-2')}
        />
      ))}
    </div>
  );
}

/** A section, tag, byline or company page: heading, stories, pages. */
export function ListingView({
  eyebrow,
  title,
  description,
  crumbs,
  aside,
  listing,
  hrefFor,
  emptyTitle,
  emptyBody,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  crumbs: { name: string; href?: string }[];
  /** Extra header content: sub-sections, an author's links… */
  aside?: React.ReactNode;
  listing: NewsPage | null;
  hrefFor: (page: number) => string;
  emptyTitle: string;
  emptyBody?: React.ReactNode;
}) {
  const items = listing?.items ?? [];
  return (
    <>
      <section className="border-b border-border bg-paper">
        <Container className="py-8 sm:py-12">
          <Breadcrumbs items={crumbs} />
          <p className="mt-6 font-mono text-xs tracking-[0.14em] text-primary uppercase">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-balance sm:text-5xl">
            {title}
          </h1>
          {description && (
            <div className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {description}
            </div>
          )}
          {aside}
          {listing && listing.total > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              {pluralize(listing.total, 'story', 'stories')}
              {listing.totalPages > 1 &&
                ` · page ${listing.page} of ${listing.totalPages}`}
            </p>
          )}
        </Container>
      </section>
      <Container className="py-10">
        {items.length === 0 ? (
          <EmptyState title={emptyTitle}>{emptyBody}</EmptyState>
        ) : (
          <StoryGrid items={items} lead={listing?.page === 1} />
        )}
        {listing && (
          <Pagination
            page={listing.page}
            totalPages={listing.totalPages}
            hrefFor={hrefFor}
          />
        )}
      </Container>
    </>
  );
}

/** Links to a section's sub-sections, under its heading. */
export function SubSections({
  items,
}: {
  items: { slug: string; name: string }[];
}) {
  if (!items.length) return null;
  return (
    <ul className="mt-6 flex flex-wrap gap-2" aria-label="Sub-sections">
      {items.map((s) => (
        <li key={s.slug}>
          <Link
            href={newsPath.category(s.slug)}
            className="inline-flex rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium hover:border-primary hover:text-primary"
          >
            {s.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
