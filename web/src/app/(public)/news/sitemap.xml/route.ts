import { getSettings } from '@/lib/settings';
import { getSitemap } from '@/news/api';
import { newsPath } from '@/news/routes';
import { absolute } from '@/news/seo';
import { escapeXml, xmlResponse } from '@/news/xml';

/**
 * Every indexable news address. Refreshed with the news pages, so a publish,
 * edit or takedown reaches it within seconds (tag "news", 30 s fallback).
 */
export const dynamic = 'force-static';
export const revalidate = 30;

function url(loc: string, opts: { lastmod?: string; image?: string } = {}) {
  return [
    '<url>',
    `<loc>${escapeXml(loc)}</loc>`,
    opts.lastmod
      ? `<lastmod>${new Date(opts.lastmod).toISOString()}</lastmod>`
      : '',
    opts.image
      ? `<image:image><image:loc>${escapeXml(opts.image)}</image:loc></image:image>`
      : '',
    '</url>',
  ].join('');
}

export async function GET() {
  const [map, settings] = await Promise.all([getSitemap(), getSettings()]);
  const { search } = settings.config;
  const newest = map.articles[0]?.updatedAt;
  const entries = [
    url(absolute(newsPath.home()), { lastmod: newest }),
    url(absolute(newsPath.latest()), { lastmod: newest }),
    ...(search.sitemapCategories ? map.categories : []).map((c) =>
      url(absolute(newsPath.category(c.slug)), { lastmod: c.updatedAt }),
    ),
    ...(search.sitemapTags ? map.tags : []).map((t) =>
      url(absolute(newsPath.tag(t.slug))),
    ),
    ...(search.sitemapAuthors ? map.authors : []).map((a) =>
      url(absolute(newsPath.author(a.slug)), { lastmod: a.updatedAt }),
    ),
    ...map.articles.map((a) =>
      url(absolute(newsPath.article(a.slug)), {
        lastmod: a.updatedAt,
        image: a.image?.url,
      }),
    ),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join('\n')}
</urlset>`;
  return xmlResponse(xml);
}
