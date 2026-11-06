import { pricesOnSite } from '@/components/market/gate';
import { HomeView } from '@/components/home/pages/HomeView';
import { HOME_DEFAULT } from '@/content/site/home';
import { getSettings } from '@/lib/settings';
import { getPageContent, getSharedContent } from '@/lib/site-content/api';
import { getRidgeline } from '@/market/ridgeline';
import { getIpos, getSnapshot, getTicker } from '@/market/server';
import { getListing } from '@/news/api';

/**
 * The home page `/` (spec §5.1; W7 addendum §11.3; Emerald Terminal, 6 Nov
 * 2026). A thin page: it fetches
 * everything in parallel, every source null-safe, and renders the pure
 * HomeView. ISR: the effective revalidate is 15 s (the snapshot's and the
 * ticker's), the content items 60 s (or on publish, by tag), the Ridgeline's
 * charts 3,600 s (the hero desk draws its Nifty 50 line from them).
 *
 * - Content: getPageContent('home', HOME_DEFAULT) and the shared "What it
 *   won't do" (tags content:home and content:wont-do). Both never throw:
 *   while the API has nothing published they return the built-in defaults.
 * - getRidgeline() needs the gate, so it starts as soon as the ticker
 *   arrives; the ticker and the snapshot are deduplicated by Next, so the
 *   (home) layout's own getTicker() and getRidgeline()'s getSnapshot() cost
 *   no second request.
 * - getListing({ limit: 5 }) (the news section's lead and four rows) is
 *   wrapped, so a news outage only hides the stories.
 *
 * Metadata (title, description, canonical, share image) is the (home)
 * layout's: home has no SEO field of its own (addendum §3.2).
 */
export const revalidate = 15;

export default async function HomePage() {
  const ticker = getTicker();
  const [content, wontDo, settings, tickerData, snapshot, ridge, ipos, listing] =
    await Promise.all([
      getPageContent('home', HOME_DEFAULT),
      getSharedContent('wont-do'),
      getSettings(),
      ticker,
      getSnapshot(),
      ticker.then((t) => getRidgeline(pricesOnSite(t))),
      getIpos(),
      getListing({ limit: 5 }).catch(() => null),
    ]);
  return (
    <HomeView
      content={content}
      wontDo={wontDo}
      settings={settings}
      data={{
        ticker: tickerData,
        snapshot,
        ridge,
        ipos,
        news: listing ? listing.items : null,
      }}
    />
  );
}
