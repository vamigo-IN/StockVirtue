/**
 * The public site's navigation (spec §2.3, §4.5): the primary nav, shared by
 * every family's header (SiteHeader, StaticHeader), and the footer's link
 * directory. Plain data and pure functions, so server and client code can
 * both import it.
 *
 * Every link is a normal in-site link: the public stylesheets are one, so
 * links between the home page, the site pages and the news site are
 * next/link client navigations (spec §2.3; no full page loads between them).
 * Only links into /admin stay plain <a>.
 */

import { newsPath } from '@/news/routes';

export interface NavLink {
  href: string;
  label: string;
  /** Set on a link whose label is in another language (the Hindi notice). */
  lang?: string;
  /**
   * A stable id (React keys, the editor's diffs). The admin-managed chrome
   * (W7 addendum §6.1) gives every link one, unique per list; the built-in
   * constants below leave it out and are keyed by `href`.
   */
  id?: string;
  /**
   * An external https link (W7 addendum §6.2): rendered as a plain <a>
   * with target="_blank", rel="noopener noreferrer" and an sr-only
   * "(opens in a new tab)". Never in the primary nav.
   */
  external?: boolean;
  /** Primary items only: more paths that make this item current (§6.5; at most 3). */
  alsoCurrentOn?: string[];
}

/**
 * The primary navigation, identical on every public page
 * (`nav.nav-desktop[aria-label="Primary"]`). Exactly one link points at
 * /news (public-e2e).
 */
export const NAV: readonly NavLink[] = [
  { href: '/news', label: 'News' },
  { href: '/news/markets', label: 'Markets' },
  { href: '/news/education', label: 'Learn' },
  { href: '/features', label: 'The app', alsoCurrentOn: ['/download'] },
  { href: '/about', label: 'About' },
];

/** A path without its query, fragment or trailing slash ("/news/" → "/news"). */
function bare(path: string): string {
  return path.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
}

/**
 * The primary-nav link that gets `aria-current="page"` on `pathname`, or
 * null (spec §2.3; W7 addendum §6.5). Among `items` (the published primary
 * menu, else NAV), an item matches when its href equals the pathname or is
 * a whole-segment prefix of it (`/news` matches `/news/latest`, never
 * `/newsroom`), or when its `alsoCurrentOn` lists the pathname; the
 * LONGEST match wins. "/" matches only itself, and external links never.
 * With NAV this is today's rule on every real route:
 * - News: every /news route except Markets and Learn;
 * - Markets: /news/markets; Learn: /news/education;
 * - The app: /features and /download;
 * - About: /about.
 * Returns the winning item's href as written (so callers compare with
 * `l.href`).
 */
export function currentNavHref(pathname: string, items: readonly NavLink[] = NAV): string | null {
  const p = bare(pathname);
  let best: string | null = null;
  let bestLength = -1;
  for (const item of items) {
    if (item.external) continue;
    const h = bare(item.href);
    let length = -1;
    if (p === h || (h !== '/' && p.startsWith(`${h}/`))) length = h.length;
    for (const also of item.alsoCurrentOn ?? []) {
      const a = bare(also);
      if (p === a && a.length > length) length = a.length;
    }
    if (length > bestLength) {
      best = item.href;
      bestLength = length;
    }
  }
  return best;
}

