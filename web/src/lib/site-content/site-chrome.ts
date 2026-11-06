import { CHROME_DEFAULT } from '@/content/site/chrome';
import { isValidSlug } from '@/content/site/reserved-ids';
import type { ChromeContent, FooterColumnKey, MenuLink } from '@/content/site/types';
import { toDate } from './format-date';
import { checkContentHref, isKnownSitePath } from './href';

/**
 * The chrome as the pages render it (W7 addendum §6, §7.1): the menus with
 * every link already resolved to `{ href, label, lang?, external?,
 * alsoCurrentOn? }` (NavLink's shape in src/lib/nav.ts, plus a stable id),
 * the footer's columns and lines, the root 404's texts and the footer's
 * dated notice line.
 *
 * `getChrome()` (src/lib/site-content/api.ts) returns it; W6's chrome
 * components take it in M7.5 (SiteHeader `nav` / `drawer`, SiteFooter and
 * FooterBody `columns` / `texts` / `noticeLine`, StaticHeader / StaticFooter).
 * Pure data and functions, no server-only import: the preview route, the
 * portal and client components can import the types and the resolver.
 */

export type ChromeLinkView = {
  /** Stable id (React keys); unique per list, not across lists. */
  id: string;
  href: string;
  label: string;
  /** The label's language when it isn't English (गोपनीयता सूचना). */
  lang?: 'hi' | 'en';
  /** An external https link: rendered target="_blank" rel="noopener noreferrer" with an sr-only "(opens in a new tab)". */
  external?: boolean;
  /** Primary items only: extra paths that make the item current (§6.5). */
  alsoCurrentOn?: string[];
};

export type ChromeFooterColumnView = { key: FooterColumnKey; title: string; links: ChromeLinkView[] };

export type ChromeFooterView = {
  /** Exactly four, keyed news, app, company, legal, in this order. */
  columns: ChromeFooterColumnView[];
  /** Home and site pages; data-verbatim. */
  legalLine: string;
  /** News pages; data-verbatim. */
  newsLine: string;
  /** Every page; data-verbatim. */
  notBrokerLine: string;
  /** "© {year} {SITE.company} · {companyTail}"; '' drops the tail. */
  companyTail: string;
};

/** The footer's "We updated our privacy notice on {date}." line (§5.6): `date` is the change's materialAt (ISO). */
export type ChromeNoticeLine = { date: string; until: string };

export type SiteChrome = {
  /** The header nav, the drawer's primary rows and the 404 header. */
  primary: ChromeLinkView[];
  /** The drawer's "More" rows. */
  drawerMore: ChromeLinkView[];
  /** The drawer's legal mini-row. */
  drawerLegal: ChromeLinkView[];
  footer: ChromeFooterView;
  /** The root 404's heading and line. */
  notFound: { title: string; line: string };
  /** Shown for 30 days after an announced material change; null otherwise. */
  noticeLine: ChromeNoticeLine | null;
  /** Which parts are the built-in defaults (no published chrome, or a part that failed the checks). */
  builtIn: { menus: boolean; footer: boolean; notFound: boolean };
};

