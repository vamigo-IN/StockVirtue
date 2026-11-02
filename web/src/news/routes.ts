/**
 * Addresses on the news site. Category pages for these slugs are curated
 * landing pages at /news/<slug>; every other category lives at
 * /news/category/<slug>. (The API reserves these words for article slugs.)
 */
export const LANDING_PAGES = {
  markets: {
    title: 'Markets',
    description:
      'Indian and global markets: indices, sectors, stocks and what moved them.',
  },
  ipo: {
    title: 'IPOs',
    description:
      'Upcoming and recent public issues: dates, price bands, subscription and listings.',
  },
  commodities: {
    title: 'Commodities',
    description: 'Gold, silver, crude oil and other commodity markets.',
  },
  education: {
    title: 'Learn',
    description:
      'Plain-English guides to how markets, trading and investing work.',
  },
} as const;
export type LandingSlug = keyof typeof LANDING_PAGES;

export function isLanding(slug: string): slug is LandingSlug {
  return slug in LANDING_PAGES;
}

export const newsPath = {
  home: () => '/news',
  latest: (page = 1) =>
    page > 1 ? `/news/latest/page/${page}` : '/news/latest',
  article: (slug: string) => `/news/${slug}`,
  category: (slug: string, page = 1) => {
    if (page === 1 && isLanding(slug)) return `/news/${slug}`;
    return page > 1
      ? `/news/category/${slug}/page/${page}`
      : `/news/category/${slug}`;
  },
  tag: (slug: string, page = 1) =>
    page > 1 ? `/news/tag/${slug}/page/${page}` : `/news/tag/${slug}`,
  author: (slug: string, page = 1) =>
    page > 1 ? `/news/author/${slug}/page/${page}` : `/news/author/${slug}`,
  stock: (symbol: string, page = 1) =>
    page > 1 ? `/news/stocks/${symbol}/page/${page}` : `/news/stocks/${symbol}`,
  search: (q?: string, page = 1) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (page > 1) p.set('page', String(page));
    const s = p.toString();
    return s ? `/news/search?${s}` : '/news/search';
  },
};

/**
 * `/x/page/2` style pagination for listing routes: [] → page 1,
 * ['page', '2'] → 2. Anything else (or page 1 spelled out) is not a page.
 */
export function pageFromSegments(
  segments: string[] | undefined,
): number | null {
  if (!segments || segments.length === 0) return 1;
  if (segments.length !== 2 || segments[0] !== 'page') return null;
  if (!/^[1-9]\d{0,2}$/.test(segments[1])) return null;
  const n = Number(segments[1]);
  return n >= 2 ? n : null;
}
