import { CommoditiesHub } from '@/components/news/hubs/CommoditiesHub';
import { IpoHub } from '@/components/news/hubs/IpoHub';
import { LearnHub } from '@/components/news/hubs/LearnHub';
import { MarketsHub } from '@/components/news/hubs/MarketsHub';
import type { LandingSlug } from '@/news/routes';

export { landingMetadata } from '@/components/news/hubs/metadata';

/**
 * The four section hubs by slug (spec §5.10), kept for the old import
 * path until W6's cleanup. The hub routes import their own hub and
 * `hubs/metadata` directly instead: importing this module would put all
 * four hubs' client modules into one route's bundle.
 */
export function LandingPage({ slug }: { slug: LandingSlug }) {
  switch (slug) {
    case 'markets':
      return <MarketsHub />;
    case 'commodities':
      return <CommoditiesHub />;
    case 'ipo':
      return <IpoHub />;
    case 'education':
      return <LearnHub />;
  }
}
