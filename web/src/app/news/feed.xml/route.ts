import { SITE } from '@/lib/site';
import { getListing } from '@/news/api';
import { newsPath } from '@/news/routes';
import { absolute, NEWS_NAME } from '@/news/seo';
import type { NewsCard } from '@/news/types';
import { escapeXml, xmlResponse } from '@/news/xml';

/** Built once, refreshed with the news pages (tag "news" or 30 s). */
export const dynamic = 'force-static';
export const revalidate = 30;

function item(c: NewsCard): string {
  const url = absolute(newsPath.article(c.slug));
  const image =
    c.image?.variants[c.image.variants.length - 1]?.url ?? c.image?.url;
  return [
    '<item>',
    `<title>${escapeXml(c.title)}</title>`,
    `<link>${url}</link>`,
    `<guid isPermaLink="true">${url}</guid>`,
    `<pubDate>${new Date(c.publishedAt).toUTCString()}</pubDate>`,
    c.author ? `<dc:creator>${escapeXml(c.author.name)}</dc:creator>` : '',
    c.category ? `<category>${escapeXml(c.category.name)}</category>` : '',
    `<description>${escapeXml(c.summary)}</description>`,
    image ? `<media:content url="${escapeXml(image)}" medium="image"/>` : '',
    '</item>',
  ].join('');
}

export async function GET() {
  const latest = await getListing({ page: 1, limit: 50 });
  const items = latest?.items ?? [];
  const built = items[0]?.publishedAt ?? new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${escapeXml(NEWS_NAME)}</title>
<link>${SITE.url}/news</link>
<description>Indian and global market news, IPOs, commodities and explainers from the StockVirtue newsroom.</description>
<language>en-in</language>
<atom:link href="${SITE.url}/news/feed.xml" rel="self" type="application/rss+xml"/>
<lastBuildDate>${new Date(built).toUTCString()}</lastBuildDate>
${items.map(item).join('\n')}
</channel>
</rss>`;
  return xmlResponse(xml, 'application/rss+xml');
}
