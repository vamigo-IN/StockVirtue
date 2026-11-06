import { NAV, type NavLink } from '@/lib/nav';
import type { SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { SearchGlyph } from './chrome-glyphs';
import { FooterBody, footerParts, type FooterChrome } from './footer-body';
import { SkipLink } from './SkipLink';

/**
 * The root 404's chrome (spec §4.14, §5.8). SERVER-ONLY AND CLIENT-FREE:
 * this file must reference no client module, not even indirectly. The root
 * not-found tree is serialised into every page's payload as the fallback,
 * so a client import here would ship to every public and /admin route.
 * Hence plain <a> links (next/link is a client module) and inline SVG (the
 * lucide-react icons are client modules too); the 404 runs no client code.
 *
 * - StaticHeader: SiteHeader's brand bar, class for class (the logo, the
 *   five nav links, Search and "Get the app"), with no Menu, drawer, status
 *   chip or headroom: below 768 px the nav links wrap into a second row of
 *   44 px links instead. It still compacts in CSS at >= 1024 px.
 * - StaticFooter: SiteFooter's "site" variant without the Cookie settings
 *   button and the palette switch. With no script to open them on wide
 *   screens, its link columns are plain open lists at every width.
 *
 * Menus and footer texts (W7 addendum §6.4): `nav` and `chrome` come from
 * not-found.tsx's getChrome(); left out, the built-in constants render.
 */
export function StaticHeader({
  logoUrl = '/logo.png',
  logoSize,
  playUrl = SITE.playUrl,
  nav = NAV,
}: {
  logoUrl?: string;
  logoSize?: { width: number; height: number };
  playUrl?: string;
  /** The published primary menu (getChrome()'s `primary`), else NAV. */
  nav?: readonly NavLink[];
} = {}) {
  const size = logoSize ?? { width: 567, height: 144 };
  return (
    <header className="sv-header" data-variant="static">
      <SkipLink />
      <div className="sv-brandbar" data-static="">
        <div className="sv-container sv-brandbar-row">
          <a href="/" className="sv-logo" aria-label={`${SITE.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl === '/logo.png' ? '/logo-on-dark.png' : logoUrl}
              width={size.width}
              height={size.height}
              alt={SITE.name}
            />
          </a>
          <nav className="nav-desktop" aria-label="Primary">
            {nav.map((l) =>
              l.external ? (
                <a
                  key={l.id ?? l.href}
                  href={l.href}
                  className="sv-nav-link"
                  lang={l.lang}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {l.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <a key={l.id ?? l.href} href={l.href} className="sv-nav-link" lang={l.lang}>
                  {l.label}
                </a>
              ),
            )}
          </nav>
          <div className="sv-utils">
            <a href="/news/search" className="sv-icon-btn">
              <SearchGlyph />
              <span className="sr-only">Search the news</span>
            </a>
            <a
              href={playUrl}
              target="_blank"
              rel="noopener"
              className="sv-btn sv-btn-primary sv-getapp"
            >
              Get the app
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

export function StaticFooter({
  settings,
  chrome,
}: {
  settings?: SiteSettings;
  /** getChrome()'s answer: the published columns, lines and notice line. */
  chrome?: FooterChrome | null;
}) {
  return <FooterBody variant="site" settings={settings} {...footerParts(chrome)} />;
}
