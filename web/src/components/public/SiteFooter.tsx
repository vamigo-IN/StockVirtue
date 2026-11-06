import Link from 'next/link';
import { CookieSettingsButton } from '@/components/consent/CookieSettingsButton';
import { hasOptionalServices } from '@/lib/consent-services';
import type { SiteSettings } from '@/lib/settings';
import type { NewsCategoryNode } from '@/news/types';
import {
  FooterBody,
  footerParts,
  type FooterChrome,
  type FooterVariant,
  type RenderColumn,
  type RenderLink,
} from './footer-body';
import { PaletteToggle } from './PaletteToggle';
import { PhoneDisclosure } from './PhoneDisclosure';

const nextLink: RenderLink = ({ href, className, lang, label, children }) => (
  <Link href={href} className={className} lang={lang} aria-label={label}>
    {children}
  </Link>
);

/** News, The app and Company fold on phones; Legal (with Cookie settings) stays open. */
const phoneColumn: RenderColumn = ({ column, heading, list }) =>
  column.key === 'legal' ? (
    <div className="sv-footer-col" data-open-col="">
      {heading}
      {list}
    </div>
  ) : (
    <div className="sv-footer-col" data-collapsible="">
      <PhoneDisclosure variant="head" summary={heading}>
        {list}
      </PhoneDisclosure>
    </div>
  );

/**
 * The site footer (spec §4.5), on every public page: a server component
 * with two client islands, Cookie settings and PaletteToggle. It is always
 * the LAST <footer> on the page (widgets-e2e reads the market data line
 * from `footer:last-of-type`).
 *
 * - The dark `.sv-footer` surface (the stage tokens), with the owner's logo
 *   in its on-dark copy (`/logo-on-dark.png`, 36 px tall).
 * - Text by variant: home and site pages carry the legal line, news pages
 *   the newsroom line; both verbatim and marked `data-verbatim`.
 * - Social links from the settings, only those set (brand icon + name).
 * - Four link columns (src/lib/nav.ts FOOTER_LINKS). On phones News, The
 *   app and Company are PhoneDisclosure accordions; Legal, with the Cookie
 *   settings button (only when optional services are on), stays open.
 * - The bottom block: the market data line (when `marketAttribution` is
 *   passed: news pages always, home only with the site-prices gate on),
 *   the not-a-broker line, the company line and the palette switch.
 *
 * Test hooks kept: `.footer-cookie button` computes to
 * rgba(231, 243, 236, 0.7) (privacy-e2e); no Play badge and no button
 * named "English" in the footer.
 *
 * `categories` is accepted for the plan's contract (Appendix A) and is not
 * used: the News column is the fixed list of spec §4.5.
 *
 * `chrome` (W7 addendum §6.4): the layouts pass getChrome()'s answer; its
 * columns, lines, company tail and dated notice line replace the built-in
 * ones (FooterBody's defaults), which render when it is left out.
 */
export function SiteFooter({
  variant,
  settings,
  marketAttribution,
  chrome,
}: {
  variant: FooterVariant;
  settings: SiteSettings;
  categories?: NewsCategoryNode[];
  marketAttribution?: string | null;
  chrome?: FooterChrome | null;
}) {
  return (
    <FooterBody
      variant={variant}
      settings={settings}
      marketAttribution={marketAttribution}
      {...footerParts(chrome)}
      cookieSettings={
        hasOptionalServices(settings.config) ? (
          <CookieSettingsButton className="footer-link" />
        ) : null
      }
      paletteToggle={<PaletteToggle />}
      renderLink={nextLink}
      renderColumn={phoneColumn}
    />
  );
}
