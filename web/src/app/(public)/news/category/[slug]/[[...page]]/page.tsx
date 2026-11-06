import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CommodityBoard } from '@/components/market/CommodityBoard';
import { IpoWatch } from '@/components/market/IpoBoard';
import { MarketsNowAside } from '@/components/news/listing/MarketsNowAside';
import { ListingView, SubSections } from '@/components/news/ListingView';
import { MostRead } from '@/components/news/MostRead';
import { AcademyPanel } from '@/components/public/AcademyPanel';
import { playStoreUrl } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getIpos, getSnapshot } from '@/market/server';
import { getListing } from '@/news/api';
import { isLanding, newsPath, pageFromSegments } from '@/news/routes';
import { listingMetadata } from '@/news/seo';
import type { CategoryContext } from '@/news/types';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; page?: string[] }> };

/** The newsroom's own category: no aside (spec §5.11, §7.5). */
const OFFICIAL = 'official-updates';

async function load(props: Props) {
  const { slug, page: segments } = await props.params;
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getListing({ category: slug, page });
  if (!listing?.category) return null;
  if (page > 1 && page > listing.totalPages) return null;
  return { page, listing, category: listing.category };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Section not found', robots: { index: false } };
  return listingMetadata({
    title: `${d.category.name} news`,
    description:
      d.category.description ||
      `The latest ${d.category.name} stories from the StockVirtue newsroom.`,
    path: newsPath.category(d.category.slug, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

type AsideKind = 'markets' | 'commodities' | 'ipo' | 'academy' | 'none' | 'most-read';

/**
 * The aside by section (spec §5.11, §7.5): the hub a section belongs to
 * (itself or its parent) decides. Markets (from page 2) and its children →
 * Markets now; Commodities → the commodity board; IPOs → IpoWatch; Learn's
 * later pages → the Academy panel; Official updates → none; everything
 * else → Most read in the section.
 */
function asideKind(c: CategoryContext): AsideKind {
  const root = c.parent?.slug ?? c.slug;
  if (c.slug === OFFICIAL || root === OFFICIAL) return 'none';
  if (root === 'markets') return 'markets';
  if (root === 'commodities') return 'commodities';
  if (root === 'ipo') return 'ipo';
  if (root === 'education') return 'academy';
  return 'most-read';
}

/**
 * A category listing (spec §5.11): breadcrumbs News / {parent} / {name}
 * (the parent appears only there, R1), the H1, the description and the
 * sub-sections; page 1 a splash then rows, later pages rows; the aside by
 * section. No LiveChip on listings. Page 1 of the four hubs' own
 * categories lives at the hub (a permanent redirect, as before).
 */
export default async function CategoryPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const c = d.category;
  // Sections with a landing page keep their first page there.
  if (d.page === 1 && isLanding(c.slug)) permanentRedirect(`/news/${c.slug}`);

  const kind = asideKind(c);
  let rail: ReactNode = null;
  if (kind === 'markets' || kind === 'commodities') {
    const snapshot = await getSnapshot();
    if (snapshot && snapshot.right !== 'OFF') {
      rail =
        kind === 'markets' ? (
          <MarketsNowAside initial={snapshot} />
        ) : (
          <aside aria-label="Commodities and the rupee">
            <CommodityBoard initial={snapshot} density="rail" maxCommodities={4} />
          </aside>
        );
    }
  } else if (kind === 'ipo') {
    const ipos = await getIpos();
    if (ipos) {
      rail = (
        <aside aria-label="IPO watch">
          <IpoWatch initial={ipos} />
        </aside>
      );
    }
  } else if (kind === 'academy') {
    rail = <AcademyPanel headingLevel="h3" playUrl={playStoreUrl(await getSettings())} />;
  } else if (kind === 'most-read') {
    const trending = await getListing({ category: c.slug, sort: 'trending', limit: 5 });
    const title = `Most read in ${c.name}`;
    if (trending?.items.length) {
      rail = (
        <aside aria-labelledby="listing-most-read">
          <MostRead title={title} items={trending.items} headingId="listing-most-read" />
        </aside>
      );
    }
  }

  return (
    <ListingView
      title={c.name}
      description={c.description || undefined}
      crumbs={[
        { name: 'News', href: newsPath.home() },
        ...(c.parent ? [{ name: c.parent.name, href: newsPath.category(c.parent.slug) }] : []),
        { name: c.name },
      ]}
      aside={<SubSections items={c.children} />}
      listing={d.listing}
      hrefFor={(p) => newsPath.category(c.slug, p)}
      emptyTitle="No stories in this section yet"
      rail={rail ?? undefined}
    />
  );
}
