import { createHash, randomBytes } from 'node:crypto';
import { HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaAsset, Prisma } from '@prisma/client';
import { enforceRateLimit } from '../../common/rate-limit';
import { CompanyDirectoryService } from '../../market/company-directory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ClientInfo } from '../../staff/staff-request';
import { DEFAULT_LIMITS, HomeSectionType } from '../homepage/homepage.dto';
import { HomepageService } from '../homepage/homepage.service';
import { MediaService } from '../media/media.service';
import { NewsCache } from './news-cache';
import {
  CARD_SELECT,
  DETAIL_SELECT,
  DetailRow,
  LISTED_SQL,
  PublicCard,
  PublicImage,
  inOrder,
  listedWhere,
  publicSocials,
  publicWhere,
  toCard,
} from './public-articles';

const PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
/// Breaking stories leave the banner after this long, flag or no flag.
const BREAKING_HOURS = 24;
/// "Trending" = most read today and yesterday (IST).
const TRENDING_DAYS = 2;
/// Most-read stories considered when ranking a trending list.
const TRENDING_POOL = 200;
const SITEMAP_LIMIT = 5000;
/// Views counted per reader per minute, at most.
const VIEWS_PER_MINUTE = 120;
const SEARCHES_PER_MINUTE = 60;

/// Automated clients aren't readers.
const BOT_UA =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|go-http-client|node-fetch|axios|scrapy/i;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** A calendar day in India, YYYY-MM-DD. */
export function istDay(at = new Date(), offsetDays = 0): string {
  return new Date(at.getTime() + 330 * 60_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function pageSize(limit?: number) {
  return Math.min(Math.max(limit ?? PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

function pageOf<T>(
  items: T[],
  page: number,
  size: number,
  total: number,
): Page<T> {
  return {
    items,
    page,
    pageSize: size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}

function httpsOnly(url: string | null): string | null {
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The public reading of `sourceAttribution`: names, web links, notes. */
function publicSources(raw: Prisma.JsonValue) {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return [];
    const name = text((s as Record<string, unknown>).name);
    if (!name) return [];
    const url = text((s as Record<string, unknown>).url);
    const note = text((s as Record<string, unknown>).note);
    return [
      {
        name,
        url: url && /^https?:\/\//i.test(url) ? url : null,
        note,
      },
    ];
  });
}

interface ArticleSeo {
  title?: unknown;
  description?: unknown;
  canonicalUrl?: unknown;
  noIndex?: unknown;
  noFollow?: unknown;
  ogImageId?: unknown;
}

/**
 * What readers get: the website, the app and feeds. Every query starts from
 * publicWhere/listedWhere (public-articles.ts), and every response is cached
 * in Redis until something public changes (NewsCache).
 */
@Injectable()
export class PublicNewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: NewsCache,
    private readonly media: MediaService,
    private readonly homepage: HomepageService,
    private readonly directory: CompanyDirectoryService,
  ) {}

  private readonly image = (a: MediaAsset | null): PublicImage | null =>
    this.media.publicImage(a);

  // ── Listings ────────────────────────────────────────────────────────

  list(q: {
    page?: number;
    limit?: number;
    category?: string;
    tag?: string;
    author?: string;
    sort?: 'latest' | 'trending';
  }) {
    const page = q.page ?? 1;
    const size = pageSize(q.limit);
    const sort = q.sort ?? 'latest';
    const key = `list:${q.category ?? ''}:${q.tag ?? ''}:${q.author ?? ''}:${sort}:${page}:${size}`;
    return this.cache.get(key, async () => {
      const and: Prisma.NewsArticleWhereInput[] = [listedWhere()];
      const context: Record<string, unknown> = {};
      if (q.category) {
        const c = await this.categoryContext(q.category);
        and.push({ categoryId: { in: c.ids } });
        context.category = c.view;
      }
      if (q.tag) {
        const tag = await this.prisma.newsTag.findUnique({
          where: { slug: q.tag },
          select: { id: true, slug: true, name: true },
        });
        if (!tag) throw new NotFoundException('Tag not found.');
        and.push({ tags: { some: { tagId: tag.id } } });
        context.tag = { slug: tag.slug, name: tag.name };
      }
      if (q.author) {
        const author = await this.prisma.newsAuthor.findFirst({
          where: { slug: q.author, isActive: true },
        });
        if (!author) throw new NotFoundException('Author not found.');
        and.push({ authorId: author.id });
        context.author = {
          slug: author.slug,
          name: author.name,
          bio: author.bio,
          avatarUrl: httpsOnly(author.avatarUrl),
          socials: publicSocials(author.socials),
        };
      }

      if (sort === 'trending') {
        const views = await this.trendingViews();
        const rows = await this.prisma.newsArticle.findMany({
          where: { AND: [...and, { id: { in: [...views.keys()] } }] },
          select: CARD_SELECT,
        });
        rows.sort(
          (a, b) =>
            (views.get(b.id) ?? 0) - (views.get(a.id) ?? 0) ||
            b.publishedAt!.getTime() - a.publishedAt!.getTime(),
        );
        const slice = rows.slice((page - 1) * size, page * size);
        return {
          ...pageOf(
            slice.map((r) => toCard(r, this.image)),
            page,
            size,
            rows.length,
          ),
          ...context,
        };
      }

      const where = { AND: and };
      const [total, rows] = await Promise.all([
        this.prisma.newsArticle.count({ where }),
        this.prisma.newsArticle.findMany({
          where,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * size,
          take: size,
          select: CARD_SELECT,
        }),
      ]);
      return {
        ...pageOf(
          rows.map((r) => toCard(r, this.image)),
          page,
          size,
          total,
        ),
        ...context,
      };
    });
  }

  featured(limit = 5) {
    return this.cache.get(`featured:${limit}`, () =>
      this.cards({ isFeatured: true }, limit),
    );
  }

  breaking(limit = 3) {
    return this.cache.get(`breaking:${limit}`, () => this.breakingCards(limit));
  }

  trending(limit = 5) {
    return this.cache.get(`trending:${limit}`, () => this.trendingCards(limit));
  }

  /** Active categories as a tree (one level of children). */
  categories() {
    return this.cache.get('categories', () =>
      this.prisma.newsCategory.findMany({
        where: { isActive: true, parentId: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          slug: true,
          name: true,
          description: true,
          children: {
            where: { isActive: true },
            orderBy: [{ position: 'asc' }, { name: 'asc' }],
            select: { slug: true, name: true, description: true },
          },
        },
      }),
    );
  }

  /** Full-text search over headline, standfirst, summary and body. */
  search(raw: string | undefined, page = 1, limit?: number) {
    const q = (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const size = pageSize(limit);
    if (q.length < 2) {
      return Promise.resolve({ query: q, ...pageOf([], 1, size, 0) });
    }
    const digest = createHash('sha1').update(q.toLowerCase()).digest('hex');
    return this.cache.get(`search:${digest}:${page}:${size}`, async () => {
      const match = Prisma.sql`a."searchVector" @@ websearch_to_tsquery('english', ${q}) AND ${LISTED_SQL}`;
      const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM news_articles a WHERE ${match}`;
      const total = Number(n);
      const hits = total
        ? await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT a.id FROM news_articles a WHERE ${match}
             ORDER BY ts_rank(a."searchVector", websearch_to_tsquery('english', ${q})) DESC,
                      a."publishedAt" DESC
             LIMIT ${size} OFFSET ${(page - 1) * size}`
        : [];
      const ids = hits.map((h) => h.id);
      const rows = ids.length
        ? await this.prisma.newsArticle.findMany({
            where: { AND: [listedWhere(), { id: { in: ids } }] },
            select: CARD_SELECT,
          })
        : [];
      return {
        query: q,
        ...pageOf(
          inOrder(ids, rows).map((r) => toCard(r, this.image)),
          page,
          size,
          total,
        ),
      };
    });
  }

  /** Stories tagged with a listed company. */
  stock(symbolRaw: string, exchange: 'NSE' | 'BSE', page = 1, limit?: number) {
    const symbol = symbolRaw.trim().toUpperCase();
    const size = pageSize(limit);
    return this.cache.get(
      `stock:${exchange}:${symbol}:${page}:${size}`,
      async () => {
        const where = {
          AND: [listedWhere(), { stocks: { some: { exchange, symbol } } }],
        };
        const [total, rows] = await Promise.all([
          this.prisma.newsArticle.count({ where }),
          this.prisma.newsArticle.findMany({
            where,
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * size,
            take: size,
            select: CARD_SELECT,
          }),
        ]);
        const name = this.directory.nameFor(symbol);
        if (!total && !name) {
          throw new NotFoundException('No stories about that stock.');
        }
        return {
          stock: { symbol, exchange, name },
          ...pageOf(
            rows.map((r) => toCard(r, this.image)),
            page,
            size,
            total,
          ),
        };
      },
    );
  }

  /** One story, by its address. Retracted stories stay readable (noindex). */
  article(slug: string) {
    return this.cache.get(`article:${slug}`, async () => {
      const a = await this.prisma.newsArticle.findFirst({
        where: { AND: [publicWhere(), { slug }] },
        select: DETAIL_SELECT,
      });
      if (!a) throw new NotFoundException('Article not found.');
      return this.detailView(a);
    });
  }

  /**
   * The /news homepage: the configured sections, filled in order. Featured
   * and top stories never repeat a story; category fronts prefer unseen ones.
   */
  home() {
    return this.cache.get('home', async () => {
      const { config } = await this.homepage.current();
      const shown = new Set<string>();
      /** Stories in the banner or the featured block. */
      const prominent = new Set<string>();
      const fresh = (cards: PublicCard[]) =>
        cards.filter((c, i) => {
          if (shown.has(c.id)) return false;
          return cards.findIndex((x) => x.id === c.id) === i;
        });
      const sections: {
        id: string;
        type: HomeSectionType;
        title: string;
        category?: { slug: string; name: string };
        items: PublicCard[];
      }[] = [];
      for (const s of config.sections) {
        if (!s.enabled) continue;
        const limit = s.limit ?? DEFAULT_LIMITS[s.type];
        let items: PublicCard[] = [];
        let category: { slug: string; name: string } | undefined;
        switch (s.type) {
          case 'app_promo':
            sections.push({ id: s.id, type: s.type, title: s.title, items });
            continue;
          case 'breaking':
            items = await this.breakingCards(limit);
            break;
          case 'trending':
            items = await this.trendingCards(limit);
            break;
          case 'featured':
            // Featured stories first, topped up with the latest ones.
            items = fresh([
              ...(await this.cards({ isFeatured: true }, limit)),
              ...(await this.cards({}, limit + shown.size + limit)),
            ]).slice(0, limit);
            break;
          case 'latest':
            items = fresh(await this.cards({}, limit + shown.size)).slice(
              0,
              limit,
            );
            break;
          case 'category': {
            const cat = await this.prisma.newsCategory.findFirst({
              where: { slug: s.categorySlug, isActive: true },
              select: {
                id: true,
                slug: true,
                name: true,
                children: { where: { isActive: true }, select: { id: true } },
              },
            });
            if (!cat) continue;
            category = { slug: cat.slug, name: cat.name };
            const pool = await this.cards(
              {
                categoryId: { in: [cat.id, ...cat.children.map((c) => c.id)] },
              },
              limit + shown.size,
            );
            // Unseen stories first, then ones shown lower down, banner and
            // featured stories last: a section front still shows its latest
            // stories rather than vanishing on a quiet news day.
            const tier = (c: PublicCard) =>
              prominent.has(c.id) ? 2 : shown.has(c.id) ? 1 : 0;
            items = [...pool].sort((a, b) => tier(a) - tier(b)).slice(0, limit);
            break;
          }
        }
        if (!items.length) continue;
        if (s.type === 'breaking' || s.type === 'featured') {
          for (const c of items) prominent.add(c.id);
        }
        // The banner and the most-read list may repeat stories shown elsewhere.
        if (s.type !== 'breaking' && s.type !== 'trending') {
          for (const c of items) shown.add(c.id);
        }
        sections.push({
          id: s.id,
          type: s.type,
          title: s.title,
          ...(category ? { category } : {}),
          items,
        });
      }
      return { sections };
    });
  }

  /** Everything a sitemap lists. Stories marked noindex or canonical elsewhere are left out. */
  sitemap() {
    return this.cache.get('sitemap', async () => {
      const listed = listedWhere();
      const [articles, categories, tags, authors] = await Promise.all([
        this.prisma.newsArticle.findMany({
          where: listed,
          orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
          take: SITEMAP_LIMIT,
          select: {
            slug: true,
            title: true,
            publishedAt: true,
            updatedAt: true,
            seo: true,
            featuredImage: true,
          },
        }),
        this.prisma.newsCategory.findMany({
          where: {
            isActive: true,
            OR: [
              { articles: { some: listed } },
              {
                children: {
                  some: { isActive: true, articles: { some: listed } },
                },
              },
            ],
          },
          select: { slug: true, updatedAt: true },
        }),
        this.prisma.newsTag.findMany({
          where: { articles: { some: { article: listed } } },
          select: { slug: true },
          take: SITEMAP_LIMIT,
        }),
        this.prisma.newsAuthor.findMany({
          where: { isActive: true, articles: { some: listed } },
          select: { slug: true, updatedAt: true },
        }),
      ]);
      return {
        articles: articles
          .filter((a) => {
            const seo = (a.seo ?? {}) as ArticleSeo;
            const canonical = text(seo.canonicalUrl);
            return (
              seo.noIndex !== true &&
              (!canonical || canonical.endsWith(`/news/${a.slug}`))
            );
          })
          .map((a) => {
            const img = this.image(a.featuredImage);
            return {
              slug: a.slug,
              title: a.title,
              publishedAt: a.publishedAt,
              updatedAt: a.updatedAt,
              image: img ? { url: img.url, alt: img.alt } : null,
            };
          }),
        categories,
        tags,
        authors,
      };
    });
  }

  // ── Engagement ──────────────────────────────────────────────────────

  /**
   * Counts a page view once per reader, story and day. The reader is a
   * salted hash of IP and browser that lives in Redis for a day and a half;
   * nothing about the reader is stored in the database.
   */
  async recordView(id: string, client: ClientInfo) {
    const ip = client.ip ?? 'unknown';
    const ua = client.userAgent ?? '';
    try {
      await enforceRateLimit(
        this.redis.client,
        `rl:news:view:${ip}`,
        VIEWS_PER_MINUTE,
        60,
        'Too many requests. Try again in a minute.',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
      return { counted: false };
    }
    const live = await this.prisma.newsArticle.findFirst({
      where: { AND: [publicWhere(), { id }] },
      select: { id: true },
    });
    if (!live) throw new NotFoundException('Article not found.');
    if (!ua || BOT_UA.test(ua)) return { counted: false };
    const day = istDay();
    try {
      const salt = await this.daySalt(day);
      const reader = createHash('sha256')
        .update(`${salt}|${ip}|${ua}|${id}`)
        .digest('hex');
      const first = await this.redis.client.set(
        `news:view:${day}:${reader}`,
        '1',
        'EX',
        36 * 3600,
        'NX',
      );
      if (first !== 'OK') return { counted: false };
    } catch {
      return { counted: false };
    }
    await this.prisma.$executeRaw`
      INSERT INTO news_daily_stats ("articleId", day, views)
      VALUES (${id}::uuid, ${day}::date, 1)
      ON CONFLICT ("articleId", day)
      DO UPDATE SET views = news_daily_stats.views + 1`;
    return { counted: true };
  }

  /** Per-IP search limit, so the full-text query can't be hammered. */
  async limitSearch(client: ClientInfo) {
    try {
      await enforceRateLimit(
        this.redis.client,
        `rl:news:search:${client.ip ?? 'unknown'}`,
        SEARCHES_PER_MINUTE,
        60,
        'Too many searches. Try again in a minute.',
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  /** Newest listed stories matching `where`. */
  private async cards(where: Prisma.NewsArticleWhereInput, take: number) {
    const rows = await this.prisma.newsArticle.findMany({
      where: { AND: [listedWhere(), where] },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take,
      select: CARD_SELECT,
    });
    return rows.map((r) => toCard(r, this.image));
  }

  private breakingCards(limit: number) {
    return this.cards(
      {
        isBreaking: true,
        publishedAt: { gte: new Date(Date.now() - BREAKING_HOURS * 3600_000) },
      },
      limit,
    );
  }

  private async trendingCards(limit: number) {
    const views = await this.trendingViews();
    if (!views.size) return [];
    const rows = await this.prisma.newsArticle.findMany({
      where: { AND: [listedWhere(), { id: { in: [...views.keys()] } }] },
      select: CARD_SELECT,
    });
    return rows
      .sort(
        (a, b) =>
          (views.get(b.id) ?? 0) - (views.get(a.id) ?? 0) ||
          b.publishedAt!.getTime() - a.publishedAt!.getTime(),
      )
      .slice(0, limit)
      .map((r) => toCard(r, this.image));
  }

  /** Views per story over the trending window, most read first. */
  private async trendingViews(): Promise<Map<string, number>> {
    const since = istDay(new Date(), -(TRENDING_DAYS - 1));
    const rows = await this.prisma.$queryRaw<{ id: string; views: bigint }[]>`
      SELECT "articleId" AS id, SUM(views)::bigint AS views
        FROM news_daily_stats
       WHERE day >= ${since}::date
       GROUP BY "articleId"
       ORDER BY views DESC
       LIMIT ${TRENDING_POOL}`;
    return new Map(rows.map((r) => [r.id, Number(r.views)]));
  }

  private async categoryContext(slug: string) {
    const c = await this.prisma.newsCategory.findFirst({
      where: { slug, isActive: true },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        parent: { select: { slug: true, name: true, isActive: true } },
        children: {
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, slug: true, name: true },
        },
      },
    });
    if (!c) throw new NotFoundException('Category not found.');
    return {
      ids: [c.id, ...c.children.map((x) => x.id)],
      view: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        parent: c.parent?.isActive
          ? { slug: c.parent.slug, name: c.parent.name }
          : null,
        children: c.children.map((x) => ({ slug: x.slug, name: x.name })),
      },
    };
  }

  /** A random value per day: reader hashes can't be linked across days or reversed. */
  private async daySalt(day: string): Promise<string> {
    const key = `news:viewsalt:${day}`;
    await this.redis.client.set(
      key,
      randomBytes(16).toString('hex'),
      'EX',
      2 * 86_400,
      'NX',
    );
    return (await this.redis.client.get(key)) ?? day;
  }

  private async detailView(a: DetailRow) {
    const seo = (a.seo ?? {}) as ArticleSeo;
    const relatedIds = a.related.map((r) => r.relatedId);
    const ogImageId = text(seo.ogImageId);
    const [relatedRows, ogAsset] = await Promise.all([
      relatedIds.length
        ? this.prisma.newsArticle.findMany({
            where: { AND: [listedWhere(), { id: { in: relatedIds } }] },
            select: CARD_SELECT,
          })
        : Promise.resolve([]),
      ogImageId
        ? this.prisma.mediaAsset.findUnique({ where: { id: ogImageId } })
        : Promise.resolve(null),
    ]);
    return {
      ...toCard(a, this.image),
      firstPublishedAt: a.firstPublishedAt,
      contentHtml: a.contentHtml,
      imageCaption: a.featuredImageCaption,
      category: a.category?.isActive
        ? {
            slug: a.category.slug,
            name: a.category.name,
            parent: a.category.parent?.isActive
              ? { slug: a.category.parent.slug, name: a.category.parent.name }
              : null,
          }
        : null,
      author: a.author?.isActive
        ? {
            slug: a.author.slug,
            name: a.author.name,
            avatarUrl: httpsOnly(a.author.avatarUrl),
            bio: a.author.bio,
            socials: publicSocials(a.author.socials),
          }
        : null,
      tags: a.tags.map((t) => t.tag),
      sectors: a.sectors,
      stocks: a.stocks.map((s) => ({
        exchange: s.exchange,
        symbol: s.symbol,
        name: this.directory.nameFor(s.symbol),
      })),
      sources: publicSources(a.sourceAttribution),
      correctionNote: a.correctionNote,
      retractedAt: a.retractedAt,
      retractionNote: a.retractionNote,
      seo: {
        title: text(seo.title),
        description: text(seo.description),
        canonicalUrl: text(seo.canonicalUrl),
        noIndex: seo.noIndex === true || !!a.retractedAt,
        noFollow: seo.noFollow === true,
        image: this.image(ogAsset),
      },
      related: inOrder(relatedIds, relatedRows).map((r) =>
        toCard(r, this.image),
      ),
    };
  }
}
