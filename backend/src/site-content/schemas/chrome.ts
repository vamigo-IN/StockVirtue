import { Logger } from '@nestjs/common';
import { readJsonData } from '../data-files';
import {
  group,
  id,
  line,
  list,
  menuLink,
  type GroupField,
  type MenuTarget,
  type StoredMenuLink,
  type ValidationContext,
} from './fields';
import { ID_PATTERN, isReservedSlug } from './reserved-ids';

/**
 * Menus, footer texts and the root 404 (W7 addendum §6): one `chrome` item
 * whose validator keeps the design intact (§6.3).
 */

export const FOOTER_KEYS = ['news', 'app', 'company', 'legal'] as const;

/** Σ label widths + n × 20 px + (n − 1) × 4 px at 768 px (Archivo 560 / 15 px). */
export const PRIMARY_WIDTH_BUDGET_PX = 394;
const ITEM_PADDING_PX = 20;
const ITEM_GAP_PX = 4;

/** Pages a menu may link by path (§6.2), besides LIVE custom pages. */
export const MENU_FIXED_PATHS = [
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
  '/news/latest',
  '/news/search',
  '/news/feed.xml',
  // the news hubs
  '/news/markets',
  '/news/education',
  '/news/commodities',
  '/news/ipo',
] as const;
const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const MENU_PATH_PATTERNS: readonly RegExp[] = [
  new RegExp(`^/news/category/${SLUG}$`),
  new RegExp(`^/news/tag/${SLUG}$`),
  new RegExp(`^/news/author/${SLUG}$`),
  /^\/news\/stocks\/[A-Z0-9][A-Z0-9&_.-]{0,29}$/,
];
const NEVER = /^\/(admin|api|preview)(\/|$)/;