/** Links that are files, not pages (the RSS feed): always a plain <a>, never next/link. */
export function isFileHref(href: string): boolean {
  return /\.(?:xml|txt|json)$/.test(href.replace(/[?#].*$/, ''));
}

/** next/link's prefetch for a menu link: stock pages are never prefetched (plan §0.13). */
export function navPrefetch(href: string): false | undefined {
  return /^\/news\/stocks\//.test(href) ? false : undefined;
}

/**
 * The first path segments under /news that are sections, listings, feeds or
 * stock pages rather than stories (the folders of src/app/(public)/news).
 * The backend reserves the same words for article slugs.
 */
const NEWS_ROUTES = new Set([
  'author',
  'category',
  'commodities',
  'education',
  'feed.xml',
  'ipo',
  'latest',
  'markets',
  'news-sitemap.xml',
  'search',
  'sitemap.xml',
  'stocks',
  'tag',
]);

/**
 * Whether `pathname` is a story page, `/news/<slug>` (spec §5.12). The news
 * layout renders one header for every news route and can't see the URL, so
 * SiteHeader asks this to fold the section rail away and draw the reading
 * wire on stories only (`condenseRail`, spec §4.1).
 */
export function isStoryPath(pathname: string): boolean {
  const m = /^\/news\/([^/]+)\/?$/.exec(pathname);
  if (!m) return false;
  let seg = m[1];
  try {
    seg = decodeURIComponent(seg);
  } catch {
    // a malformed escape: compare it as it is
  }
  return !NEWS_ROUTES.has(seg);
}

/**
 * The section rail's `aria-current` rule (spec §4.2): an exact match for
 * the front page (`/news`), a whole-segment prefix match for everything
 * else, so `/news/latest/page/2` keeps "Latest" current and a category's
 * later pages keep their section current.
 */
export function isCurrentSection(pathname: string, href: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (href === '/news') return p === '/news';
  return p === href || p.startsWith(`${href}/`);
}

/** The news section rail's fixed first two items (spec §2.3, §9.6). */
export const RAIL_START: readonly NavLink[] = [
  { href: '/news', label: 'Front page' },
  { href: '/news/latest', label: 'Latest' },
];

/** A top-level news category as the rail needs it (the CMS order is kept). */
export type RailCategory = { slug: string; name: string };

/**
 * The news section rail's items (spec §2.3, §4.2): Front page, Latest, then
 * every active top-level category in CMS order. Categories with a landing
 * page resolve to /news/<slug> (newsPath.category). The drawer's "Sections"
 * list uses the same items.
 */
export function railItems(categories: readonly RailCategory[] = []): NavLink[] {
  return [
    ...RAIL_START,
    ...categories.map((c) => ({ href: newsPath.category(c.slug), label: c.name })),
  ];
}

/** The drawer's "More" rows and legal mini-row (spec §4.3). */
export const DRAWER_MORE: readonly NavLink[] = [
  { href: '/features', label: 'Features' },
  { href: '/download', label: 'Download' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];
export const DRAWER_LEGAL: readonly NavLink[] = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/disclaimer', label: 'Disclaimer' },
];

/** The footer's four column keys, in their fixed order (W7 addendum §6.1, §6.3). */
export type FooterColumnKey = 'news' | 'app' | 'company' | 'legal';

/**
 * The footer's link columns (spec §4.5), in order. The Legal column also
 * ends with the Cookie settings button when optional services are on; the
 * footer adds that itself, because it is a button, not a link. Each column
 * has a `key` (W7 addendum §6.4): the footer finds the Legal column by
 * `key === 'legal'`, so an admin can rename its title.
 */
export const FOOTER_LINKS: readonly { key: FooterColumnKey; title: string; links: readonly NavLink[] }[] = [
  {
    key: 'news',
    title: 'News',
    links: [
      { href: '/news', label: 'Front page' },
      { href: '/news/latest', label: 'Latest' },
      { href: '/news/markets', label: 'Markets' },
      { href: '/news/ipo', label: 'IPOs' },
      { href: '/news/commodities', label: 'Commodities' },
      { href: '/news/education', label: 'Learn' },
      { href: '/news/feed.xml', label: 'RSS feed' },
    ],
  },
  {
    key: 'app',
    title: 'The app',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/download', label: 'Download' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    key: 'company',
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    key: 'legal',
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms & Conditions' },
      { href: '/privacy', label: 'Privacy notice' },
      // The Hindi notice is reached from the notice itself (the "हिंदी में
      // पढ़ें" button in its head), not from the footer (owner, 6 Nov 2026).
      { href: '/privacy/requests', label: 'Privacy requests & grievances' },
      { href: '/disclaimer', label: 'Risk Disclaimer' },
    ],
  },
];
