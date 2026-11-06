import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketsNowAside } from '@/components/news/listing/MarketsNowAside';
import { ListingView } from '@/components/news/ListingView';
import { getSnapshot } from '@/market/server';
import { getListing } from '@/news/api';
import { newsPath, pageFromSegments } from '@/news/routes';
import { listingMetadata } from '@/news/seo';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ page?: string[] }> };

async function load(props: Props) {
  const page = pageFromSegments((await props.params).page);
  if (page === null) return null;
  const listing = await getListing({ page });
  if (!listing) return null;
  if (page > 1 && page > listing.totalPages) return null;
  return { page, listing };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Page not found', robots: { index: false } };
  return listingMetadata({
    title: 'Latest news',
    description:
      'Every story from the StockVirtue newsroom, newest first: markets, IPOs, commodities and explainers.',
    path: newsPath.latest(d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

/**
 * Latest (spec §5.11, §7.5): H1 "Latest news" (no eyebrow, no count), the
 * stories in DayGroups ("Wednesday 4 November 2026", `line` rows with the
 * time column), and Markets now in the aside (after the list on phones).
 * No Trending or Most-read rail (official-e2e: no link to the release).
 */
export default async function LatestPage(props: Props) {
  const [d, snapshot] = await Promise.all([load(props), getSnapshot()]);
  if (!d) notFound();
  return (
    <ListingView
      title="Latest news"
      crumbs={[{ name: 'News', href: newsPath.home() }, { name: 'Latest' }]}
      listing={d.listing}
      hrefFor={(p) => newsPath.latest(p)}
      emptyTitle="No stories yet"
      emptyBody="The first stories appear here as soon as they are published."
      layout="days"
      rail={snapshot && snapshot.right !== 'OFF' ? <MarketsNowAside initial={snapshot} /> : undefined}
    />
  );
}
