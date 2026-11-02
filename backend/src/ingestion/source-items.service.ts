import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiJobStatus,
  AiTask,
  NewsItemStatus,
  NewsSourceFormat,
  NewsSourceType,
  NewsSourceUsage,
  NewsStatus,
  Prisma,
} from '@prisma/client';
import type { DraftOutput } from '../ai/ai-tasks';
import { draftDoc } from '../ai/draft-doc';
import type { GuardReport } from '../ai/fact-guard';
import { AuditService } from '../audit/audit.service';
import { capabilities, has } from '../newsroom/articles/article-access';
import { ArticlesService } from '../newsroom/articles/articles.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { IngestService } from './ingest.service';
import { ItemsQuery, ManualItemDto, StartStoryDto } from './ingestion.dto';
import { canonicalUrl, headlineSimilarity, titleTokens } from './text';

const PAGE_SIZE = 30;
const DAY = 86_400_000;
const MANUAL_SOURCE_NAME = 'Manual submissions';

const ITEM_INCLUDE = {
  source: { select: { id: true, name: true, type: true, categoryId: true } },
  suggestedCategory: { select: { id: true, name: true } },
  duplicateOf: {
    select: {
      id: true,
      title: true,
      status: true,
      source: { select: { name: true } },
    },
  },
  duplicateOfArticle: { select: { id: true, title: true, status: true } },
  article: { select: { id: true, title: true, status: true } },
  handledBy: { select: { id: true, displayName: true } },
  aiJobs: {
    where: { task: AiTask.DRAFT_FROM_SOURCE },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      finishedAt: true,
    },
  },
} satisfies Prisma.NewsSourceItemInclude;
type ItemRow = Prisma.NewsSourceItemGetPayload<{
  include: typeof ITEM_INCLUDE;
}>;

const IST = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * The Incoming news list: items waiting for a person (step 8), who can
 * dismiss them or start a story (blank, or from an AI draft they have
 * read). A story started here is an ordinary draft in the review workflow.
 */
