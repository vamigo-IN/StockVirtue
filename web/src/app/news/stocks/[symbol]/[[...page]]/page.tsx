import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AppPromo, Container } from '@/components/news/blocks';
import { ListingView } from '@/components/news/ListingView';
import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getStock } from '@/news/api';
import { newsPath, pageFromSegments } from '@/news/routes';
import { listingMetadata } from '@/news/seo';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ symbol: string; page?: string[] }> };

async function load(props: Props) {
  const { symbol, page: segments } = await props.params;
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getStock(symbol, page);
  if (!listing) return null;
  if (page > 1 && page > listing.totalPages) return null;
  // Any letter case works; the canonical address uses the exchange's symbol.
  return { page, listing, stock: listing.stock };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Stock not found', robots: { index: false } };
  const name = d.stock.name ?? d.stock.symbol;
  return listingMetadata({
    title: `${name} (${d.stock.symbol}) news`,
    description: `Latest news and analysis on ${name} (${d.stock.exchange}: ${d.stock.symbol}) from the StockVirtue newsroom.`,
    path: newsPath.stock(d.stock.symbol, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

export default async function StockPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const settings = await getSettings();
  const name = d.stock.name ?? d.stock.symbol;
  return (
    <>
      <ListingView
        eyebrow={`${d.stock.exchange} · ${d.stock.symbol}`}
        title={name}
        description={`News and analysis about ${name}.`}
        crumbs={[{ name: 'News', href: newsPath.home() }, { name }]}
        listing={d.listing}
        hrefFor={(p) => newsPath.stock(d.stock.symbol, p)}
        emptyTitle={`No stories about ${name} yet`}
      />
      <Container>
        <AppPromo
          playUrl={settings.playStoreUrl || SITE.playUrl}
          title={`Practise trading ${d.stock.symbol} with virtual money`}
        />
      </Container>
    </>
  );
}
