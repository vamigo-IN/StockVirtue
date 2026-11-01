import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ArticleCard } from '@/components/news/ArticleCard';
import { Container, EmptyState, Pagination } from '@/components/news/blocks';
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

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = first(sp.q).trim().replace(/\s+/g, ' ').slice(0, 120);
  const page = Math.min(Math.max(parseInt(first(sp.page), 10) || 1, 1), 500);

  let results: SearchResults | null = null;
  let error: string | null = null;
  if (q.length >= 2) {
    try {
      results = await searchNews(q, page, clientFromHeaders(await headers()));
    } catch (err) {
      error = (err as Error).message.startsWith('Too many')
        ? (err as Error).message
        : "Search isn't available right now. Try again in a minute.";
    }
  }

  return (
    <>
      <section className="border-b border-border bg-paper">
        <Container className="py-8 sm:py-12">
          <h1 className="text-3xl font-bold sm:text-5xl">Search the news</h1>
          <form
            action="/news/search"
            method="get"
            role="search"
            className="mt-6 flex max-w-2xl gap-2"
          >
            <label htmlFor="news-q" className="sr-only">
              Search stories
            </label>
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="news-q"
                name="q"
                type="search"
                defaultValue={q}
                maxLength={120}
                placeholder="A company, a sector, a topic…"
                autoFocus={!q}
                className="h-12 w-full rounded-lg border border-border bg-background pr-3 pl-11 text-base shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
            </div>
            <button
              type="submit"
              className="h-12 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Search
            </button>
          </form>
          {results && (
            <p
              className="mt-4 text-sm text-muted-foreground"
              aria-live="polite"
            >
              {pluralize(results.total, 'story', 'stories')} for “
              {results.query}”
            </p>
          )}
        </Container>
      </section>

      <Container className="py-10">
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
          <div className="max-w-3xl divide-y divide-border">
            {results.items.map((c) => (
              <ArticleCard key={c.id} card={c} variant="compact" />
            ))}
          </div>
        ) : null}
        {results && (
          <Pagination
            page={results.page}
            totalPages={results.totalPages}
            hrefFor={(p) => newsPath.search(q, p)}
          />
        )}
      </Container>
    </>
  );
}
