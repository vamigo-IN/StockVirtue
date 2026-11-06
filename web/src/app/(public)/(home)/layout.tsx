import type { Metadata } from 'next';
import { pricesOnSite } from '@/components/market/gate';
import { HeaderStatus } from '@/components/market/HeaderStatus';
import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { logoSize, pageMetadata, playStoreUrl } from '@/lib/metadata';
import { getSettings, logoUrl } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getChrome } from '@/lib/site-content/api';
import { getTicker } from '@/market/server';

/**
 * The home page's metadata (spec §5.1.5, §9.5.1): its own canonical "/",
 * the absolute title "StockVirtue: stock market simulator for India", the
 * home description (the admin's site description when set) and the share
 * image. It lives in this layout, which only "/" uses, so the page itself
 * needs no metadata export.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  return pageMetadata({
    title: `${settings.siteTitle || SITE.name}: ${SITE.tagline}`,
    absoluteTitle: true,
    description: settings.siteDescription || SITE.description,
    path: '/',
  });
}

/**
 * The home page family (spec §2.1, §2.5). No font preloads of its own: the
 * Emerald Terminal faces (Hanken Grotesk, SV Mono) are next/font faces that
 * Next preloads itself (src/lib/fonts-public.ts), and the old Archivo stage
 * cuts are no longer used on the home page.
 *
 * Chrome: SiteHeader variant="home", with the MarketStatus chip (passed in
 * as its `status` slot, through HeaderStatus: see why there) only when the
 * site-prices gate is on (spec §7.0 rule 4), and SiteFooter variant="home", whose market data line also
 * follows the gate. The menus and footer texts come from getChrome() (W7
 * addendum §6.4; the built-in chrome until someone publishes).
 */
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, ticker, chrome] = await Promise.all([getSettings(), getTicker(), getChrome()]);
  // The site-prices gate (spec §7.0 rule 4).
  const gateOn = pricesOnSite(ticker);
  return (
    <>
      <SiteHeader
        variant="home"
        logoUrl={logoUrl(settings)}
        logoSize={logoSize(settings)}
        playUrl={playStoreUrl(settings)}
        showStatus={gateOn}
        status={gateOn ? <HeaderStatus /> : null}
        nav={chrome.primary}
        drawer={{ more: chrome.drawerMore, legal: chrome.drawerLegal }}
      />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter
        variant="home"
        settings={settings}
        marketAttribution={gateOn ? ticker?.attribution : null}
        chrome={chrome}
      />
    </>
  );
}
