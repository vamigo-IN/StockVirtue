import { Injectable, Logger } from '@nestjs/common';
import {
  NewsArrivalMode,
  NewsItemStatus,
  NewsSource,
  NewsSourceItem,
  NewsSourceUsage,
  NewsStatus,
  NewsVersionReason,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { recordVersion } from '../newsroom/articles/article-versions';
import {
  normalizeDoc,
  plainText,
  readingMinutes,
  renderHtml,
} from '../newsroom/content/article-content';
import { ArticlePublisher } from '../newsroom/publishing/article-publisher';
import { freeSlug, RESERVED_ARTICLE_SLUGS, slugify } from '../newsroom/slug';
import { PrismaService } from '../prisma/prisma.service';
import { SourcePicturesService } from './source-pictures.service';
import { clip } from './text';

/// The byline on stories nobody wrote: made from a news source automatically.
const DESK = { slug: 'news-desk', name: 'StockVirtue News Desk' };
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const IST = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

type Source = Pick<
  NewsSource,
  'id' | 'name' | 'arrivalMode' | 'autoDailyLimit' | 'categoryId'
>;

export interface StoryBody {
  paragraphs: string[];
  summary: string;
  /** Something the licence lets readers see beyond the headline. */
  publishable: boolean;
}

/**
 * What a story made from an item may say, by the licence it arrived under:
 * the full text (FULL_TEXT), else the source's summary (SUMMARY), else
 * nothing but the headline and link (HEADLINE_ONLY: never published alone).
 */
export function storyBody(item: {
  usage: NewsSourceUsage;
  summary: string | null;
  content: string | null;
}): StoryBody {
  const split = (text: string) =>
    text
      .split(/\n+/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 80);
  const summary = item.summary?.trim() ?? '';
  if (item.usage === NewsSourceUsage.FULL_TEXT && item.content?.trim()) {
    const paragraphs = split(item.content);
    return {
      paragraphs,
      summary: clip(summary || paragraphs[0] || '', 300),
      publishable: paragraphs.length > 0,
    };
  }
  if (item.usage !== NewsSourceUsage.HEADLINE_ONLY && summary) {
    return {
      paragraphs: split(summary),
      summary: clip(summary, 300),
      publishable: true,
    };
  }
  return { paragraphs: [], summary: '', publishable: false };
}

/** Midnight in India, as a UTC instant. */
export function istDayStart(now: Date): Date {
  return new Date(
    Math.floor((now.getTime() + IST_MS) / DAY_MS) * DAY_MS - IST_MS,
  );
}

/**
 * Stories made from a source's new items without a person, as its arrival
 * mode (a Super Admin's choice) says: drafts for an editor to check and
 * publish, or published at once through the scheduled-publishing path. Only
 * items no other item or story already covers (not even possibly), at most
 * the source's daily limit, oldest first, and only what the licence allows,
 * always with the source credited, and with its picture where the licence
 * covers pictures. Runs in the worker after each fetch; anything it leaves
 * stays in Incoming news for a person.
 *
 * An AI step that retells the item in our own words can sit in `make` later.
 */
@Injectable()
export class AutoStoryService {
  private readonly logger = new Logger(AutoStoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publisher: ArticlePublisher,
    private readonly pictures: SourcePicturesService,
  ) {}

  async handle(
    source: Source,
    itemIds: string[],
    now = new Date(),
  ): Promise<{ drafted: number; published: number }> {
    const done = { drafted: 0, published: 0 };
    if (source.arrivalMode === NewsArrivalMode.INBOX || !itemIds.length) {
      return done;
    }
    const madeToday = await this.prisma.newsSourceItem.count({
      where: {
        sourceId: source.id,
        status: NewsItemStatus.DRAFTED,
        handledById: null,
        handledAt: { gte: istDayStart(now) },
      },
    });
    let room = source.autoDailyLimit - madeToday;
    if (room <= 0) return done;
    const items = await this.prisma.newsSourceItem.findMany({
      where: {
        id: { in: itemIds },
        status: NewsItemStatus.NEW,
        duplicateOfId: null,
        duplicateOfArticleId: null,
      },
      orderBy: [{ publishedAt: 'asc' }, { fetchedAt: 'asc' }],
    });
    const publish = source.arrivalMode === NewsArrivalMode.PUBLISH;
    for (const item of items) {
      if (room <= 0) break;
      const body = storyBody(item);
      // Nothing the licence lets readers see: a person decides.
      if (publish && !body.publishable) continue;
      try {
        const id = await this.make(source, item, body, publish, now);
        room--;
        if (publish) {
          await this.publisher.publishScheduled(id, now);
          done.published++;
        } else {
          done.drafted++;
        }
      } catch (err) {
        this.logger.warn(
          `No automatic story from item ${item.id}: ${(err as Error).message}`,
        );
      }
    }
    if (done.drafted || done.published) {
      this.logger.log(
        `${source.name}: ${done.published} published, ${done.drafted} drafted automatically`,
      );
    }
    return done;
  }

  /** The story itself: a draft, or scheduled for now when it is to be published. */
  private async make(
    source: Source,
    item: NewsSourceItem,
    body: StoryBody,
    publish: boolean,
    now: Date,
  ): Promise<string> {
    const doc = normalizeDoc({
      type: 'doc',
      content: body.paragraphs.length
        ? body.paragraphs.map((text) => ({
            type: 'paragraph',
            content: [{ type: 'text', text }],
          }))
        : [{ type: 'paragraph' }],
    }).doc;
    const html = renderHtml(doc, {
      media: new Map(),
      related: new Map(),
      articleBase: '/news',
    });
    const text = plainText(doc);
    const title =
      item.title.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled story';
    const slug = await freeSlug(
      slugify(title),
      async (s) =>
        RESERVED_ARTICLE_SLUGS.has(s) ||
        !!(await this.prisma.newsArticle.findUnique({
          where: { slug: s },
          select: { id: true },
        })),
    );
    const author = await this.prisma.newsAuthor.upsert({
      where: { slug: DESK.slug },
      create: DESK,
      update: {},
    });
    const credit = item.attribution || source.name;
    const when = item.publishedAt ? IST.format(item.publishedAt) : null;
    const stocks = (Array.isArray(item.stocks) ? item.stocks : [])
      .map((s) => s as { exchange?: string; symbol?: string })
      .filter(
        (s): s is { exchange: 'NSE' | 'BSE'; symbol: string } =>
          (s.exchange === 'NSE' || s.exchange === 'BSE') && !!s.symbol,
      )
      .slice(0, 8);
    const featuredImageId = await this.pictures.forItem(item, {
      userId: null,
      email: `automation (${source.name})`,
    });

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.newsArticle.create({
        data: {
          title,
          slug,
          status: publish ? NewsStatus.SCHEDULED : NewsStatus.DRAFT,
          scheduledAt: publish ? now : null,
          authorId: author.id,
          categoryId: item.suggestedCategoryId ?? source.categoryId ?? null,
          featuredImageId,
          summary: body.summary,
          content: doc as unknown as Prisma.InputJsonValue,
          contentHtml: html,
          contentText: text,
          readingMinutes: readingMinutes(text),
          sourceAttribution: [
            {
              name: credit.slice(0, 120),
              ...(item.url ? { url: item.url } : {}),
              ...(when ? { note: `Published ${when} IST` } : {}),
            },
          ],
          editorialNotes: publish
            ? `Published automatically from ${credit}.`
            : `Made automatically from ${credit}${when ? ` (${when} IST)` : ''}. Check it against the source and rewrite the headline before publishing.`,
        },
      });
      // One story per item, even if two runs race for it.
      const claimed = await tx.newsSourceItem.updateMany({
        where: { id: item.id, status: NewsItemStatus.NEW },
        data: {
          status: NewsItemStatus.DRAFTED,
          articleId: created.id,
          handledAt: now,
        },
      });
      if (claimed.count !== 1) throw new Error('the item was just handled');
      if (stocks.length) {
        await tx.newsArticleStock.createMany({
          data: stocks.map((s, i) => ({
            articleId: created.id,
            exchange: s.exchange,
            symbol: s.symbol,
            isPrimary: i === 0,
          })),
          skipDuplicates: true,
        });
      }
      await recordVersion(tx, created.id, NewsVersionReason.MANUAL, null, {
        force: true,
      });
      await this.audit.record(
        {
          actor: { userId: null, email: `automation (${source.name})` },
          action: 'news.article.create',
          entityType: 'NewsArticle',
          entityId: created.id,
          after: { title, status: created.status },
          meta: { sourceItemId: item.id, arrivalMode: source.arrivalMode },
        },
        tx,
      );
      return created.id;
    });
  }
}
