import type { Metadata } from 'next';
import './news.css';
import { RawHtml } from '@/components/CodeInjection';
import { JsonLd } from '@/components/JsonLd';
import { SiteScripts } from '@/components/SiteScripts';
import { MarketTicker } from '@/components/news/MarketTicker';
import { NewsFooter, NewsHeader } from '@/components/news/NewsChrome';
import { articleSerif } from '@/lib/fonts';
import { getSettings, logoUrl } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getTicker } from '@/market/server';
import { getCategories } from '@/news/api';
import { NEWS_NAME } from '@/news/seo';

export const metadata: Metadata = {
  title: { default: NEWS_NAME, template: `%s · ${NEWS_NAME}` },
  alternates: {
    types: {
      'application/rss+xml': [{ url: '/news/feed.xml', title: NEWS_NAME }],
    },
  },
};

/**
 * The public news site. Its own stylesheet and masthead; the site's
 * admin-managed code (analytics, verification tags) is injected here just as
 * on the marketing pages.
 */
export default async function NewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, categories, ticker] = await Promise.all([
    getSettings(),
    getCategories(),
    getTicker(),
  ]);
  return (
    <div
      className={`${articleSerif.variable} flex min-h-screen flex-col bg-background`}
    >
      <RawHtml html={settings.headCode} />
      <RawHtml html={settings.bodyStartCode} />
      <SiteScripts config={settings.config} />
      <JsonLd logoUrl={settings.config.branding.logo?.url} />
      <NewsHeader
        categories={categories}
        playUrl={settings.playStoreUrl || SITE.playUrl}
        logoUrl={logoUrl(settings)}
      />
      <MarketTicker initial={ticker} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <NewsFooter
        settings={settings}
        categories={categories}
        marketAttribution={ticker?.attribution}
      />
      <RawHtml html={settings.bodyEndCode} />
    </div>
  );
}
