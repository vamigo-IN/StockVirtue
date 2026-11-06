import { SiteFooter } from '@/components/public/SiteFooter';
import { SiteHeader } from '@/components/public/SiteHeader';
import { logoSize, playStoreUrl } from '@/lib/metadata';
import { getSettings, logoUrl } from '@/lib/settings';
import { getChrome } from '@/lib/site-content/api';

/**
 * The site pages (spec §2.1, §2.5): /features, /download, /about, /faq,
 * /contact and the legal pages. Settings only, no market fetch, so these
 * pages keep their 60 s ISR. No font preload of its own: the band heads'
 * H1s are Hanken (Emerald Terminal), which the public layout's next/font
 * faces preload; the Archivo stage-2 cut is no longer used here.
 *
 * Chrome: SiteHeader variant="site" (no market status) and SiteFooter
 * variant="site" (the legal line, no market data line). The menus and
 * footer texts come from getChrome() (W7 addendum §6.4; the built-in chrome
 * until someone publishes).
 */
export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [settings, chrome] = await Promise.all([getSettings(), getChrome()]);
  return (
    <>
      <SiteHeader
        variant="site"
        logoUrl={logoUrl(settings)}
        logoSize={logoSize(settings)}
        playUrl={playStoreUrl(settings)}
        showStatus={false}
        nav={chrome.primary}
        drawer={{ more: chrome.drawerMore, legal: chrome.drawerLegal }}
      />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter variant="site" settings={settings} chrome={chrome} />
    </>
  );
}
