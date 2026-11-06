'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useHeadroom } from '@/lib/hooks/useHeadroom';
import {
  currentNavHref,
  isFileHref,
  isStoryPath,
  NAV,
  navPrefetch,
  type NavLink,
  type RailCategory,
} from '@/lib/nav';
import { SITE } from '@/lib/site';
import { MenuGlyph, SearchGlyph } from './chrome-glyphs';
import type { NavDrawerProps } from './NavDrawer';
import { SkipLink } from './SkipLink';
import { LazyDialog } from './ui/LazyDialog';

// The drawer's contents load with the dialog on first use (spec §4 rule 2,
// §4.3): never in a page's initial bundle. The Menu button prefetches this
// chunk on pointerenter / touchstart and fetches it on pointerdown, focus
// or a key, alongside the dialog module LazyDialog loads. React.lazy, not
// next/dynamic, whose loader runtime would ride in every page's initial JS:
// the drawer only ever renders inside the open dialog, on the client. If
// the chunk can't load (offline), the open sheet keeps its head and close
// button rather than breaking the page.
const loadDrawer = () => import('./NavDrawer');
const NavDrawer = lazy<ComponentType<NavDrawerProps>>(() =>
  loadDrawer()
    .then((m) => ({ default: m.NavDrawer }))
    .catch(() => ({ default: Nothing })),
);
function Nothing() {
  return null;
}
const prefetchDrawer = () => {
  void loadDrawer().catch(() => undefined);
};

/**
 * The header is solid emerald (#01261A) on every page, so the built-in logo
 * is its on-dark copy: the owner's own /logo-on-dark.png (only "Stock"
 * recoloured light, spec §2.4), never redrawn. A logo uploaded in Site
 * settings is used as it is.
 */
export function onDarkLogo(url: string): string {
  return url === '/logo.png' ? '/logo-on-dark.png' : url;
}

export type SiteHeaderProps = {
  variant: 'home' | 'site' | 'news';
  /** The settings logo, else the owner's /logo.png, shown as its on-dark copy (onDarkLogo). */
  logoUrl: string;
  /** The settings logo's own size, so the image has an intrinsic box (no CLS). */
  logoSize?: { width: number; height: number };
  /** settings.playStoreUrl || SITE.playUrl (playStoreUrl() in src/lib/metadata.ts). */
  playUrl: string;
  /** The MarketStatus chip (>= 1024 px) and drawer block: home with the gate on, every news page. */
  showStatus: boolean;
  /** News pages: the top-level categories in CMS order, for the section rail. */
  categories?: readonly RailCategory[];
  /**
   * Story pages: fold the rail away as the header compacts and draw the
   * reading wire. Left undefined, the header decides from the URL (news
   * variant, `/news/<slug>`), because the news layout can't see it.
   */
  condenseRail?: boolean;
  /**
   * The chip itself, `<MarketStatus variant="chip" media="(min-width: 1024px)" />`,
   * passed in by the layouts that show it (shown only with `showStatus`).
   * A slot, not an import here, so the site pages' layout never pulls the
   * chip or the market store behind it into their JS (spec §6.10).
   */
  status?: ReactNode;
  /** News pages: `<SectionRail categories={…} />`, a slot for the same reason. */
  rail?: ReactNode;
  /**
   * The primary nav (W7 addendum §6.4): the published menu from
   * getChrome() (`chrome.primary`, links already resolved), else NAV. Also
   * the drawer's primary rows and the aria-current rule's items.
   */
  nav?: readonly NavLink[];
  /** The drawer's "More" rows and legal mini-row (`chrome.drawerMore` / `chrome.drawerLegal`), else DRAWER_MORE / DRAWER_LEGAL. */
  drawer?: { more: readonly NavLink[]; legal: readonly NavLink[] };
};

/**
 * One primary-nav link: next/link for a page, a plain <a> for a file (the
 * RSS feed) and, defensively, for an external link (the API never puts one
 * in the primary menu), which opens in a new tab.
 */
