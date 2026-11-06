import { textLength } from '@/content/site/limits';
import { isReservedId, isValidId } from '@/content/site/reserved-ids';
import type { ChromeContent, MenuLink, MenuTarget } from '@/content/site/types';
import type { PickerCategory, PickerPage } from './LinkPicker';
import { pathProblem, urlProblem } from './LinkPicker';
import { navPrimaryWidth } from './nav-widths';

/**
 * The menus' design rules (W7 addendum §6.3), checked in the editor as the
 * person types. The API checks them again on save and publish and is the
 * judge; these only say early what it would say.
 */

export const PRIMARY_BUDGET_PX = 394;
export const FORBIDDEN_LABELS = ['get it on google play', 'english'];
export const LIST_RULES = {
  primary: { count: [3, 5], label: [2, 14], name: 'The header menu' },
  drawerMore: { count: [0, 6], label: [2, 24], name: 'The phone menu’s “More” list' },
  drawerLegal: { count: [1, 4], label: [2, 16], name: 'The phone menu’s legal row' },
  column: { count: [1, 8], label: [2, 32], name: 'A footer column' },
} as const;

export interface ChromeProblem {
  path: string;
  message: string;
  /** Allowed in a draft; refused at publish. */
  publishOnly?: boolean;
}

const pathOnly = (p: string) => p.split('#')[0] || '/';

export function targetKey(t: MenuTarget | undefined): string {
  if (!t) return '';
  switch (t.type) {
    case 'path':
      return `path:${pathOnly(t.path)}`;
    case 'page':
      return `page:${t.pageId}`;
    case 'category':
      return `category:${t.slug}`;
    case 'url':
      return `url:${t.url}`;
  }
}

export const isNewsLink = (l: MenuLink | null | undefined) => l?.target?.type === 'path' && pathOnly(l.target.path) === '/news';

function checkLink(l: MenuLink, path: string, labelLen: readonly [number, number], o: Ctx, out: ChromeProblem[]) {
  const n = textLength(l.label ?? '');
  if (n < labelLen[0] || n > labelLen[1]) {
    out.push({ path: `${path}.label`, message: `Labels here are ${labelLen[0]} to ${labelLen[1]} characters (this one is ${n}).` });
  }
  if (FORBIDDEN_LABELS.includes((l.label ?? '').trim().toLowerCase())) {
    out.push({ path: `${path}.label`, message: `“${l.label}” is reserved for the site’s own buttons. Use other words.` });
  }
  if (!isValidId(l.id)) out.push({ path: `${path}.id`, message: 'This link’s name is invalid. Remove the link and add it again.' });
  const t = l.target;
  if (!t) {
    out.push({ path: `${path}.target`, message: 'Choose where this link goes.' });
    return;
  }
  if (t.type === 'path') {
    const p = pathProblem(t.path, o.liveSlugs);
    if (p) out.push({ path: `${path}.target`, message: p });
  } else if (t.type === 'url') {
    const p = urlProblem(t.url);
    if (p) out.push({ path: `${path}.target`, message: p });
  } else if (t.type === 'page') {
    const page = o.pages.find((x) => x.id === t.pageId);
    if (!page) out.push({ path: `${path}.target`, message: 'This link goes to a page that no longer exists. Choose another.' });
    else if (!page.live) {
      out.push({ path: `${path}.target`, message: `Publish “${page.title}” first, or remove its link.`, publishOnly: true });
    }
  } else if (t.type === 'category') {
    const c = o.categories.find((x) => x.slug === t.slug);
    if (o.categories.length && !c) out.push({ path: `${path}.target`, message: 'That news category doesn’t exist.' });
    else if (c && !c.isActive) out.push({ path: `${path}.target`, message: 'Links to a hidden section.', publishOnly: true });
  }
}

interface Ctx {
  pages: PickerPage[];
  categories: PickerCategory[];
  liveSlugs: ReadonlySet<string>;
}