const COLUMN_KEYS: readonly FooterColumnKey[] = ['news', 'app', 'company', 'legal'];
const NEVER_IN_MENUS = /^\/(?:admin|api|preview)(?:[/?#]|$)/;
const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Whether a menu link may render with this site path (defence in depth: the
 * API checked it on save). A known route (§6.2), or a one-segment custom
 * page path (the API serves page targets as "/<slug>" and refuses links to
 * pages that aren't LIVE); never /admin, /api, /preview, no query.
 */
function isMenuPath(href: string): boolean {
  if (checkContentHref(href)?.kind !== 'path') return false;
  const bare = href.split('#')[0];
  if (bare.includes('?') || NEVER_IN_MENUS.test(bare)) return false;
  if (isKnownSitePath(href)) return true;
  const one = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(bare);
  return !!one && isValidSlug(one[1]);
}

/** Where a stored target goes when the API hasn't resolved it (the built-in default, a draft). */
function targetHref(target: unknown): { href: string; external?: true } | null {
  if (!isRec(target)) return null;
  switch (target.type) {
    case 'path':
      return typeof target.path === 'string' ? { href: target.path } : null;
    case 'category':
      return typeof target.slug === 'string' && CATEGORY_SLUG.test(target.slug)
        ? { href: `/news/category/${target.slug}` }
        : null;
    case 'url':
      return typeof target.url === 'string' ? { href: target.url, external: true } : null;
    default:
      // 'page': only the API knows the slug.
      return null;
  }
}

/**
 * One menu link as rendered, or null when it can't render (no label, a
 * custom page that no longer exists, an address the href rule refuses).
 * Takes a served link (with `href`, and `external` for url targets) or a
 * stored one (target only).
 */
export function resolveMenuLink(raw: unknown, index = 0): ChromeLinkView | null {
  if (!isRec(raw) || !nonEmpty(raw.label)) return null;
  const servedHref = typeof raw.href === 'string' ? raw.href : raw.href === null ? null : undefined;
  const fromTarget = targetHref(raw.target);
  const external =
    raw.external === true || (isRec(raw.target) && raw.target.type === 'url') || fromTarget?.external === true;
  const href = servedHref === undefined ? fromTarget?.href : servedHref;
  if (!href) return null;

  let finalHref: string;
  if (external) {
    const checked = checkContentHref(href);
    if (checked?.kind !== 'external' || !checked.href.startsWith('https://')) return null;
    finalHref = checked.href;
  } else {
    if (!isMenuPath(href)) return null;
    finalHref = href;
  }

  const link: ChromeLinkView = {
    id: nonEmpty(raw.id) ? raw.id : `link-${index + 1}`,
    href: finalHref,
    label: raw.label,
  };
  if (raw.lang === 'hi' || raw.lang === 'en') link.lang = raw.lang;
  if (external) link.external = true;
  if (Array.isArray(raw.alsoCurrentOn)) {
    const also = raw.alsoCurrentOn.filter((p): p is string => typeof p === 'string' && isMenuPath(p)).slice(0, 3);
    if (also.length) link.alsoCurrentOn = also;
  }
  return link;
}

/**
 * A list of links: every link that can render, in order. When the list
 * isn't an array, or none of its links can render, the built-in list.
 */
function resolveList(raw: unknown, fallback: ChromeLinkView[]): ChromeLinkView[] {
  if (!Array.isArray(raw)) return fallback;
  if (raw.length === 0) return [];
  const out = raw.map((l, i) => resolveMenuLink(l, i)).filter((l): l is ChromeLinkView => l !== null);
  return out.length ? out : fallback;
}

/** The built-in chrome's links, resolved once. */
function resolveDefaultList(links: readonly MenuLink[]): ChromeLinkView[] {
  return links.map((l, i) => resolveMenuLink(l, i)).filter((l): l is ChromeLinkView => l !== null);
}

/** The chrome as rendered from a ChromeContent (the built-in default, or a draft in the preview). */
export function chromeFromContent(c: ChromeContent, noticeLine: ChromeNoticeLine | null = null): SiteChrome {
  return {
    primary: resolveDefaultList(c.primary),
    drawerMore: resolveDefaultList(c.drawerMore),
    drawerLegal: resolveDefaultList(c.drawerLegal),
    footer: {
      columns: c.footer.columns.map((col) => ({
        key: col.key,
        title: col.title,
        links: resolveDefaultList(col.links),
      })),
      legalLine: c.footer.legalLine,
      newsLine: c.footer.newsLine,
      notBrokerLine: c.footer.notBrokerLine,
      companyTail: c.footer.companyTail,
    },
    notFound: { title: c.notFound.title, line: c.notFound.line },
    noticeLine,
    builtIn: { menus: true, footer: true, notFound: true },
  };
}

/** Today's chrome (no published `chrome` item). */
export const DEFAULT_SITE_CHROME: SiteChrome = chromeFromContent(CHROME_DEFAULT);

/** The footer notice line, while it is still within its 30 days (`now` in ms). */
export function resolveNoticeLine(raw: unknown, now: number = Date.now()): ChromeNoticeLine | null {
  if (!isRec(raw)) return null;
  const date = toDate(raw.date as string);
  const until = toDate(raw.until as string);
  if (!date || !until || until.getTime() <= now) return null;
  return { date: date.toISOString(), until: until.toISOString() };
}

/**
 * The chrome from `GET /api/v1/site/chrome` (`{ menus, footer, notFound,
 * noticeLine }`, each part null while it is built-in), over the built-in
 * default. Every part is checked again here; a part that fails keeps the
 * default, so the header always has exactly one /news link and the legal
 * column always links /privacy and /terms.
 */
export function resolveChrome(body: unknown, fallback: SiteChrome = DEFAULT_SITE_CHROME, now?: number): SiteChrome {
  const b = isRec(body) ? body : {};
  const out: SiteChrome = {
    ...fallback,
    builtIn: { ...fallback.builtIn },
    noticeLine: resolveNoticeLine(b.noticeLine, now),
  };

  if (isRec(b.menus)) {
    const primary = resolveList(b.menus.primary, fallback.primary);
    const newsLinks = primary.filter((l) => l.href === '/news').length;
    const primaryOk = primary.length >= 1 && newsLinks === 1;
    out.primary = primaryOk ? primary : fallback.primary;
    out.drawerMore = resolveList(b.menus.drawerMore, fallback.drawerMore);
    const legal = resolveList(b.menus.drawerLegal, fallback.drawerLegal);
    out.drawerLegal = legal.length ? legal : fallback.drawerLegal;
    out.builtIn.menus = false;
  }

  if (isRec(b.footer)) {
    const f = b.footer;
    const cols = Array.isArray(f.columns) ? f.columns : null;
    const shapeOk =
      !!cols && cols.length === COLUMN_KEYS.length && cols.every((c, i) => isRec(c) && c.key === COLUMN_KEYS[i]);
    let columns = fallback.footer.columns;
    if (shapeOk) {
      columns = cols.map((c, i) => {
        const col = c as Rec;
        const base = fallback.footer.columns[i];
        const links = resolveList(col.links, base.links);
        return { key: COLUMN_KEYS[i], title: nonEmpty(col.title) ? col.title : base.title, links: links.length ? links : base.links };
      });
      const legal = columns[3].links.map((l) => l.href);
      if (!legal.includes('/privacy') || !legal.includes('/terms')) {
        columns = [...columns.slice(0, 3), { ...columns[3], links: fallback.footer.columns[3].links }];
      }
    }
    out.footer = {
      columns,
      legalLine: nonEmpty(f.legalLine) ? f.legalLine : fallback.footer.legalLine,
      newsLine: nonEmpty(f.newsLine) ? f.newsLine : fallback.footer.newsLine,
      notBrokerLine: nonEmpty(f.notBrokerLine) ? f.notBrokerLine : fallback.footer.notBrokerLine,
      companyTail: typeof f.companyTail === 'string' ? f.companyTail : fallback.footer.companyTail,
    };
    out.builtIn.footer = false;
  }

  if (isRec(b.notFound)) {
    out.notFound = {
      title: nonEmpty(b.notFound.title) ? b.notFound.title : fallback.notFound.title,
      line: nonEmpty(b.notFound.line) ? b.notFound.line : fallback.notFound.line,
    };
    out.builtIn.notFound = false;
  }

  return out;
}
