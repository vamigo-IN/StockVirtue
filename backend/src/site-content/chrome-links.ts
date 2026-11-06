import type { Db } from './db';
import type { MenuTarget, StoredMenuLink } from './schemas/fields';

/** A stored chrome (W7 addendum §6.1), as validated. */
export interface StoredChrome {
  primary: StoredMenuLink[];
  drawerMore: StoredMenuLink[];
  drawerLegal: StoredMenuLink[];
  footer: {
    columns: { key: string; title: string; links: StoredMenuLink[] }[];
    legalLine: string;
    newsLine: string;
    notBrokerLine: string;
    companyTail: string;
  };
  notFound: { title: string; line: string };
}

/** A menu link as served: the stored link plus where it goes. */
export type ServedMenuLink = StoredMenuLink & {
  /** The resolved address; null only for a custom page that no longer exists. */
  href: string | null;
  /** An external link (opens in a new tab). */
  external?: true;
};

/** Every link of a chrome, with where it sits (for "linked from" messages). */
export function chromeLinks(c: StoredChrome): { where: string; link: StoredMenuLink }[] {
  const out: { where: string; link: StoredMenuLink }[] = [];
  for (const l of c.primary ?? []) out.push({ where: 'Header', link: l });
  for (const l of c.drawerMore ?? []) out.push({ where: 'Menu → More', link: l });
  for (const l of c.drawerLegal ?? []) out.push({ where: 'Menu → legal row', link: l });
  for (const col of c.footer?.columns ?? []) {
    for (const l of col.links ?? []) out.push({ where: `Footer → ${col.title}`, link: l });
  }
  return out;
}

/** The custom pages these targets name, by id and by slug. */
export async function customPagesFor(db: Db, targets: readonly MenuTarget[]) {
  const ids = [...new Set(targets.filter((t) => t.type === 'page').map((t) => (t as { pageId: string }).pageId))];
  const slugs = [
    ...new Set(
      targets
        .filter((t) => t.type === 'path')
        .map((t) => /^\/([^/#]+)(#.*)?$/.exec((t as { path: string }).path)?.[1])
        .filter((s): s is string => !!s),
    ),
  ];
  if (ids.length === 0 && slugs.length === 0) return [];
  return db.siteContent.findMany({
    where: {
      kind: 'CUSTOM',
      OR: [...(ids.length ? [{ id: { in: ids } }] : []), ...(slugs.length ? [{ slug: { in: slugs } }] : [])],
    },
    select: { id: true, slug: true, status: true, title: true },
  });
}

/** Where a target goes, given the custom pages by id. */
export function hrefOf(t: MenuTarget, pagesById: Map<string, { slug: string | null }>): string | null {
  switch (t.type) {
    case 'path':
      return t.path;
    case 'page': {
      const slug = pagesById.get(t.pageId)?.slug;
      return slug ? `/${slug}` : null;
    }
    case 'category':
      return `/news/category/${t.slug}`;
    case 'url':
      return t.url;
  }
}

export function serveLink(l: StoredMenuLink, pagesById: Map<string, { slug: string | null }>): ServedMenuLink {
  const out: ServedMenuLink = { ...l, href: hrefOf(l.target, pagesById) };
  if (l.target.type === 'url') out.external = true;
  return out;
}

/** The chrome as GET /api/v1/site/chrome serves it: every link with its href. */
export async function serveChrome(db: Db, c: StoredChrome) {
  const all = chromeLinks(c).map((x) => x.link.target);
  const pages = await customPagesFor(db, all);
  const byId = new Map(pages.map((p) => [p.id, { slug: p.slug }]));
  const map = (ls: StoredMenuLink[]) => (ls ?? []).map((l) => serveLink(l, byId));
  return {
    menus: {
      primary: map(c.primary),
      drawerMore: map(c.drawerMore),
      drawerLegal: map(c.drawerLegal),
    },
    footer: {
      columns: (c.footer?.columns ?? []).map((col) => ({ key: col.key, title: col.title, links: map(col.links) })),
      legalLine: c.footer?.legalLine ?? '',
      newsLine: c.footer?.newsLine ?? '',
      notBrokerLine: c.footer?.notBrokerLine ?? '',
      companyTail: c.footer?.companyTail ?? '',
    },
    notFound: c.notFound ?? null,
  };
}
