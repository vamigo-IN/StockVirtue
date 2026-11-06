'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useId, type ReactNode } from 'react';
import { MarketStatus } from '@/components/market/MarketStatus';
import {
  currentNavHref,
  DRAWER_LEGAL,
  DRAWER_MORE,
  isCurrentSection,
  isFileHref,
  NAV,
  navPrefetch,
  railItems,
  type NavLink,
  type RailCategory,
} from '@/lib/nav';
import { newsPath } from '@/news/routes';
import { SearchGlyph } from './chrome-glyphs';

export type NavDrawerProps = {
  variant: 'home' | 'site' | 'news';
  playUrl: string;
  /** Show MarketStatus as a block (home with the gate on, news pages). */
  showStatus: boolean;
  /** News pages: the section rail's categories, listed under "Sections". */
  categories?: readonly RailCategory[];
  /** Called when a link, the button or the search form is used; the header closes the drawer. */
  onNavigate?: () => void;
  /** The primary rows (W7 addendum §6.4: SiteHeader passes its `nav`), else NAV. */
  nav?: readonly NavLink[];
  /** The "More" rows, else DRAWER_MORE. */
  more?: readonly NavLink[];
  /** The legal mini-row, else DRAWER_LEGAL. */
  legal?: readonly NavLink[];
};

/**
 * One drawer link: next/link for a page (with aria-current when it is the
 * current one), a plain <a> for a file (the RSS feed), and a new-tab <a>
 * with an sr-only note for an external link (W7 addendum §6.2).
 */
function DrawerLink({
  link,
  className,
  current,
  onClick,
}: {
  link: NavLink;
  className?: string;
  current?: boolean;
  onClick: () => void;
}): ReactNode {
  if (link.external) {
    return (
      <a
        href={link.href}
        className={className}
        lang={link.lang}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {link.label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  if (isFileHref(link.href)) {
    return (
      <a href={link.href} className={className} lang={link.lang} onClick={onClick}>
        {link.label}
      </a>
    );
  }
  return (
    <Link
      href={link.href}
      prefetch={navPrefetch(link.href)}
      className={className}
      lang={link.lang}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {link.label}
    </Link>
  );
}

/**
 * The phone drawer's contents (spec §4.3). NEVER import this file
 * statically from page or chrome code: SiteHeader loads it with
 * React.lazy inside its LazyDialog (variant "right"), so it is in no
 * page's initial bundle and mounts only while the drawer is open. The
 * dialog itself (Radix, from ui/Dialog via LazyDialog) gives the focus
 * trap, Escape, the scroll lock and focus return to the Menu button; the
 * top row (the logo and "Close menu") belongs to the dialog.
 *
 * Top to bottom: the search form; MarketStatus as a block (when
 * `showStatus`); the primary links (52 px rows, `aria-current` on the
 * active one); on news pages the rail's sections under "Sections" (48 px
 * rows); Features, Download, FAQ and Contact (48 px rows); a full-width
 * "Get the app" button (48 px); the legal mini-row. Every link, the button
 * and the search close the drawer (`onNavigate`); a route change closes it
 * too (SiteHeader).
 *
 * The three link lists come from the published chrome when SiteHeader
 * passes them (`nav`, `more`, `legal`; W7 addendum §6.4), else from the
 * built-in constants in src/lib/nav.ts.
 */
export function NavDrawer({
  variant,
  playUrl,
  showStatus,
  categories,
  onNavigate,
  nav,
  more,
  legal,
}: NavDrawerProps) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const fieldId = useId();
  const sectionsId = useId();
  const primary = nav ?? NAV;
  const current = currentNavHref(pathname, primary);
  const done = () => onNavigate?.();

  return (
    <div className="sv-drawer-body">
      <form
        role="search"
        action="/news/search"
        method="get"
        className="sv-drawer-search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
          done();
          router.push(newsPath.search(q || undefined));
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          Search the news
        </label>
        <input
          id={fieldId}
          name="q"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="A company, a sector, a topic"
          className="sv-input"
        />
        <button type="submit" className="sv-icon-btn" aria-label="Search">
          <SearchGlyph />
        </button>
      </form>

      {showStatus ? (
        <div className="sv-drawer-status">
          <MarketStatus variant="block" />
        </div>
      ) : null}

      <nav aria-label="Primary" className="sv-drawer-group">
        <ul className="sv-drawer-list" data-size="lg">
          {primary.map((l) => (
            <li key={l.id ?? l.href}>
              <DrawerLink link={l} className="sv-drawer-link" current={current === l.href} onClick={done} />
            </li>
          ))}
        </ul>
      </nav>

      {variant === 'news' ? (
        <nav aria-labelledby={sectionsId} className="sv-drawer-group">
          <h3 id={sectionsId} className="t-label sv-drawer-head">
            Sections
          </h3>
          <ul className="sv-drawer-list">
            {railItems(categories).map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="sv-drawer-link"
                  aria-current={isCurrentSection(pathname, l.href) ? 'page' : undefined}
                  onClick={done}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <ul className="sv-drawer-list sv-drawer-more">
        {(more ?? DRAWER_MORE).map((l) => (
          <li key={l.id ?? l.href}>
            <DrawerLink link={l} className="sv-drawer-link" current={pathname === l.href} onClick={done} />
          </li>
        ))}
      </ul>

      <a
        href={playUrl}
        target="_blank"
        rel="noopener"
        className="sv-btn sv-btn-primary sv-drawer-cta"
        data-size="lg"
        onClick={done}
      >
        Get the app
      </a>

      <ul className="sv-drawer-legal t-small">
        {(legal ?? DRAWER_LEGAL).map((l) => (
          <li key={l.id ?? l.href}>
            <DrawerLink link={l} onClick={done} />
          </li>
        ))}
      </ul>
    </div>
  );
}