@Injectable()
export class SourceItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly articles: ArticlesService,
    private readonly ingest: IngestService,
  ) {}

  private where(
    q: ItemsQuery,
    withStatus: boolean,
  ): Prisma.NewsSourceItemWhereInput {
    const status = q.status ?? NewsItemStatus.NEW;
    return {
      ...(withStatus && status !== 'ALL' ? { status } : {}),
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.q?.trim()
        ? { title: { contains: q.q.trim(), mode: 'insensitive' } }
        : {}),
      ...(q.stock ? { stockRefs: { has: q.stock.toUpperCase() } } : {}),
      ...(q.topic ? { topics: { has: q.topic } } : {}),
    };
  }

  async list(q: ItemsQuery) {
    const page = q.page ?? 1;
    const where = this.where(q, true);
    const [rows, total, counts] = await Promise.all([
      this.prisma.newsSourceItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: [{ fetchedAt: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.newsSourceItem.count({ where }),
      this.prisma.newsSourceItem.groupBy({
        by: ['status'],
        where: this.where(q, false),
        _count: { _all: true },
      }),
    ]);
    const byStatus = Object.fromEntries(
      Object.values(NewsItemStatus).map((s) => [s, 0]),
    ) as Record<NewsItemStatus, number>;
    for (const c of counts) byStatus[c.status] = c._count._all;
    return {
      items: rows.map((r) => this.view(r)),
      total,
      page,
      pageSize: PAGE_SIZE,
      counts: byStatus,
    };
  }

  private view(r: ItemRow) {
    return {
      id: r.id,
      title: r.title,
      url: r.url,
      summary: r.summary,
      hasFullText: !!r.content,
      author: r.author,
      publishedAt: r.publishedAt,
      fetchedAt: r.fetchedAt,
      usage: r.usage,
      allowAiDrafts: r.allowAiDrafts,
      attribution: r.attribution,
      feedCategories: r.feedCategories,
      stocks: r.stocks,
      topics: r.topics,
      status: r.status,
      duplicateScore: r.duplicateScore,
      source: { id: r.source.id, name: r.source.name, type: r.source.type },
      suggestedCategory: r.suggestedCategory,
      duplicateOf: r.duplicateOf
        ? {
            id: r.duplicateOf.id,
            title: r.duplicateOf.title,
            status: r.duplicateOf.status,
            source: r.duplicateOf.source.name,
          }
        : null,
      duplicateOfArticle: r.duplicateOfArticle,
      article: r.article,
      handledBy: r.handledBy,
      handledAt: r.handledAt,
      aiDraft: r.aiJobs[0] ?? null,
    };
  }

  async get(id: string) {
    const r = await this.prisma.newsSourceItem.findUnique({
      where: { id },
      include: ITEM_INCLUDE,
    });
    if (!r)
      throw new NotFoundException(
        'That item is no longer in the incoming list.',
      );
    const draft = await this.prisma.aiJob.findFirst({
      where: {
        sourceItemId: id,
        task: AiTask.DRAFT_FROM_SOURCE,
        status: AiJobStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        output: true,
        checks: true,
        model: true,
        finishedAt: true,
      },
    });
    return { ...this.view(r), content: r.content, draft };
  }

  private requireTriage(actor: StaffPrincipal) {
    if (!has(actor, 'news.create')) {
      throw new ForbiddenException(
        'Handling incoming news needs the news.create permission.',
      );
    }
  }

  async dismiss(actor: StaffPrincipal, id: string, client: ClientInfo) {
    this.requireTriage(actor);
    const res = await this.prisma.newsSourceItem.updateMany({
      where: {
        id,
        status: { in: [NewsItemStatus.NEW, NewsItemStatus.DUPLICATE] },
      },
      data: {
        status: NewsItemStatus.DISMISSED,
        handledById: actor.staffId,
        handledAt: new Date(),
      },
    });
    if (res.count === 0)
      throw new ConflictException('This item was already handled.');
    await this.record(actor, 'news.item.dismiss', id, client);
    return this.get(id);
  }

  async restore(actor: StaffPrincipal, id: string, client: ClientInfo) {
    this.requireTriage(actor);
    const res = await this.prisma.newsSourceItem.updateMany({
      where: { id, status: NewsItemStatus.DISMISSED },
      data: { status: NewsItemStatus.NEW, handledById: null, handledAt: null },
    });
    if (res.count === 0)
      throw new ConflictException('Only dismissed items can be restored.');
    await this.record(actor, 'news.item.restore', id, client);
    return this.get(id);
  }

  /** Step 10–11: a person turns the item into a draft story, which then goes through review. */
  async startStory(
    actor: StaffPrincipal,
    id: string,
    dto: StartStoryDto,
    client: ClientInfo,
  ) {
    this.requireTriage(actor);
    const item = await this.prisma.newsSourceItem.findUnique({
      where: { id },
      include: { source: { select: { name: true, categoryId: true } } },
    });
    if (!item)
      throw new NotFoundException(
        'That item is no longer in the incoming list.',
      );
    if (item.status === NewsItemStatus.DRAFTED) {
      throw new ConflictException({
        message: 'A story was already started from this item.',
        articleId: item.articleId,
      });
    }
    let draft: DraftOutput | null = null;
    let report: GuardReport | null = null;
    if (dto.aiJobId) {
      if (!has(actor, 'ai.use')) {
        throw new ForbiddenException(
          'Using AI drafts needs the ai.use permission.',
        );
      }
      const job = await this.prisma.aiJob.findUnique({
        where: { id: dto.aiJobId },
      });
      if (
        !job ||
        job.sourceItemId !== id ||
        job.task !== AiTask.DRAFT_FROM_SOURCE ||
        job.status !== AiJobStatus.SUCCEEDED
      ) {
        throw new BadRequestException(
          'That AI draft isn’t available for this item.',
        );
      }
      draft = job.output as unknown as DraftOutput;
      report = job.checks as unknown as GuardReport | null;
    }

    const credit = item.attribution || item.source.name;
    const when = item.publishedAt ? IST.format(item.publishedAt) : null;
    const notes = [
      `Started from ${credit}${when ? ` (${when} IST)` : ''}.`,
      item.url ?? '',
      item.usage !== NewsSourceUsage.HEADLINE_ONLY && item.summary
        ? `Source summary: ${item.summary}`
        : '',
      draft
        ? 'The body is an AI draft. Check every fact against the source, and rewrite as needed, before sending it for review.'
        : 'Write the story in your own words, and rewrite the working headline.',
      report?.removed?.length
        ? `The automatic checks removed ${report.removed.length} sentence(s) from the AI draft (figures not in the source, or copied wording).`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const stocks = (Array.isArray(item.stocks) ? item.stocks : [])
      .map((s) => s as { exchange?: string; symbol?: string })
      .filter(
        (s): s is { exchange: 'NSE'; symbol: string } =>
          s.exchange === 'NSE' && !!s.symbol,
      );
    const now = new Date();
    const created = await this.articles.createFromSource(
      actor,
      {
        title: draft?.headline || item.title,
        subtitle: draft?.standfirst || undefined,
        summary: draft?.summary || undefined,
        content: draft ? draftDoc(draft) : null,
        categoryId: item.suggestedCategoryId ?? item.source.categoryId,
        stocks,
        sourceAttribution: [
          {
            name: credit.slice(0, 120),
            ...(item.url ? { url: item.url } : {}),
            ...(when ? { note: `Published ${when} IST` } : {}),
          },
        ],
        editorialNotes: notes,
        isAiGenerated: !!draft,
        sourceItemId: id,
      },
      async (tx, articleId) => {
        const claimed = await tx.newsSourceItem.updateMany({
          where: {
            id,
            status: {
              in: [
                NewsItemStatus.NEW,
                NewsItemStatus.DUPLICATE,
                NewsItemStatus.DISMISSED,
              ],
            },
          },
          data: {
            status: NewsItemStatus.DRAFTED,
            articleId,
            handledById: actor.staffId,
            handledAt: now,
          },
        });
        if (claimed.count === 0) {
          throw new ConflictException(
            'Someone else just started a story from this item.',
          );
        }
        if (dto.aiJobId) {
          await tx.aiJob.update({
            where: { id: dto.aiJobId },
            data: { articleId, appliedAt: now, appliedById: actor.staffId },
          });
        }
      },
      client,
    );
    await this.record(actor, 'news.item.draft', id, client, {
      articleId: created.id,
      aiDraft: !!draft,
    });
    return { articleId: created.id };
  }

  /** A tip or press release typed in by staff, checked like any incoming item. */
  async submit(actor: StaffPrincipal, dto: ManualItemDto, client: ClientInfo) {
    const source = dto.sourceId
      ? await this.prisma.newsSource.findUnique({ where: { id: dto.sourceId } })
      : await this.defaultManualSource();
    if (!source || source.format !== NewsSourceFormat.NONE) {
      throw new BadRequestException('Choose a manual source for this item.');
    }
    const url = dto.url?.trim() ? canonicalUrl(dto.url) : null;
    if (dto.url?.trim() && !url) {
      throw new BadRequestException(
        'The link must be a full web address (https://…).',
      );
    }
    const id = await this.ingest.addManual(source, {
      id: url,
      title: dto.title,
      url,
      publishedAt: dto.publishedAt ?? new Date().toISOString(),
      summary: dto.summary ?? null,
      content: null,
      author: null,
      categories: [],
    });
    if (!id) throw new ConflictException('This item was already submitted.');
    await this.record(actor, 'news.item.submit', id, client);
    return this.get(id);
  }

  private async defaultManualSource() {
    const existing = await this.prisma.newsSource.findFirst({
      where: { type: NewsSourceType.MANUAL },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.newsSource.create({
      data: {
        name: MANUAL_SOURCE_NAME,
        type: NewsSourceType.MANUAL,
        format: NewsSourceFormat.NONE,
        usage: NewsSourceUsage.SUMMARY,
        attribution: '',
      },
    });
  }

  /**
   * Stories and incoming items with a similar headline: duplicate detection
   * that works without the AI assistant.
   */
  async similar(actor: StaffPrincipal, articleId: string) {
    const access = await this.articles.loadAccess(articleId);
    if (!capabilities(access, actor).read)
      throw new NotFoundException('Article not found.');
    const tokens = titleTokens(access.title);
    const now = Date.now();
    const [stories, items] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where: {
          id: { not: articleId },
          updatedAt: { gte: new Date(now - 30 * DAY) },
          status: { notIn: [NewsStatus.CANCELLED, NewsStatus.REJECTED] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
        },
        take: 3000,
      }),
      has(actor, 'sources.read')
        ? this.prisma.newsSourceItem.findMany({
            where: {
              fetchedAt: { gte: new Date(now - 7 * DAY) },
              OR: [{ articleId: null }, { articleId: { not: articleId } }],
            },
            select: {
              id: true,
              title: true,
              titleKey: true,
              status: true,
              url: true,
              fetchedAt: true,
              source: { select: { name: true } },
            },
            take: 5000,
          })
        : Promise.resolve([]),
    ]);
    const score = (t: string[]) =>
      Math.round(headlineSimilarity(tokens, t) * 100) / 100;
    return {
      stories: stories
        .map((s) => ({ ...s, score: score(titleTokens(s.title)) }))
        .filter((s) => s.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
      items: items
        .map(({ titleKey, source, ...i }) => ({
          ...i,
          source: source.name,
          score: score(titleKey.split(' ').filter(Boolean)),
        }))
        .filter((i) => i.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8),
    };
  }

  private record(
    actor: StaffPrincipal,
    action: string,
    id: string,
    client: ClientInfo,
    meta?: Prisma.InputJsonValue,
  ) {
    return this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action,
      entityType: 'NewsSourceItem',
      entityId: id,
      ...(meta ? { meta } : {}),
      ...client,
    });
  }
}
