/** "Sensex Jumps 900 Points! What's Next?" → "sensex-jumps-900-points-what-s-next" */
export function slugify(input: string, max = 80): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * First free slug: base, base-2, base-3 … `taken` answers whether one is in
 * use. Titles with no Latin letters fall back to a dated stub.
 */
export async function freeSlug(
  base: string,
  taken: (slug: string) => Promise<boolean>,
  fallback = 'story',
): Promise<string> {
  const root = base || `${fallback}-${new Date().toISOString().slice(0, 10)}`;
  for (let n = 1; n <= 200; n++) {
    const slug = n === 1 ? root : `${root.slice(0, 74)}-${n}`;
    if (!(await taken(slug))) return slug;
  }
  return `${root.slice(0, 60)}-${Date.now().toString(36)}`;
}

/**
 * Addresses under /news that belong to sections of the public site or to
 * the news API (/api/v1/news/breaking, /bookmarks …), so no article may take
 * them (an article at /news/search would be unreachable).
 */
export const RESERVED_ARTICLE_SLUGS: ReadonlySet<string> = new Set([
  'api',
  'author',
  'authors',
  'bookmarks',
  'breaking',
  'categories',
  'category',
  'commodities',
  'education',
  'featured',
  'feed',
  'home',
  'ipo',
  'latest',
  'markets',
  'me',
  'page',
  'push',
  'rss',
  'search',
  'sitemap',
  'stocks',
  'tag',
  'tags',
  'trending',
]);
