import type { Metadata } from 'next';
import { getListing } from '@/news/api';
import { LANDING_PAGES, newsPath, type LandingSlug } from '@/news/routes';
import { listingMetadata } from '@/news/seo';
import { ListingView, SubSections } from './ListingView';

/**
 * A curated section front (/news/markets, /news/ipo …): the section's latest
 * stories; market widgets join these pages with the market-data phase. Works
 * before the category exists, with an empty state and no indexing.
 */
export async function landingMetadata(slug: LandingSlug): Promise<Metadata> {
  const listing = await getListing({ category: slug, page: 1 });
  const fallback = LANDING_PAGES[slug];
  return listingMetadata({
    title: `${listing?.category?.name ?? fallback.title} news`,
    description: listing?.category?.description || fallback.description,
    path: `/news/${slug}`,
    page: 1,
    index: (listing?.total ?? 0) > 0,
  });
}

export async function LandingPage({ slug }: { slug: LandingSlug }) {
  const listing = await getListing({ category: slug, page: 1 });
  const fallback = LANDING_PAGES[slug];
  const category = listing?.category;
  const title = category?.name ?? fallback.title;
  return (
    <ListingView
      eyebrow="Section"
      title={title}
      description={category?.description || fallback.description}
      crumbs={[{ name: 'News', href: newsPath.home() }, { name: title }]}
      aside={<SubSections items={category?.children ?? []} />}
      listing={listing}
      hrefFor={(p) => newsPath.category(slug, p)}
      emptyTitle={`No ${title} stories yet`}
      emptyBody="Stories appear here as soon as the newsroom publishes them."
    />
  );
}
