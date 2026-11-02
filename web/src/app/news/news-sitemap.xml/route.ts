import { getSitemap } from '@/news/api';
import { newsPath } from '@/news/routes';
import { absolute, NEWS_NAME } from '@/news/seo';
import { escapeXml, xmlResponse } from '@/news/xml';

/** Google News sitemap: stories from the last two days, at most 1,000. */
export const dynamic = 'force-static';
export const revalidate = 30;

const WINDOW_MS = 48 * 3600_000;

export async function GET() {
  const map = await getSitemap();
  const since = Date.now() - WINDOW_MS;
  const recent = map.articles
    .filter((a) => new Date(a.publishedAt).getTime() >= since)
    .slice(0, 1000);
  const entries = recent.map((a) =>
    [
      '<url>',
      `<loc>${escapeXml(absolute(newsPath.article(a.slug)))}</loc>`,
      '<news:news>',
      '<news:publication>',
      `<news:name>${escapeXml(NEWS_NAME)}</news:name>`,
      '<news:language>en</news:language>',
      '</news:publication>',
      `<news:publication_date>${new Date(a.publishedAt).toISOString()}</news:publication_date>`,
      `<news:title>${escapeXml(a.title)}</news:title>`,
      '</news:news>',
      '</url>',
    ].join(''),
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries.join('\n')}
</urlset>`;
  return xmlResponse(xml);
}
