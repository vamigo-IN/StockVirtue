import type { Metadata } from 'next';
import { HeaderStatus } from '@/components/market/HeaderStatus';
import { MarketTicker } from '@/components/news/MarketTicker';
import { SectionRail } from '@/components/public/SectionRail';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { logoSize, playStoreUrl } from '@/lib/metadata';
import { getSettings, logoUrl } from '@/lib/settings';
import { getChrome } from '@/lib/site-content/api';
import { getTicker } from '@/market/server';
import { getCategories } from '@/news/api';
import { NEWS_NAME, RSS_TYPES } from '@/news/seo';

export const metadata: Metadata = {
  title: { default: NEWS_NAME, template: `%s · ${NEWS_NAME}` },
  // Pages that set their own canonical replace this whole object, so
  // listingMetadata() and articleMetadata() add RSS_TYPES themselves.
  alternates: { types: RSS_TYPES },
};

/**
 * The news site (spec §2.1, §2.5): the header with the section rail, the
 * masthead ticker, the stories, and the footer with the newsroom line and
 * the market data line. The code injections, consent banner and JSON-LD
 * come from the (public) layout around this one.
 *
 * SiteHeader variant="news" carries SectionRail INSIDE <header> (official-e2e
 * finds its "Official updates" link there) and the MarketStatus chip; on
 * story pages it folds the rail as it compacts and draws the reading wire
 * (it tells a story from the URL, which this layout can't see). The chip
 * and the rail are passed in as slots from here, so only the pages that
 * show them ship their code (spec §6.10); the chip goes through
 * HeaderStatus, never MarketStatus itself (see why there). The menus and
 * footer texts come from getChrome() (W7 addendum §6.4; the built-in
 * chrome until someone publishes); the rail's categories stay the CMS's.
 */
export default async function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, categories, ticker, chrome] = await Promise.all([
    getSettings(),
    getCategories(),
    getTicker(),
    getChrome(),
  ]);
  // #sv-public belongs to the (public) layout, so news pages mark their own
  // subtree: [data-rail="news"] sets --sv-rail-h and --sv-chrome-h for the
  // section rail (public.css; spec §3.9, §4.1). Custom properties inherit
  // through display: contents, and the wrapper adds no box. The header must
  // stay its direct child: the story rule is
  // [data-rail="news"]:has(> .sv-header[data-condense]).
  const rail = categories.map((c) => ({ slug: c.slug, name: c.name }));
  return (
    <div data-rail="news" style={{ display: 'contents' }}>
      <SiteHeader
        variant="news"
        logoUrl={logoUrl(settings)}
        logoSize={logoSize(settings)}
        playUrl={playStoreUrl(settings)}
        showStatus
        categories={rail}
        status={<HeaderStatus />}
        rail={<SectionRail categories={rail} />}
        nav={chrome.primary}
        drawer={{ more: chrome.drawerMore, legal: chrome.drawerLegal }}
      />
      <MarketTicker initial={ticker} />
      {/* The mint page ground (Emerald Terminal): white cards and sheets
          sit on it; the story page lays its own white reading sheet. */}
      <main id="main" tabIndex={-1} className="bg-paper">
        {children}
      </main>
      <SiteFooter
        variant="news"
        settings={settings}
        categories={categories}
        marketAttribution={ticker?.attribution}
        chrome={chrome}
      />
    </div>
  );
}
