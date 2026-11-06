import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { getContentIndex } from '@/lib/site-content/api';

/**
 * /sitemap.xml: the public site's own pages. The news site lists its stories,
 * sections, tags and authors in /news/sitemap.xml.
 *
 * W7 (addendum §3.12, §7.5, §11.2): async, from the content index
 * (`GET /api/v1/site/content-index`, tag `site-pages`, never throws):
 * - `lastModified` is real: a page's last publish (`updatedAt`) when the
 *   index has one, and left out otherwise (a built-in page, /news, or no
 *   answer from the API), never "now";
 * - LIVE custom pages are listed at /<slug>, except those marked noindex.
 * A custom page publish, unpublish, archive or slug change sends
 * `site-pages`, which refreshes this file.
 */
const ROUTES: { path: string; priority: number }[] = [
  { path: '', priority: 1 },
  { path: '/features', priority: 0.9 },
  { path: '/news', priority: 0.8 },
  { path: '/download', priority: 0.9 },
  { path: '/about', priority: 0.7 },
  { path: '/faq', priority: 0.7 },
  { path: '/contact', priority: 0.6 },
  { path: '/terms', priority: 0.4 },
  { path: '/privacy', priority: 0.4 },
  { path: '/privacy/hi', priority: 0.4 },
  { path: '/privacy/requests', priority: 0.3 },
  { path: '/disclaimer', priority: 0.4 },
];

/** A custom page's priority: below the designed pages, like the legal ones. */
const CUSTOM_PRIORITY = 0.4;

/** An ISO date the index gave, or undefined (no date, or not a date). */
function dateOf(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = await getContentIndex();
  // The index gives each fixed page's path ("/" for home); ROUTES writes home as ''.
  const updated = new Map(index.fixed.map((f) => [f.path === '/' ? '' : f.path, dateOf(f.updatedAt)]));
  const fixed: MetadataRoute.Sitemap = ROUTES.map((r) => {
    const lastModified = updated.get(r.path);
    return {
      url: `${SITE.url}${r.path}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: 'monthly',
      priority: r.priority,
    };
  });
  const custom: MetadataRoute.Sitemap = index.custom
    .filter((c) => !c.noindex)
    .map((c) => {
      const lastModified = dateOf(c.updatedAt);
      return {
        url: `${SITE.url}/${c.slug}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly',
        priority: CUSTOM_PRIORITY,
      };
    });
  return [...fixed, ...custom];
}
