import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiJob,
  AiJobStatus,
  AiTask,
  NewsItemStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { enforceRateLimit } from '../common/rate-limit';
import { titleTokens } from '../ingestion/text';
import { capabilities, has } from '../newsroom/articles/article-access';
import { ArticlesService } from '../newsroom/articles/articles.service';
import { NewsCache } from '../newsroom/public/news-cache';
import { LISTED_SQL, listedWhere } from '../newsroom/public/public-articles';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { draftBlocked, draftInput, materialFromItem } from './ai-inputs';
import { AiQueue } from './ai-queue';
import { AiSettingsService } from './ai-settings.service';
import {
  ARTICLE_CHARS_LIMIT,
  ArticleInput,
  clipText,
  TASK_ORDER,
  taskDef,
} from './ai-tasks';
import type { CreateAiJobDto, ListAiJobsQuery } from './ai.dto';

/** Tasks that only read the story; anyone who can open it may run them. */
const READ_TASKS = new Set<AiTask>([AiTask.REVIEW, AiTask.RELATED_ARTICLES]);
const PAGE_SIZE = 25;
/** Requests per person per minute, on top of the daily cap. */
const BURST_PER_MINUTE = 12;

const ITEM_FOR_AI = {
  id: true,
  title: true,
  summary: true,
  content: true,
  publishedAt: true,
  url: true,
  usage: true,
  allowAiDrafts: true,
  attribution: true,
  stocks: true,
  status: true,
  source: { select: { name: true } },
} satisfies Prisma.NewsSourceItemSelect;

const JOB_INCLUDE = {
  requestedBy: { select: { id: true, displayName: true } },
  article: { select: { id: true, title: true } },
  sourceItem: { select: { id: true, title: true } },
} satisfies Prisma.AiJobInclude;
type JobRow = Prisma.AiJobGetPayload<{ include: typeof JOB_INCLUDE }>;

/** Midnight in India, today. */
function istMidnight(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) -
      330 * 60_000,
  );
}

/**
 * AI requests from the portal. Every request is checked here, not in the
 * browser: the assistant must be on, the tool enabled, the budget and the
 * person's daily allowance not spent, and the person allowed to work on the
 * story. Inputs are taken from the database, never from the request body.
 */
