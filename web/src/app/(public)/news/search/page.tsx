import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { EmptyState, Pagination } from '@/components/news/blocks';
import { ListingHead } from '@/components/news/listing/ListingHead';
import s from '@/components/news/listing/listing.module.css';
import { SearchInstruments } from '@/components/news/listing/SearchInstruments';
import { StoryList } from '@/components/news/ListingView';
import { Container } from '@/components/public/Container';
import { cn } from '@/lib/utils';
import { getSnapshot } from '@/market/server';
import { clientFromHeaders } from '@/portal/backend';
import { searchNews } from '@/news/api';
import { pluralize } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { SearchResults } from '@/news/types';

/** Results depend on the query, so this page is rendered per request. */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search every story from the StockVirtue newsroom.',
  robots: { index: false, follow: true },
  alternates: { canonical: '/news/search' },
};

type Props = {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
};

const first = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? '';

/**
 * Search (spec §4.12, §5.11, §7.5): H1 "Search the news", one 56 px field
 * (#news-q, role="search", focused when empty) with the "Search" button,
 * the result count (aria-live), the matching instruments (up to six chips
 * from the curated snapshot, one Stamp), then the results as rows with the
 * query's words in <mark>, and Pagination. Every existing empty and error
 * string is kept; noindex and force-dynamic are unchanged.
 */
export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = first(sp.q).trim().replace(/\s+/g, ' ').slice(0, 120);
  const page = Math.min(Math.max(parseInt(first(sp.page), 10) || 1, 1), 500);

  let results: SearchResults | null = null;
  let error: string | null = null;
  const snapshotP = q.length >= 2 ? getSnapshot() : Promise.resolve(null);
  if (q.length >= 2) {
    try {
      results = await searchNews(q, page, clientFromHeaders(await headers()));
    } catch (err) {
      error = (err as Error).message.startsWith('Too many')
        ? (err as Error).message
        : "Search isn't available right now. Try again in a minute.";
    }
  }
  const snapshot = await snapshotP;

  return (
    <>
      <ListingHead title="Search the news" crumbs={[]}>
        <form action="/news/search" method="get" role="search" className={s.searchForm}>
          <label htmlFor="news-q" className="sr-only">
            Search the news
          </label>
          <div className={s.searchField}>
            <Search className={s.searchIcon} aria-hidden="true" />
            <input
              id="news-q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={120}
              placeholder="A company, a sector, a topic"
              autoFocus={!q}
              className={cn('sv-input', s.searchInput)}
            />
          </div>
          <button type="submit" className={cn('sv-btn sv-btn-primary', s.searchButton)}>
            Search
          </button>
        </form>
        {results ? (
          <p className="t-small mt-4 text-fg-2" aria-live="polite">
            {pluralize(results.total, 'story', 'stories')} for “{results.query}”
          </p>
        ) : null}
        {q.length >= 2 ? <SearchInstruments query={q} initial={snapshot} /> : null}
      </ListingHead>

      <Container className={s.area}>
        <div className="sv-grid">
          <div className={s.main}>
            {error ? (
              <EmptyState title={error} />
            ) : !q ? (
              <EmptyState title="What are you looking for?">
                Try a company, a sector or a topic: “Infosys”, “banking”, “IPO”.
              </EmptyState>
            ) : q.length < 2 ? (
              <EmptyState title="Type at least two letters" />
            ) : results && results.items.length === 0 ? (
              <EmptyState title={`No stories match “${q}”`}>
                Check the spelling, or try fewer or broader words.
              </EmptyState>
            ) : results ? (
              <StoryList items={results.items} splash={false} headingLevel="h2" highlight={q} />
            ) : null}
            {results ? (
              <Pagination
                page={results.page}
                totalPages={results.totalPages}
                hrefFor={(p) => newsPath.search(q, p)}
              />
            ) : null}
          </div>
        </div>
      </Container>
    </>
  );
}
