import type { Metadata } from 'next';
import { getListing } from '@/news/api';
import { LANDING_PAGES, type LandingSlug } from '@/news/routes';
import { listingMetadata } from '@/news/seo';

/**
 * A hub's metadata (spec §5.10), unchanged from the old LandingPage: the
 * CMS name (else the LANDING_PAGES title) + " news", the CMS description
 * (else the LANDING_PAGES text), and `index: total > 0`, so a hub with no
 * stories yet (Learn in the test fixture) stays noindex while it shows its
 * data, diagrams and glossary to every reader. Its own module, so a hub
 * route doesn't pull the other hubs' client modules into its bundle.
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
