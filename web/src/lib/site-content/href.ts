import { SITE } from '@/lib/site';

/**
 * The site-content href rule (W7 addendum §3.1, §9.1): which links inside
 * admin-edited content may render as links. The API applies the same rule on
 * save (backend/src/site-content/rich/href.ts); the web applies it again at
 * render, and a link that fails becomes plain text.
 *
 * Accepted:
 * - a SITE PATH: `^/(?![/\\])[^\s\\]*$`, and `new URL(href, SITE_ORIGIN)`
 *   keeps the site's origin. That refuses the disguised off-site links the
 *   newsroom's safeHref lets through: `//evil.example`, `/\evil.example`
 *   and `/<TAB>/evil.example` all resolve to https://evil.example/ (a
 *   backslash is a slash in http(s) URLs, and the URL parser deletes tabs
 *   and newlines). `/%09/evil.example` stays on the site and is fine;
 * - `mailto:` with one address: `^mailto:[^\s@]+@[^\s@]+$`;
 * - an absolute `https:` or `http:` URL to another host (a link to the
 *   site's own host, with or without "www.", must be a site path). It
 *   renders normalised (`url.href`).
 * Everything else (javascript:, data:, protocol-relative, relative paths,
 * bare #fragments) is refused. No control characters anywhere (C0, DEL,
 * C1), as on the API.
 *
 * One render-side addition, stricter than the API (proposed to W7-B on
 * 5 Nov): a site path whose resolved path starts with "//" (a dot-segment
 * trick such as "/a/..//evil.example", which stays on the site but reads
 * as a protocol-relative URL to any code that reuses the pathname) renders
 * as plain text. Length is the API's check (it refuses hrefs over 500 on
 * save); the render side has no cap.
 *
 * Plain functions, no React: server, client and portal code can import it.
 */

/** The site's own origin, e.g. "https://stockvirtue.com" (SITE.url). */
export const SITE_ORIGIN: string = (() => {
  try {
    return new URL(SITE.url).origin;
  } catch {
    return 'https://stockvirtue.com';
  }
})();

const SITE_HOST = new URL(SITE_ORIGIN).hostname.toLowerCase();

const SITE_PATH = /^\/(?![/\\])[^\s\\]*$/;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;

export type ContentHrefKind = 'path' | 'mailto' | 'external';

/** An accepted link: what it is, and the exact href to render. */
export type ContentHref = { kind: ContentHrefKind; href: string };

function isOwnHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === SITE_HOST || h === `www.${SITE_HOST}` || `www.${h}` === SITE_HOST;
}

/**
 * The rule. Returns null for anything that may not render as a link.
 * External URLs come back normalised (`url.href`, what the browser would
 * follow); site paths and mailto: links exactly as given.
 */
export function checkContentHref(raw: unknown): ContentHref | null {
  if (typeof raw !== 'string' || raw === '' || CONTROL.test(raw)) return null;

  if (raw.startsWith('/')) {
    if (!SITE_PATH.test(raw)) return null;
    let url: URL;
    try {
      url = new URL(raw, SITE_ORIGIN);
    } catch {
      return null;
    }
    if (url.origin !== SITE_ORIGIN || url.pathname.startsWith('//')) return null;
    return { kind: 'path', href: raw };
  }

  if (raw.startsWith('mailto:')) {
    return MAILTO.test(raw) ? { kind: 'mailto', href: raw } : null;
  }

  // As the API: the URL parser encodes a space inside an external address,
  // and the normalised `url.href` is what renders, so it can't disguise one.
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname || isOwnHost(url.hostname)) return null;
  return { kind: 'external', href: url.href };
}

/** The href to render, or null (render the text without a link). */
export function contentHref(raw: unknown): string | null {
  return checkContentHref(raw)?.href ?? null;
}

/** Site paths that are files, not pages (the RSS feed): a plain <a>, never next/link. */
export function isFilePath(path: string): boolean {
  return /\.(xml|txt|json)(?:[?#]|$)/.test(path);
}

/** Stock pages: links to them never prefetch (plan §0.13). */
export function isStockPath(path: string): boolean {
  return /^\/news\/stocks(?:[/?#]|$)/.test(path);
}

/* ── Menus (§6.2): a `path` target must also be a known route ────────────── */

const FIXED_ROUTES = new Set([
  '/',
  '/features',
  '/about',
  '/faq',
  '/download',
  '/contact',
  '/privacy',
  '/privacy/hi',
  '/privacy/requests',
  '/terms',
  '/disclaimer',
  '/news',
  '/news/markets',
  '/news/ipo',
  '/news/commodities',
  '/news/education',
  '/news/latest',
  '/news/search',
  '/news/feed.xml',
]);
const NEWS_LISTING = /^\/news\/(?:category|tag|author)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NEWS_STOCK = /^\/news\/stocks\/[A-Za-z0-9&%._-]+$/;
const CUSTOM_PAGE = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const NEVER_IN_MENUS = /^\/(?:admin|api|preview)(?:\/|$)/;

/**
 * Whether a menu's `path` target is a route the site has (§6.2): the fixed
 * pages, the news hubs and listings, a stock page, or one of `liveSlugs`
 * (LIVE custom pages); an optional #fragment; never /admin, /api, /preview,
 * and no query string. Advisory on the web (the portal's link picker); the
 * API decides on save.
 */
export function isKnownSitePath(path: string, liveSlugs?: ReadonlySet<string>): boolean {
  if (checkContentHref(path)?.kind !== 'path') return false;
  const hash = path.indexOf('#');
  const bare = hash === -1 ? path : path.slice(0, hash);
  if (bare.includes('?') || NEVER_IN_MENUS.test(bare)) return false;
  if (FIXED_ROUTES.has(bare) || NEWS_LISTING.test(bare) || NEWS_STOCK.test(bare)) return true;
  const custom = CUSTOM_PAGE.exec(bare);
  return !!custom && !!liveSlugs?.has(custom[1]);
}
