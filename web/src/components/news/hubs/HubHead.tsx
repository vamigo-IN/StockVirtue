import { MarketStatus } from '@/components/market/MarketStatus';
import { ListingHead } from '@/components/news/listing/ListingHead';
import s from '@/components/news/listing/listing.module.css';
import { SubSections } from '@/components/news/ListingView';
import { LANDING_PAGES, newsPath, type LandingSlug } from '@/news/routes';
import type { CategoryContext } from '@/news/types';

/** The hub's name: the CMS category name, else the LANDING_PAGES title. */
export function hubTitle(slug: LandingSlug, category?: CategoryContext | null): string {
  return category?.name || LANDING_PAGES[slug].title;
}

/**
 * The shared hub head (spec §5.10; W5): white and compact, on W0's
 * PageHead. Breadcrumbs (News / {title}); the H1 (`hub-1`): the CMS
 * category name, else the LANDING_PAGES title, with nothing above it but
 * the breadcrumbs (R1); the description (`standfirst`): the CMS
 * description, else the LANDING_PAGES text; the sub-sections as quiet
 * links in a row (public-e2e: "Derivatives" on Markets); and, on Markets
 * and Commodities, a MarketStatus line on the right from 1024 px. No count
 * line. Server component.
 */
export function HubHead({
  slug,
  category,
  status = false,
}: {
  slug: LandingSlug;
  category?: CategoryContext | null;
  /** The MarketStatus line (Markets and Commodities only). */
  status?: boolean;
}) {
  const title = hubTitle(slug, category);
  const subs = category?.children ?? [];
  return (
    <ListingHead
      title={title}
      summary={category?.description || LANDING_PAGES[slug].description}
      crumbs={[{ name: 'News', href: newsPath.home() }, { name: title }]}
    >
      {subs.length || status ? (
        <div className={s.headRow}>
          <SubSections items={subs} />
          {status ? (
            <div className={s.headStatus}>
              <MarketStatus variant="line" media="(min-width: 1024px)" />
            </div>
          ) : null}
        </div>
      ) : null}
    </ListingHead>
  );
}