/** A path target without its #fragment. */
export const pathOnly = (p: string) => p.replace(/#.*$/, '');

/** What a menu path is: a known route, maybe a custom page ('/<slug>'), or neither. */
export function classifyMenuPath(path: string): 'known' | 'custom' | 'never' | 'unknown' {
  const p = pathOnly(path);
  if (p.includes('?')) return 'unknown';
  if (NEVER.test(p)) return 'never';
  if ((MENU_FIXED_PATHS as readonly string[]).includes(p)) return 'known';
  if (MENU_PATH_PATTERNS.some((re) => re.test(p))) return 'known';
  const one = /^\/([^/]+)$/.exec(p);
  if (one && ID_PATTERN.test(one[1]) && !isReservedSlug(one[1])) return 'custom';
  return 'unknown';
}

/** The identity of a target, for "no duplicate targets". */
export function targetKey(t: MenuTarget): string {
  switch (t.type) {
    case 'path':
      return `path:${pathOnly(t.path)}`;
    case 'page':
      return `page:${t.pageId}`;
    case 'category':
      return `path:/news/category/${t.slug}`;
    case 'url':
      return `url:${t.url}`;
  }
}

/* ── The width table (nav-widths.json, generated once from the shipped font) ── */

interface WidthTable {
  fallbackPx: number;
  widths: Record<string, number>;
}
const logger = new Logger('ChromeSchema');
let table: WidthTable | null | undefined;
function widthTable(): WidthTable | null {
  if (table === undefined) {
    table = readJsonData<WidthTable>('nav-widths.json');
    if (!table) logger.error('nav-widths.json is missing: the header width budget is not checked.');
  }
  return table;
}

/** A label's advance width in px (Archivo 560 / 15 px); unknown glyphs count as the widest. */
export function labelWidth(label: string): number | null {
  const t = widthTable();
  if (!t) return null;
  let w = 0;
  for (const ch of label) w += t.widths[ch] ?? t.fallbackPx;
  return w;
}

/** The header's width for these labels, or null without the table. */
export function primaryWidth(labels: readonly string[]): number | null {
  let sum = 0;
  for (const l of labels) {
    const w = labelWidth(l);
    if (w === null) return null;
    sum += w;
  }
  const n = labels.length;
  return sum + n * ITEM_PADDING_PX + Math.max(0, n - 1) * ITEM_GAP_PX;
}

/* ── Rules across fields ──────────────────────────────────────────────────── */

function primaryRules(value: unknown, path: string, ctx: ValidationContext) {
  const links = (Array.isArray(value) ? value : []) as (StoredMenuLink | null)[];
  const real = links.filter((l): l is StoredMenuLink => !!l);
  const news = real.filter((l) => l.target.type === 'path' && pathOnly(l.target.path) === '/news').length;
  if (news !== 1) {
    ctx.errors.push({
      path,
      message: `The header needs exactly one link to /news (it has ${news}).`,
    });
  }
  const seen = new Set<string>();
  real.forEach((l, i) => {
    const k = targetKey(l.target);
    if (seen.has(k)) ctx.errors.push({ path: `${path}[${i}].target`, message: 'Two header links go to the same place.' });
    seen.add(k);
  });
  if (ctx.lenient) return;
  const width = primaryWidth(real.map((l) => l.label));
  if (width !== null && width > PRIMARY_WIDTH_BUDGET_PX) {
    ctx.errors.push({
      path,
      message: `These header labels don't fit the 768 px header: ${Math.ceil(width)} px of ${PRIMARY_WIDTH_BUDGET_PX}. Use shorter labels or fewer links.`,
    });
  }
}

function columnsRules(value: unknown, path: string, ctx: ValidationContext) {
  const cols = (Array.isArray(value) ? value : []) as { key?: string; links?: (StoredMenuLink | null)[] }[];
  const legal = cols.find((c) => c?.key === 'legal');
  if (!legal) return;
  const i = cols.indexOf(legal);
  const paths = (legal.links ?? [])
    .filter((l): l is StoredMenuLink => !!l)
    .map((l) => (l.target.type === 'path' ? pathOnly(l.target.path) : null));
  for (const need of ['/privacy', '/terms']) {
    if (!paths.includes(need)) {
      ctx.errors.push({
        path: `${path}[${i}].links`,
        message: `The Legal column must link to ${need} (the notice is reachable from every page).`,
      });
    }
  }
}

/** Every path target must be a page the site has (§6.2). */
function knownRoutes(_value: unknown, _path: string, ctx: ValidationContext) {
  for (const { path, link } of ctx.menuLinks) {
    if (link.target.type !== 'path') continue;
    const kind = classifyMenuPath(link.target.path);
    if (kind === 'never') {
      ctx.errors.push({ path: `${path}.target`, message: 'Menus can’t link to the admin, the API or previews.' });
    } else if (kind === 'unknown') {
      ctx.errors.push({ path: `${path}.target`, message: `"${link.target.path}" isn’t a page on the site.` });
    }
    // 'custom' paths are checked against the LIVE custom pages by the service.
  }
}

export const CHROME: GroupField = group(
  {
    primary: list(3, 5, menuLink('primary', [2, 14], { allowUrl: false, alsoCurrentOn: true }), {
      label: 'Header',
      note: `Exactly one link to /news; no duplicate targets; no url targets; width budget ${PRIMARY_WIDTH_BUDGET_PX} px at 768 px.`,
      check: primaryRules,
    }),
    drawerMore: list(0, 6, menuLink('drawerMore', [2, 24]), { label: 'Menu: More' }),
    drawerLegal: list(1, 4, menuLink('drawerLegal', [2, 16]), { label: 'Menu: legal row' }),
    footer: group({
      columns: list(
        4,
        4,
        group({
          key: id('footer-columns', { fixed: FOOTER_KEYS, label: 'Column' }),
          title: line(3, 20, { label: 'Title' }),
          links: list(1, 8, menuLink('footer', [2, 32]), {
            label: 'Links',
            note: 'The legal column must link /privacy and /terms.',
          }),
        }),
        { label: 'Footer columns', note: 'Keys news, app, company, legal, in this order.', check: columnsRules },
      ),
      legalLine: line(60, 200, { legalLocked: true, label: 'Legal line (home and site pages)' }),
      newsLine: line(60, 200, { legalLocked: true, label: 'Legal line (news pages)' }),
      notBrokerLine: line(30, 120, { legalLocked: true, label: 'Not-a-broker line' }),
      companyTail: line(0, 40, { optional: true, label: 'After the company name' }),
    }),
    notFound: group(
      {
        title: line(10, 50, { label: 'Heading' }),
        line: line(20, 120, { label: 'Line' }),
      },
      { label: 'Page not found' },
    ),
  },
  { check: knownRoutes },
);