function checkList(
  list: MenuLink[] | undefined,
  base: string,
  rule: { count: readonly [number, number]; label: readonly [number, number]; name: string },
  o: Ctx,
  out: ChromeProblem[],
) {
  const links = list ?? [];
  if (links.length < rule.count[0] || links.length > rule.count[1]) {
    out.push({
      path: base,
      message:
        rule.count[0] === rule.count[1]
          ? `${rule.name} has exactly ${rule.count[0]} links.`
          : `${rule.name} has ${rule.count[0]} to ${rule.count[1]} links (now ${links.length}).`,
    });
  }
  const ids = new Set<string>();
  links.forEach((l, i) => {
    if (ids.has(l.id)) out.push({ path: `${base}[${i}].id`, message: 'Two links in this list share a name. Remove one and add it again.' });
    ids.add(l.id);
    checkLink(l, `${base}[${i}]`, rule.label, o, out);
  });
}

export function primaryWidthPx(c: ChromeContent): number {
  return Math.round(navPrimaryWidth((c.primary ?? []).map((l) => l.label ?? '')));
}

export function chromeProblems(c: ChromeContent, o: Ctx): ChromeProblem[] {
  const out: ChromeProblem[] = [];
  checkList(c.primary, 'primary', LIST_RULES.primary, o, out);
  const primary = c.primary ?? [];
  const news = primary.filter(isNewsLink).length;
  if (news !== 1) out.push({ path: 'primary', message: 'The header menu has exactly one link to /news.' });
  const seen = new Set<string>();
  primary.forEach((l, i) => {
    const k = targetKey(l.target);
    if (k && seen.has(k)) out.push({ path: `primary[${i}].target`, message: 'Two header links go to the same place.' });
    seen.add(k);
    if (l.target?.type === 'url') out.push({ path: `primary[${i}].target`, message: 'The header links only to pages of this site.' });
    if ((l.alsoCurrentOn?.length ?? 0) > 3) out.push({ path: `primary[${i}].alsoCurrentOn`, message: 'At most three extra paths.' });
    for (const p of l.alsoCurrentOn ?? []) {
      if (!/^\/(?![/\\])[^\s?#]*$/.test(p)) out.push({ path: `primary[${i}].alsoCurrentOn`, message: `“${p}” isn’t a path of this site.` });
    }
  });
  const width = primaryWidthPx(c);
  if (width > PRIMARY_BUDGET_PX) {
    out.push({ path: 'primary', message: `The header is ${width} px wide at 768 px; it has ${PRIMARY_BUDGET_PX}. Shorten a label or remove a link.` });
  }
  checkList(c.drawerMore, 'drawerMore', LIST_RULES.drawerMore, o, out);
  checkList(c.drawerLegal, 'drawerLegal', LIST_RULES.drawerLegal, o, out);
  const cols = c.footer?.columns ?? [];
  cols.forEach((col, ci) => {
    const n = textLength(col.title ?? '');
    if (n < 3 || n > 20) out.push({ path: `footer.columns[${ci}].title`, message: `Column titles are 3 to 20 characters (this one is ${n}).` });
    checkList(col.links, `footer.columns[${ci}].links`, LIST_RULES.column, o, out);
    if (col.key === 'legal') {
      const paths = new Set((col.links ?? []).map((l) => (l.target?.type === 'path' ? pathOnly(l.target.path) : '')));
      for (const p of ['/privacy', '/terms']) {
        if (!paths.has(p)) out.push({ path: `footer.columns[${ci}].links`, message: `The Legal column must link ${p}.` });
      }
    }
  });
  const line = (p: string, v: string | undefined, min: number, max: number, what: string) => {
    const n = textLength(v ?? '');
    if (n < min || n > max) out.push({ path: p, message: `${what} is ${min} to ${max} characters (now ${n}).` });
  };
  line('footer.legalLine', c.footer?.legalLine, 60, 200, 'The site pages’ line');
  line('footer.newsLine', c.footer?.newsLine, 60, 200, 'The news pages’ line');
  line('footer.notBrokerLine', c.footer?.notBrokerLine, 30, 120, 'The not-a-broker line');
  line('footer.companyTail', c.footer?.companyTail, 0, 40, 'The text after the company name');
  line('notFound.title', c.notFound?.title, 10, 50, 'The 404 heading');
  line('notFound.line', c.notFound?.line, 20, 120, 'The 404 line');
  return out;
}

/** A new link name, unique in its list. */
export function newLinkId(list: MenuLink[], label: string): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'link';
  const taken = new Set(list.map((l) => l.id));
  const free = (id: string) => !taken.has(id) && !isReservedId(id);
  if (free(base)) return base;
  let n = 2;
  while (!free(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
