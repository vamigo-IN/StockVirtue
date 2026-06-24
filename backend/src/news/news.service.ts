import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/// One news item — what the client renders in a row.
export interface NewsItem {
  title: string;
  link: string;
  source: string;
  publishedAt: string | null;
  summary: string;
}

interface FeedSource {
  url: string;
  label: string;
}

// Free Indian financial-markets RSS feeds. Add or swap entries here to
// adjust the news mix — no other code changes needed.
const FEEDS: FeedSource[] = [
  {
    url: 'https://www.moneycontrol.com/rss/business.xml',
    label: 'Moneycontrol',
  },
  {
    url: 'https://www.moneycontrol.com/rss/marketreports.xml',
    label: 'Moneycontrol Markets',
  },
  {
    url:
      'https://economictimes.indiatimes.com/markets/stocks/news/rssfeeds/2146842.cms',
    label: 'ET Markets',
  },
];

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes — RSS feeds update slowly
const HTTP_TIMEOUT_MS = 8000;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private cache: { fetchedAt: number; items: NewsItem[] } | null = null;

  /// Returns the merged feed across all sources, deduped by link, sorted
  /// newest first. Optional `symbol` filters items that mention the symbol
  /// (case-insensitive substring on title or summary).
  async getNews(opts: {
    symbol?: string;
    limit?: number;
  }): Promise<NewsItem[]> {
    const items = await this.getCachedItems();
    const symbol = opts.symbol?.trim();
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    if (!symbol) return items.slice(0, limit);
    const needle = symbol.toUpperCase();
    return items
      .filter((it) => {
        const blob = (it.title + ' ' + it.summary).toUpperCase();
        return blob.includes(needle);
      })
      .slice(0, limit);
  }

  private async getCachedItems(): Promise<NewsItem[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.items;
    }
    const results = await Promise.allSettled(
      FEEDS.map((f) => this.fetchFeed(f)),
    );
    const items: NewsItem[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') items.push(...r.value);
    }
    // Dedupe by link, sort newest first.
    const seen = new Set<string>();
    const deduped: NewsItem[] = [];
    for (const it of items) {
      if (seen.has(it.link)) continue;
      seen.add(it.link);
      deduped.push(it);
    }
    deduped.sort((a, b) => {
      const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bt - at;
    });
    this.cache = { fetchedAt: now, items: deduped };
    return deduped;
  }

  private async fetchFeed(source: FeedSource): Promise<NewsItem[]> {
    try {
      const { data } = await axios.get<string>(source.url, {
        timeout: HTTP_TIMEOUT_MS,
        responseType: 'text',
        headers: {
          'User-Agent':
            'StockVirtueBot/1.0 (+https://github.com/Vamigo/stockvirtue)',
        },
      });
      return parseRss(data, source.label);
    } catch (err) {
      this.logger.warn(
        `News feed ${source.label} fetch failed: ${(err as Error).message}`,
      );
      return [];
    }
  }
}

/// Minimal RSS 2.0 parser. We extract <item> blocks and the basic fields
/// inside them — title, link, description, pubDate. CDATA sections are
/// unwrapped; HTML tags inside descriptions are stripped for a clean
/// inline summary. This is intentionally lightweight (no XML library) so
/// we don't drag in a dependency for a single-purpose parser.
function parseRss(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const title = unwrap(field(block, 'title'));
    const link = unwrap(field(block, 'link'));
    if (!title || !link) continue;
    const pub = unwrap(field(block, 'pubDate'));
    const desc = unwrap(field(block, 'description'));
    items.push({
      title: decodeHtmlEntities(title.trim()),
      link: link.trim(),
      source,
      publishedAt: pub ? new Date(pub).toISOString() : null,
      summary: decodeHtmlEntities(stripTags(desc).trim()).slice(0, 240),
    });
  }
  return items;
}

function field(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : null;
}

function unwrap(value: string | null): string {
  if (!value) return '';
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value.trim());
  return cdata ? cdata[1] : value;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