function PrimaryLink({ link, current }: { link: NavLink; current: boolean }) {
  if (link.external) {
    return (
      <a href={link.href} className="sv-nav-link" lang={link.lang} target="_blank" rel="noopener noreferrer">
        {link.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  if (isFileHref(link.href)) {
    return (
      <a href={link.href} className="sv-nav-link" lang={link.lang}>
        {link.label}
      </a>
    );
  }
  return (
    <Link
      href={link.href}
      prefetch={navPrefetch(link.href)}
      className="sv-nav-link"
      lang={link.lang}
      aria-current={current ? 'page' : undefined}
    >
      {link.label}
    </Link>
  );
}

/**
 * The site header (spec §4.1), one per public page, rendered by the family
 * layouts. Client: it needs the pathname (aria-current, the story check),
 * headroom and the Menu button.
 *
 * `<header>` is the sticky unit (top 0, z 50): the brand bar and, on news
 * pages, the SectionRail stick together. The brand bar is pixel-identical
 * in every family: the logo, `nav.nav-desktop[aria-label="Primary"]` from
 * 768 px (exactly one `a[href="/news"]`, public-e2e), then the utilities 8
 * px apart: Search, the MarketStatus chip (>= 1024 px, `showStatus`), the
 * primary "Get the app" button (the Play URL, new tab) and, below 768 px,
 * the Menu button that loads NavDrawer.
 *
 * Slots: the layouts that need them pass the chip (`status`: home with the
 * gate on, every news page) and the rail (`rail`: news pages). Next builds
 * each layout's client JS from what it imports, so importing either here
 * would ship them, and the market store, to the site pages too.
 *
 * Height and stickiness (public.css "Chrome"): `--sv-bar-h` is 56 / 60 /
 * 64 px. At >= 1024 px the bar compacts to 56 px on scroll in pure CSS
 * (scroll-driven, no-preference only); below 1024 px useHeadroom hides the
 * header on the way down and brings it back on the way up, folding the
 * news rail away (`data-compact`) more than 200 px down. It never hides
 * while the drawer is open or focus is inside it. On story pages
 * (`condenseRail`) `data-condense` folds the rail with the compaction and
 * the 2 px reading wire hangs from the header's bottom edge.
 *
 * Menus (W7 addendum §6.4): `nav` and `drawer` come from the layouts'
 * getChrome(); left out, the built-in constants of src/lib/nav.ts render,
 * so the header is today's until someone publishes the menus.
 */
export function SiteHeader({
  variant,
  logoUrl,
  logoSize,
  playUrl,
  showStatus,
  categories,
  condenseRail,
  status,
  rail,
  nav,
  drawer,
}: SiteHeaderProps) {
  const pathname = usePathname() ?? '/';
  const ref = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useHeadroom(ref, { enabled: !menuOpen });

  // The drawer closes on every route change (spec §4.3).
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const condense = condenseRail ?? (variant === 'news' && isStoryPath(pathname));
  const items = nav ?? NAV;
  const current = currentNavHref(pathname, items);
  const size = logoSize ?? { width: 567, height: 144 };
  const logo = onDarkLogo(logoUrl);

  return (
    <header
      ref={ref}
      className="sv-header"
      data-variant={variant}
      data-hidden="false"
      data-compact="false"
      data-condense={condense ? 'true' : undefined}
    >
      <SkipLink label={variant === 'news' ? 'Skip to the stories' : 'Skip to content'} />
      <div className="sv-brandbar">
        <div className="sv-container sv-brandbar-row">
          <Link href="/" className="sv-logo" aria-label={`${SITE.name} home`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={size.width} height={size.height} alt={SITE.name} />
          </Link>
          <nav className="nav-desktop" aria-label="Primary">
            {items.map((l) => (
              <PrimaryLink key={l.id ?? l.href} link={l} current={current === l.href} />
            ))}
          </nav>
          <div className="sv-utils">
            <Link href="/news/search" className="sv-icon-btn">
              <SearchGlyph />
              <span className="sr-only">Search the news</span>
            </Link>
            {showStatus && status ? <span className="sv-status-slot">{status}</span> : null}
            <a
              href={playUrl}
              target="_blank"
              rel="noopener"
              className="sv-btn sv-btn-primary sv-getapp"
            >
              Get the app
            </a>
            <span
              className="sv-menu-slot"
              onPointerEnter={prefetchDrawer}
              onTouchStart={prefetchDrawer}
              onPointerDown={prefetchDrawer}
              onFocus={prefetchDrawer}
              onKeyDown={prefetchDrawer}
            >
              <LazyDialog
                variant="right"
                title="Menu"
                hideTitle
                trigger={<MenuGlyph />}
                triggerLabel="Menu"
                triggerClassName="sv-icon-btn"
                closeLabel="Close menu"
                headerStart={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    width={size.width}
                    height={size.height}
                    alt={SITE.name}
                    className="sv-drawer-logo"
                  />
                }
                className="sv-drawer"
                open={menuOpen}
                onOpenChange={setMenuOpen}
              >
                {/* Its own boundary: the sheet's head and close button show
                    at once while the drawer's links are still arriving. */}
                <Suspense fallback={null}>
                  <NavDrawer
                    variant={variant}
                    playUrl={playUrl}
                    showStatus={showStatus}
                    categories={categories}
                    nav={nav}
                    more={drawer?.more}
                    legal={drawer?.legal}
                    onNavigate={() => setMenuOpen(false)}
                  />
                </Suspense>
              </LazyDialog>
            </span>
          </div>
        </div>
      </div>
      {/* A fragment of its own, so the slot isn't an unkeyed list item. */}
      {variant === 'news' && rail ? <Fragment>{rail}</Fragment> : null}
      {condense ? <div className="sv-progress" aria-hidden="true" /> : null}
    </header>
  );
}
