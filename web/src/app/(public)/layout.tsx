import './public.css';
import { RawHtml } from '@/components/CodeInjection';
import { JsonLd } from '@/components/JsonLd';
import { DisclosureInit } from '@/components/public/DisclosureInit';
import { SiteScripts } from '@/components/SiteScripts';
import { DISCLOSURE_SCRIPT } from '@/lib/disclosure';
import { articleSerif, publicFontVars } from '@/lib/fonts-public';
import { PRE_PAINT_SCRIPT } from '@/lib/palette';
import { getSettings } from '@/lib/settings';

/**
 * Every public page: the home page, the site pages and the news site
 * (spec §2.5). The admin-managed code injections, SiteScripts (the consent
 * banner, analytics and ads) and the structured data render here, ONCE per
 * page, and never under /admin, so a broken snippet can't lock staff out.
 * The family layouts inside ((home), (site), news) render only the chrome.
 *
 * The font variables (Hanken Grotesk, SV Mono and the ₹ face; see
 * src/lib/fonts-public.ts) sit on #sv-public, not on <html>: public pages
 * never load the portal's fonts and the portal never loads these. Radix
 * overlays portal into #sv-public so they inherit the fonts and tokens.
 *
 * PhoneDisclosures: DISCLOSURE_SCRIPT opens them at >= 768 px before the
 * first paint; DisclosureInit (rendered once, here) does the same after
 * every client navigation (spec §2.5, §4.11).
 *
 * Keep pages static/ISR: no cookies(), headers(), draftMode(), connection()
 * or searchParams in this layout.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSettings();
  return (
    <>
      <RawHtml html={settings.headCode} />
      <RawHtml html={settings.bodyStartCode} />
      <SiteScripts config={settings.config} cookieVersion={settings.cookieConsent.version} />
      <JsonLd logoUrl={settings.config.branding.logo?.url} />
      <div
        id="sv-public"
        className={`${publicFontVars} ${articleSerif.variable}`}
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        {children}
        <script dangerouslySetInnerHTML={{ __html: DISCLOSURE_SCRIPT }} />
        <DisclosureInit />
      </div>
      <RawHtml html={settings.bodyEndCode} />
    </>
  );
}