@Injectable()
export class AiJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly queue: AiQueue,
    private readonly audit: AuditService,
    private readonly articles: ArticlesService,
    private readonly redis: RedisService,
    private readonly cache: NewsCache,
  ) {}

  async status(actor: StaffPrincipal) {
    const [s, ready, mineToday, spend] = await Promise.all([
      this.settings.row(),
      this.settings.readiness(),
      this.prisma.aiJob.count({
        where: {
          requestedById: actor.staffId,
          createdAt: { gte: istMidnight() },
        },
      }),
      this.settings.monthSpend(),
    ]);
    return {
      enabled: s.enabled,
      ready: ready.ok,
      reason: ready.ok ? null : ready.reason,
      provider: s.provider
        ? {
            name: s.provider.name,
            kind: s.provider.kind,
            model: s.provider.model,
          }
        : null,
      tasks: TASK_ORDER.map((task) => ({
        task,
        label: taskDef(task).label,
        enabled: !s.disabledTasks.includes(task),
      })),
      autoDraft: s.autoDraft,
      usage: {
        mineToday,
        dailyLimit: s.dailyJobsPerUser,
        monthSpendUsd: spend,
        monthlyBudgetUsd: s.monthlyBudgetUsd,
      },
    };
  }

  async create(actor: StaffPrincipal, dto: CreateAiJobDto, client: ClientInfo) {
    const ready = await this.settings.readiness();
    if (!ready.ok) {
      throw new ConflictException({ message: ready.reason, code: 'ai_off' });
    }
    if (ready.disabledTasks.includes(dto.task)) {
      throw new ForbiddenException(
        'This AI tool is switched off for the newsroom.',
      );
    }
    const built = await this.buildInput(actor, dto);

    if (
      ready.monthlyBudgetUsd != null &&
      (await this.settings.monthSpend()) >= ready.monthlyBudgetUsd
    ) {
      throw new HttpException(
        'This month’s AI budget has been used. A Super Admin can raise it on the AI assistant page.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const today = await this.prisma.aiJob.count({
      where: {
        requestedById: actor.staffId,
        createdAt: { gte: istMidnight() },
      },
    });
    if (today >= ready.dailyJobsPerUser) {
      throw new HttpException(
        `You’ve used today’s ${ready.dailyJobsPerUser} AI requests. The allowance resets at midnight.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await enforceRateLimit(
      this.redis.client,
      `rl:ai:${actor.staffId}`,
      BURST_PER_MINUTE,
      60,
      'That’s a lot of AI requests at once. Wait a minute and try again.',
    );

    // The same request is already on its way: return it rather than pay twice.
    const inflight = await this.prisma.aiJob.findFirst({
      where: {
        task: dto.task,
        requestedById: actor.staffId,
        articleId: built.articleId,
        sourceItemId: built.sourceItemId,
        status: { in: [AiJobStatus.QUEUED, AiJobStatus.RUNNING] },
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
      include: JOB_INCLUDE,
    });
    if (inflight && sameRequest(inflight.input, built.input)) {
      return this.view(inflight, actor);
    }

    const def = taskDef(dto.task);
    const job = await this.prisma.aiJob.create({
      data: {
        task: dto.task,
        promptId: def.promptId,
        promptVersion: def.version,
        input: built.input as Prisma.InputJsonValue,
        requestedById: actor.staffId,
        articleId: built.articleId,
        sourceItemId: built.sourceItemId,
      },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.job.create',
      entityType: 'AiJob',
      entityId: job.id,
      meta: {
        task: dto.task,
        articleId: built.articleId,
        sourceItemId: built.sourceItemId,
      },
      ...client,
    });
    await this.queue.enqueue(job.id);
    return this.view(job, actor);
  }

  private async buildInput(
    actor: StaffPrincipal,
    dto: CreateAiJobDto,
  ): Promise<{
    input: Record<string, unknown>;
    articleId: string | null;
    sourceItemId: string | null;
  }> {
    const now = new Date().toISOString();
    if (dto.task === AiTask.DRAFT_FROM_SOURCE) {
      if (!dto.sourceItemId)
        throw new BadRequestException('Choose an incoming item.');
      if (!has(actor, 'sources.read') || !has(actor, 'news.create')) {
        throw new ForbiddenException(
          'Drafting from incoming news needs the sources.read and news.create permissions.',
        );
      }
      const item = await this.prisma.newsSourceItem.findUnique({
        where: { id: dto.sourceItemId },
        select: ITEM_FOR_AI,
      });
      if (!item)
        throw new NotFoundException(
          'That item is no longer in the incoming list.',
        );
      if (item.status === NewsItemStatus.DRAFTED) {
        throw new ConflictException(
          'A story was already started from this item.',
        );
      }
      const blocked = draftBlocked(item);
      if (blocked) throw new ForbiddenException(blocked);
      return {
        input: draftInput(item) as unknown as Record<string, unknown>,
        articleId: null,
        sourceItemId: item.id,
      };
    }

    if (!dto.articleId) throw new BadRequestException('Open a story first.');
    const access = await this.articles.loadAccess(dto.articleId);
    const can = capabilities(access, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    const allowed = READ_TASKS.has(dto.task)
      ? true
      : dto.task === AiTask.SEO
        ? can.edit || can.editSeo
        : can.edit;
    if (!allowed) {
      throw new ForbiddenException(
        'You can’t change this story right now, so AI suggestions for it aren’t available.',
      );
    }
    const a = await this.prisma.newsArticle.findUniqueOrThrow({
      where: { id: dto.articleId },
      select: {
        id: true,
        title: true,
        subtitle: true,
        summary: true,
        contentText: true,
        categoryId: true,
        sourceItems: { select: ITEM_FOR_AI, take: 3 },
      },
    });
    const article: ArticleInput = {
      title: a.title,
      subtitle: a.subtitle ?? '',
      summary: a.summary,
      text: clipText(a.contentText, ARTICLE_CHARS_LIMIT),
    };
    const sources = a.sourceItems.map((i) => materialFromItem(i));
    const base = { now, article, sources };
    const ids = { articleId: a.id, sourceItemId: null };

    switch (dto.task) {
      case AiTask.DRAFT_FROM_NOTES: {
        const notes = dto.notes?.trim() ?? '';
        if (notes.length < 30) {
          throw new BadRequestException(
            'Paste your notes first: the facts, figures and quotes the story should use.',
          );
        }
        return { input: { now, notes, article }, ...ids };
      }
      case AiTask.REWRITE_SECTION: {
        const passage = dto.passage?.trim() ?? '';
        if (passage.length < 20) {
          throw new BadRequestException(
            'Select the passage to rewrite in the story.',
          );
        }
        return {
          input: {
            ...base,
            passage,
            instruction: dto.instruction?.trim() ?? '',
          },
          ...ids,
        };
      }
      default:
        break;
    }
    if (a.contentText.trim().length < 80) {
      throw new BadRequestException(
        'Write a little of the story first: the assistant works from what’s there.',
      );
    }
    if (dto.task === AiTask.TAXONOMY) {
      const [categories, tags] = await Promise.all([
        this.prisma.newsCategory.findMany({
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true },
          take: 100,
        }),
        this.prisma.newsTag.findMany({
          orderBy: { name: 'asc' },
          select: { id: true, name: true },
          take: 200,
        }),
      ]);
      return { input: { ...base, categories, tags }, ...ids };
    }
    if (dto.task === AiTask.RELATED_ARTICLES) {
      const candidates = await this.candidates(
        a.id,
        `${a.title} ${a.summary}`,
        a.categoryId,
      );
      if (candidates.length === 0) {
        throw new BadRequestException(
          'There are no published stories to link to yet.',
        );
      }
      return { input: { ...base, candidates }, ...ids };
    }
    return { input: base, ...ids };
  }

  /** Published stories that share words with this one (the public visibility rule applies). */
  private async candidates(
    id: string,
    text: string,
    categoryId: string | null,
  ) {
    const words = titleTokens(text)
      .filter((w) => !/^\d/.test(w) && w.length > 2)
      .slice(0, 12);
    type Row = {
      id: string;
      slug: string;
      title: string;
      summary: string;
      publishedAt: Date | null;
    };
    let rows: Row[] = [];
    if (words.length) {
      const q = words.join(' | ');
      rows = await this.prisma.$queryRaw<Row[]>`
        SELECT a.id, a.slug, a.title, a.summary, a."publishedAt"
        FROM news_articles a
        WHERE ${LISTED_SQL} AND a.id <> ${id}::uuid
          AND a."searchVector" @@ to_tsquery('english', ${q})
        ORDER BY ts_rank(a."searchVector", to_tsquery('english', ${q})) DESC,
                 a."publishedAt" DESC
        LIMIT 15`;
    }
    if (rows.length < 5) {
      const more = await this.prisma.newsArticle.findMany({
        where: {
          ...listedWhere(),
          id: { notIn: [id, ...rows.map((r) => r.id)] },
          ...(categoryId ? { categoryId } : {}),
        },
        orderBy: { publishedAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          summary: true,
          publishedAt: true,
        },
        take: 10,
      });
      rows = [...rows, ...more];
    }
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary.slice(0, 240),
      publishedAt: r.publishedAt?.toISOString() ?? null,
    }));
  }

  private async canSee(actor: StaffPrincipal, job: AiJob): Promise<boolean> {
    if (job.requestedById === actor.staffId || has(actor, 'ai.configure')) {
      return true;
    }
    if (job.articleId) {
      const access = await this.articles
        .loadAccess(job.articleId)
        .catch(() => null);
      return !!access && capabilities(access, actor).read;
    }
    return job.sourceItemId !== null && has(actor, 'sources.read');
  }

  async get(actor: StaffPrincipal, id: string) {
    const job = await this.prisma.aiJob.findUnique({
      where: { id },
      include: JOB_INCLUDE,
    });
    if (!job || !(await this.canSee(actor, job))) {
      throw new NotFoundException('That AI request no longer exists.');
    }
    return this.view(job, actor);
  }

  async list(actor: StaffPrincipal, q: ListAiJobsQuery) {
    const where: Prisma.AiJobWhereInput = {};
    if (q.articleId) {
      const access = await this.articles.loadAccess(q.articleId);
      if (!capabilities(access, actor).read) {
        throw new NotFoundException('Article not found.');
      }
      where.articleId = q.articleId;
    } else if (q.scope === 'all') {
      if (!has(actor, 'ai.configure')) {
        throw new ForbiddenException(
          'The full AI history needs the ai.configure permission.',
        );
      }
    } else {
      where.requestedById = actor.staffId;
    }
    if (q.task) where.task = q.task;
    if (q.status) where.status = q.status;
    const page = q.page ?? 1;
    const [rows, total] = await Promise.all([
      this.prisma.aiJob.findMany({
        where,
        include: JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.aiJob.count({ where }),
    ]);
    return {
      items: rows.map((r) => this.view(r, actor, false)),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }

  /** Records that a person used a result; story-writing results label the story AI-assisted. */
  async applied(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const job = await this.prisma.aiJob.findUnique({
      where: { id },
      include: JOB_INCLUDE,
    });
    if (!job || !(await this.canSee(actor, job))) {
      throw new NotFoundException('That AI request no longer exists.');
    }
    if (job.status !== AiJobStatus.SUCCEEDED) {
      throw new ConflictException('Only a finished AI result can be used.');
    }
    if (job.articleId && taskDef(job.task).writesStory) {
      const access = await this.articles.loadAccess(job.articleId);
      if (!capabilities(access, actor).edit) {
        throw new ForbiddenException('You can’t change this story right now.');
      }
      const flagged = await this.prisma.newsArticle.updateMany({
        where: { id: job.articleId, isAiGenerated: false },
        data: { isAiGenerated: true },
      });
      if (flagged.count && access.status === 'PUBLISHED') {
        await this.cache.invalidate('ai-assisted label');
      }
    }
    const updated = await this.prisma.aiJob.update({
      where: { id },
      data: {
        appliedAt: job.appliedAt ?? new Date(),
        appliedById: job.appliedById ?? actor.staffId,
      },
      include: JOB_INCLUDE,
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'ai.job.applied',
      entityType: 'AiJob',
      entityId: id,
      meta: { task: job.task, articleId: job.articleId },
      ...client,
    });
    return this.view(updated, actor);
  }

  view(job: JobRow, actor: StaffPrincipal, detail = true) {
    const own = job.requestedById === actor.staffId;
    return {
      id: job.id,
      task: job.task,
      label: taskDef(job.task).label,
      status: job.status,
      output: job.output,
      checks: job.checks,
      error: job.error,
      provider: job.providerKind,
      model: job.model,
      promptVersion: job.promptVersion,
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      costUsd: job.costUsd,
      durationMs: job.durationMs,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      appliedAt: job.appliedAt,
      requestedBy: job.requestedBy,
      automatic: job.requestedById === null,
      article: job.article,
      sourceItem: job.sourceItem,
      // What was sent to the provider: for the requester and AI admins.
      input:
        detail && (own || has(actor, 'ai.configure')) ? job.input : undefined,
    };
  }
}

/** JSON with object keys sorted: Postgres JSONB doesn't keep key order. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

function sameRequest(a: Prisma.JsonValue, b: Record<string, unknown>): boolean {
  // Everything but the request time.
  const strip = (v: unknown) =>
    stable({ ...((v ?? {}) as Record<string, unknown>), now: null });
  return strip(a) === strip(b);
}
