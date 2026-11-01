import type { Metadata } from 'next';
import './news.css';
import { RawHtml } from '@/components/CodeInjection';
import { JsonLd } from '@/components/JsonLd';
import { NewsFooter, NewsHeader } from '@/components/news/NewsChrome';
import { articleSerif } from '@/lib/fonts';
import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
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
  const [settings, categories] = await Promise.all([
    getSettings(),
    getCategories(),
  ]);
  return (
    <div
      className={`${articleSerif.variable} flex min-h-screen flex-col bg-background`}
    >
      <RawHtml html={settings.headCode} />
      <RawHtml html={settings.bodyStartCode} />
      <JsonLd />
      <NewsHeader
        categories={categories}
        playUrl={settings.playStoreUrl || SITE.playUrl}
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <NewsFooter settings={settings} categories={categories} />
      <RawHtml html={settings.bodyEndCode} />
    </div>
  );
}
