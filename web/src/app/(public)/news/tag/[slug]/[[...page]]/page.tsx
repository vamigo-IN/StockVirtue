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

type Props = { params: Promise<{ slug: string; page?: string[] }> };

async function load(props: Props) {
  const { slug, page: segments } = await props.params;
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getListing({ tag: slug, page });
  if (!listing?.tag) return null;
  if (page > 1 && page > listing.totalPages) return null;
  return { page, listing, tag: listing.tag };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Topic not found', robots: { index: false } };
  return listingMetadata({
    title: `${d.tag.name}: latest news`,
    description: `Stories about ${d.tag.name} from the StockVirtue newsroom.`,
    path: newsPath.tag(d.tag.slug, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

/**
 * A tag listing (spec §5.11): H1 the tag's name (public-e2e: exactly
 * "Banking"), the summary "Stories tagged {name}, newest first." under it
 * (R1), the stories as rows, and Markets now in the aside.
 */
export default async function TagPage(props: Props) {
  const [d, snapshot] = await Promise.all([load(props), getSnapshot()]);
  if (!d) notFound();
  return (
    <ListingView
      title={d.tag.name}
      description={`Stories tagged ${d.tag.name}, newest first.`}
      crumbs={[{ name: 'News', href: newsPath.home() }, { name: d.tag.name }]}
      listing={d.listing}
      hrefFor={(p) => newsPath.tag(d.tag.slug, p)}
      emptyTitle="No stories on this topic yet"
      splash={false}
      rail={snapshot && snapshot.right !== 'OFF' ? <MarketsNowAside initial={snapshot} /> : undefined}
    />
  );
}
