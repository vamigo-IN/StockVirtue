import { HomeView } from '@/components/home/pages/HomeView';
import { loadHomeData } from '@/components/home/home-data';
import { HOME_DEFAULT } from '@/content/site/home';
import { getSettings } from '@/lib/settings';
import { getPageContent, getSharedContent } from '@/lib/site-content/api';
import { getTicker } from '@/market/server';

/**
 * The home page `/` (spec §5.1; W7 addendum §11.3; Emerald Terminal, 6 Nov
 * 2026). A thin page: it fetches
 * everything in parallel, every source null-safe, and renders the pure
 * HomeView. ISR: the effective revalidate is 15 s (the snapshot's, the
 * ticker's, the movers' and the contract note's), the content items 60 s
 * (or on publish, by tag), the option chain 60 s, the Ridgeline's charts
 * 3,600 s (the hero desk draws its year-long line from them).
 *
 * - Content: getPageContent('home', HOME_DEFAULT) and the shared "What it
 *   won't do" (tags content:home and content:wont-do). Both never throw:
 *   while the API has nothing published they return the built-in defaults.
 * - Data: loadHomeData() (components/home/home-data.ts, shared with the
 *   preview route). What needs the site-prices gate starts as soon as the
 *   ticker arrives; the ticker and the snapshot are deduplicated by Next, so
 *   the (home) layout's own getTicker() and getRidgeline()'s getSnapshot()
 *   cost no second request. A news outage only hides the stories.
 *
 * Metadata (title, description, canonical, share image) is the (home)
 * layout's: home has no SEO field of its own (addendum §3.2).
 */
export const revalidate = 15;

export default async function HomePage() {
  const [content, wontDo, settings, data] = await Promise.all([
    getPageContent('home', HOME_DEFAULT),
    getSharedContent('wont-do'),
    getSettings(),
    loadHomeData(getTicker()),
  ]);
  return <HomeView content={content} wontDo={wontDo} settings={settings} data={data} />;
}
