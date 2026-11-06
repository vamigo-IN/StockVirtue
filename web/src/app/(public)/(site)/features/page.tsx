import type { Metadata } from 'next';
import { pricesOnSite } from '@/components/market/gate';
import { FeaturesView } from '@/components/site/pages/FeaturesView';
import { FEATURES_DEFAULT } from '@/content/site/features';
import { pageMetadata } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getPageContent, getSharedContent } from '@/lib/site-content/api';
import { getChart, getTicker } from '@/market/server';

/**
 * /features, "What's in the app" (spec §5.2): content, settings, the shared
 * "What it won't do" item, the ticker (for the site-prices gate) and the
 * Nifty 50 six-month chart, fetched in parallel; FeaturesView renders them.
 * ISR (no request data).
 */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent('features', FEATURES_DEFAULT);
  return pageMetadata({ title: content.seo.title, description: content.seo.description, path: '/features' });
}

export default async function FeaturesPage() {
  const [content, settings, wontDo, ticker, chart] = await Promise.all([
    getPageContent('features', FEATURES_DEFAULT),
    getSettings(),
    getSharedContent('wont-do'),
    getTicker(),
    getChart('NSE:NIFTY', '6M'),
  ]);
  return (
    <FeaturesView
      content={content}
      settings={settings}
      data={{ chart: pricesOnSite(ticker) ? chart : null, wontDo }}
    />
  );
}
