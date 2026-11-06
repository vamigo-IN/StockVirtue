import type { Metadata } from 'next';
import { EmptyState } from '@/components/news/blocks';
import { moduleContext, assignModules } from '@/components/news/front/assign-modules';
import { drawableChart } from '@/components/news/front/BandModule';
import { sectionRenders } from '@/components/news/front/chooser';
import { NewsFront } from '@/components/news/front/FrontSection';
import s from '@/components/news/front/front.module.css';
import { Nameplate, newestPublishedAt } from '@/components/news/front/Nameplate';
import { Container } from '@/components/public/Container';
import { playStoreUrl, siteShareImage } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getChart, getIpos, getSnapshot, getTicker } from '@/market/server';
import type { ChartData } from '@/market/types';
import { getHome } from '@/news/api';
import { absolute, NEWS_NAME, RSS_TYPES } from '@/news/seo';

export const revalidate = 30;

const TITLE = `${NEWS_NAME}: Indian stock market news, explained`;
const DESCRIPTION =
  'Indian and global market news, IPOs, commodities and plain-English explainers from the StockVirtue newsroom.';

/**
 * Spec §5.9.4: the title (unchanged), the canonical, the site share image
 * (new: the front had none) and RSS discovery (restored). The page sets
 * its own `alternates`, which replaces the news layout's, so it names the
 * feed itself.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const image = siteShareImage(settings);
  const handle = settings.config.search.twitterHandle;
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: { canonical: '/news', types: RSS_TYPES },
    openGraph: {
      type: 'website',
      url: absolute('/news'),
      siteName: NEWS_NAME,
      locale: 'en_IN',
      title: NEWS_NAME,
      description: DESCRIPTION,
      images: [image],
    },
    // Next fills the card's title, description and image from Open Graph;
    // without this the front inherited the home page's card.
    twitter: {
      card: 'summary_large_image',
      ...(handle ? { site: handle, creator: handle } : {}),
    },
  };
}

/**
 * The news front (spec §5.9): the nameplate, then every CMS section in API
 * order, each laid out by the chooser, with the market modules paired
 * beside them (assignModules) from the server's data, so the HTML has real
 * numbers and the stream takes over after hydration.
 *
 * Fetches: the front, the settings, the snapshot, the IPO board and the
 * ticker (the news layout asks for it too; the request is deduplicated),
 * plus the Nifty 50 six-month chart only when the pairing would draw it
 * (the Markets band under a DELAYED or EOD licence).
 */
export default async function NewsHome() {
  const [{ sections }, settings, snapshot, ipos, ticker] = await Promise.all([
    getHome(),
    getSettings(),
    getSnapshot(),
    getIpos(),
    getTicker(),
  ]);
  const hasStories = sections.some((section) => section.items.length > 0);

  // Ask whether the pairing would draw the chart; fetch it only then, and
  // pair again without it if it can't be drawn (spec §5.9.3 row 3: none).
  let ctx = moduleContext({ snapshot, ticker, ipos, niftyChart: true });
  let chart: ChartData | null = null;
  if (assignModules(sections.filter(sectionRenders), ctx).used.includes('nifty-chart')) {
    const answer = await getChart('NSE:NIFTY', '6M');
    if (drawableChart(answer)) chart = answer;
  }
  if (!chart) ctx = { ...ctx, niftyChart: false };

  return (
    <div className={s.front}>
      <Nameplate newest={newestPublishedAt(sections)} />
      {!hasStories ? (
        <Container className={s.band}>
          <EmptyState title="The newsroom is getting ready">
            The first stories appear here as soon as they are published.
          </EmptyState>
        </Container>
      ) : null}
      <NewsFront
        sections={sections}
        ctx={ctx}
        data={{ snapshot, ipos, chart, playUrl: playStoreUrl(settings) }}
      />
    </div>
  );
}
