import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  NewsAssignmentStatus,
  NewsStatus,
  NewsVersionReason,
  Prisma,
} from '@prisma/client';
import { STORY_WRITING_TASKS } from '../../ai/ai-tasks';
import { AuditService } from '../../audit/audit.service';
import { CompanyDirectoryService } from '../../market/company-directory.service';
import { ScripMasterService } from '../../market/scrip-master.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import {
  ARTICLE_BASE,
  ArticleBlocksService,
  ReaderBlock,
} from '../content/article-blocks.service';
import {
  ContentError,
  DocWidget,
  normalizeDoc,
  PmNode,
  plainText,
  readingMinutes,
  renderHtml,
  safeHref,
} from '../content/article-content';
import { WidgetValidation } from '../content/widget-validation.service';
import { MediaService } from '../media/media.service';
import { NewsCache } from '../public/news-cache';
import { freeSlug, RESERVED_ARTICLE_SLUGS, slugify } from '../slug';
import { TaxonomyService } from '../taxonomy/taxonomy.service';
import { ArticleCapabilities, capabilities, has } from './article-access';
import { ArticleSnapshot, recordVersion } from './article-versions';
import { UpdateArticleDto } from './articles.dto';

export const STALE_VERSION =
  'Someone else saved this article after you opened it. Reload to get their changes, then make yours again.';

/// A background save records a version at most this often.
const AUTOSAVE_VERSION_EVERY_MS = 10 * 60_000;

export { ARTICLE_BASE };

const ACCESS_SELECT = {
  id: true,
  status: true,
  version: true,
  slug: true,
  title: true,
  createdById: true,
  firstPublishedAt: true,
  scheduledAt: true,
  summary: true,
  contentText: true,
  categoryId: true,
  correctionNote: true,
  assignments: { select: { assigneeId: true, role: true, status: true } },
} satisfies Prisma.NewsArticleSelect;
export type ArticleAccessRow = Prisma.NewsArticleGetPayload<{
  select: typeof ACCESS_SELECT;
}>;

const DETAIL_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, name: true, slug: true } },
  createdBy: { select: { id: true, displayName: true } },
  featuredImage: true,
  tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
  related: {
    orderBy: { position: 'asc' },
    include: {
      related: { select: { id: true, title: true, slug: true, status: true } },
    },
  },
  assignments: {
    orderBy: { createdAt: 'asc' },
    include: {
      assignee: { select: { id: true, displayName: true } },
      assignedBy: { select: { id: true, displayName: true } },
    },
  },
  reviews: {
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { reviewer: { select: { id: true, displayName: true } } },
  },
  stocks: {
    select: { exchange: true, symbol: true },
    orderBy: [{ isPrimary: 'desc' }, { symbol: 'asc' }],
  },
} satisfies Prisma.NewsArticleInclude;
type DetailRow = Prisma.NewsArticleGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

const LIST_SELECT = {
  id: true,
  slug: true,
  title: true,
  status: true,
  version: true,
  isFeatured: true,
  isBreaking: true,
  isAiGenerated: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  scheduledAt: true,
  category: { select: { id: true, name: true } },
  author: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true } },
  featuredImage: true,
  _count: { select: { comments: true } },
} satisfies Prisma.NewsArticleSelect;

type Scope = 'all' | 'mine' | 'assigned';

/** Articles: reading, saving, versions. Workflow moves live in ArticleWorkflowService. */
@Injectable()
export class ArticlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly taxonomy: TaxonomyService,
    private readonly scripMaster: ScripMasterService,
    private readonly directory: CompanyDirectoryService,
    private readonly cache: NewsCache,
    private readonly widgets: WidgetValidation,
    private readonly readerBlocks: ArticleBlocksService,
  ) {}

  // ── Reading ─────────────────────────────────────────────────────────

  /** Only what the person may see: everything with news.read_all, else own and assigned work. */
  private scopeWhere(
    actor: StaffPrincipal,
    scope: Scope,
  ): Prisma.NewsArticleWhereInput {
    const mine = { createdById: actor.staffId };
    const assigned = {
      assignments: {
        some: {
          assigneeId: actor.staffId,
          status: { not: NewsAssignmentStatus.CANCELLED },
        },
      },
    };
    if (scope === 'mine') return mine;
    if (scope === 'assigned') return assigned;
    return has(actor, 'news.read_all') ? {} : { OR: [mine, assigned] };
  }

  async list(
    actor: StaffPrincipal,
    q: {
      status?: NewsStatus;
      q?: string;
      categoryId?: string;
      scope?: Scope;
      cursor?: string;
      limit: number;
    },
  ) {
    // Published stories are public, so anyone in the newsroom may find them
    // (e.g. to link as related); everything else stays own/assigned scoped.
    const publicOnly =
      q.status === NewsStatus.PUBLISHED && (q.scope ?? 'all') === 'all';
    const and: Prisma.NewsArticleWhereInput[] = [
      publicOnly ? {} : this.scopeWhere(actor, q.scope ?? 'all'),
    ];
    if (q.status) and.push({ status: q.status });
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    const term = q.q?.trim();
    if (term) {
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { slug: { contains: slugify(term) || term } },
        ],
      });
    }
    const rows = await this.prisma.newsArticle.findMany({
      where: { AND: and },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: LIST_SELECT,
    });
    const more = rows.length > q.limit;
    const items = (more ? rows.slice(0, q.limit) : rows).map(
      ({ featuredImage, _count, ...r }) => ({
        ...r,
        thumbUrl: featuredImage
          ? this.media.view(featuredImage).thumbUrl
          : null,
        comments: _count.comments,
      }),
    );
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }

  /** How many articles are in each state, for the list's tabs. */
  async counts(actor: StaffPrincipal, scope: Scope = 'all') {
    const groups = await this.prisma.newsArticle.groupBy({
      by: ['status'],
      where: this.scopeWhere(actor, scope),
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      Object.values(NewsStatus).map((s) => [s, 0]),
    ) as Record<NewsStatus, number>;
    for (const g of groups) counts[g.status] = g._count._all;
    return {
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    };
  }

  async get(actor: StaffPrincipal, id: string) {
    const a = await this.prisma.newsArticle.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!a) throw new NotFoundException('Article not found.');
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    // The preview draws widgets live, from the same blocks readers get.
    const blocks = await this.readerBlocks.blocks(a.content, a, 'staff');
    return this.detailView(a, can, blocks);
  }

  async versions(actor: StaffPrincipal, id: string) {
    await this.loadReadable(actor, id);
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        version: number;
        reason: NewsVersionReason;
        createdAt: Date;
        editorId: string | null;
        title: string | null;
        words: number | null;
      }[]
    >`SELECT id, version, reason, "createdAt", "editorId",
             snapshot->>'title' AS title,
             CASE WHEN trim(coalesce(snapshot->>'contentText', '')) = '' THEN 0
                  ELSE array_length(regexp_split_to_array(trim(snapshot->>'contentText'), '\\s+'), 1)
             END AS words
        FROM news_versions WHERE "articleId" = ${id}::uuid
        ORDER BY version DESC LIMIT 300`;
    const editors = await this.staffNames(rows.map((r) => r.editorId));
    return rows.map((r) => ({
      id: r.id,
      version: r.version,
      reason: r.reason,
      createdAt: r.createdAt,
      title: r.title ?? '',
      words: r.words ?? 0,
      editor: r.editorId ? (editors.get(r.editorId) ?? null) : null,
    }));
  }

  async version(actor: StaffPrincipal, id: string, versionId: string) {
    await this.loadReadable(actor, id);
    const v = await this.prisma.newsVersion.findFirst({
      where: { id: versionId, articleId: id },
      include: { editor: { select: { id: true, displayName: true } } },
    });
    if (!v) throw new NotFoundException('Version not found.');
    const snap = v.snapshot as unknown as ArticleSnapshot;
    return {
      id: v.id,
      version: v.version,
      reason: v.reason,
      createdAt: v.createdAt,
      editor: v.editor,
      snapshot: snap,
    };
  }

  // ── Writing ─────────────────────────────────────────────────────────

  async create(
    actor: StaffPrincipal,
    dto: { title: string; categoryId?: string },
    client: ClientInfo,
  ) {
    const title = dto.title.trim();
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    const slug = await this.freeArticleSlug(slugify(title));
    const article = await this.prisma.$transaction(async (tx) => {
      const author = await this.taxonomy.authorForStaff(actor.staffId, tx);
      const created = await tx.newsArticle.create({
        data: {
          title,
          slug,
          status: NewsStatus.DRAFT,
          createdById: actor.staffId,
          authorId: author.id,
          categoryId: dto.categoryId ?? null,
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        },
      });
      await recordVersion(
        tx,
        created.id,
        NewsVersionReason.MANUAL,
        actor.staffId,
        {
          force: true,
        },
      );
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.create',
          entityType: 'NewsArticle',
          entityId: created.id,
          after: { title, slug },
          ...client,
        },
        tx,
      );
      return created;
    });
    return { id: article.id, slug: article.slug };
  }

  /**
   * A draft started from an incoming news item: the item's headline as a
   * working title, its link as the source credit, the companies it mentions
   * as related stocks and, when an AI draft was chosen, that draft as the
   * body. Always a DRAFT owned by the person who started it, so it goes
   * through review like any other story. `claim` runs in the same
   * transaction and must throw if the item was taken meanwhile.
   */
  async createFromSource(
    actor: StaffPrincipal,
    d: {
      title: string;
      subtitle?: string;
      summary?: string;
      content?: Record<string, unknown> | null;
      categoryId?: string | null;
      stocks: { exchange: 'NSE' | 'BSE'; symbol: string }[];
      sourceAttribution: { name: string; url?: string; note?: string }[];
      editorialNotes?: string;
      isAiGenerated: boolean;
      sourceItemId: string;
    },
    claim: (tx: Prisma.TransactionClient, articleId: string) => Promise<void>,
    client: ClientInfo,
  ) {
    const title =
      d.title.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Untitled story';
    let categoryId = d.categoryId ?? null;
    if (categoryId) {
      const exists = await this.prisma.newsCategory.count({
        where: { id: categoryId },
      });
      if (!exists) categoryId = null;
    }
    const rendered = d.content ? await this.renderContent(d.content) : null;
    // Suggested stocks: keep the ones the stock list still knows.
    const seen = new Set<string>();
    const stocks = d.stocks
      .flatMap((s) => {
        try {
          return this.resolveStocks([s]);
        } catch {
          return [];
        }
      })
      .filter(
        (s) =>
          !seen.has(`${s.exchange}:${s.symbol}`) &&
          seen.add(`${s.exchange}:${s.symbol}`),
      )
      .slice(0, 8);
    const slug = await this.freeArticleSlug(slugify(title));
    const article = await this.prisma.$transaction(async (tx) => {
      const author = await this.taxonomy.authorForStaff(actor.staffId, tx);
      const created = await tx.newsArticle.create({
        data: {
          title,
          slug,
          status: NewsStatus.DRAFT,
          createdById: actor.staffId,
          authorId: author.id,
          categoryId,
          subtitle: d.subtitle?.trim() || null,
          summary: d.summary?.trim() ?? '',
          content: (rendered?.doc ?? {
            type: 'doc',
            content: [{ type: 'paragraph' }],
          }) as unknown as Prisma.InputJsonValue,
          contentHtml: rendered?.html ?? '',
          contentText: rendered?.text ?? '',
          readingMinutes: rendered?.minutes ?? 1,
          sourceAttribution: d.sourceAttribution,
          editorialNotes: d.editorialNotes?.trim() || null,
          isAiGenerated: d.isAiGenerated,
        },
      });
      await claim(tx, created.id);
      if (stocks.length) {
        await tx.newsArticleStock.createMany({
          data: stocks.map((s, i) => ({
            articleId: created.id,
            ...s,
            isPrimary: i === 0,
          })),
        });
      }
      if (rendered?.widgets.length) {
        await this.indexWidgets(tx, created.id, rendered.widgets);
      }
      await recordVersion(
        tx,
        created.id,
        NewsVersionReason.MANUAL,
        actor.staffId,
        {
          force: true,
        },
      );
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.create',
          entityType: 'NewsArticle',
          entityId: created.id,
          after: { title, slug },
          meta: { fromSourceItem: d.sourceItemId, aiDraft: d.isAiGenerated },
          ...client,
        },
        tx,
      );
      return created;
    });
    return { id: article.id, slug: article.slug };
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: UpdateArticleDto,
    client: ClientInfo,
  ) {
    const a = await this.loadAccess(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    const CONTENT_FIELDS = [
      'title',
      'subtitle',
      'summary',
      'content',
      'categoryId',
      'tagIds',
      'authorId',
      'featuredImageId',
      'featuredImageCaption',
      'sectors',
      'relatedIds',
      'stocks',
      'sourceAttribution',
      'editorialNotes',
      'isAiGenerated',
    ] as const;
    const changed = CONTENT_FIELDS.filter((f) => dto[f] !== undefined);
    const seoChanged = dto.seo !== undefined || dto.slug !== undefined;
    if (changed.length && !can.edit) {
      throw new ForbiddenException(this.lockedMessage(a.status, actor));
    }
    if (seoChanged && !can.editSeo) {
      throw new ForbiddenException(this.lockedMessage(a.status, actor));
    }

    const data: Prisma.NewsArticleUncheckedUpdateManyInput = {};
    let widgets: DocWidget[] | undefined;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.subtitle !== undefined) data.subtitle = dto.subtitle.trim() || null;
    if (dto.summary !== undefined) data.summary = dto.summary.trim();
    if (dto.content !== undefined) {
      const r = await this.renderContent(dto.content);
      data.content = r.doc as unknown as Prisma.InputJsonValue;
      data.contentHtml = r.html;
      data.contentText = r.text;
      data.readingMinutes = r.minutes;
      widgets = r.widgets;
    }
    if (dto.categoryId !== undefined) {
      if (dto.categoryId) await this.assertCategory(dto.categoryId);
      data.categoryId = dto.categoryId;
    }
    if (dto.authorId !== undefined) {
      if (dto.authorId) {
        const author = await this.prisma.newsAuthor.findUnique({
          where: { id: dto.authorId },
        });
        if (!author)
          throw new BadRequestException('That byline no longer exists.');
      }
      data.authorId = dto.authorId;
    }
    if (dto.featuredImageId !== undefined) {
      if (dto.featuredImageId)
        await this.media.requireReady(dto.featuredImageId);
      data.featuredImageId = dto.featuredImageId;
    }
    if (dto.featuredImageCaption !== undefined) {
      data.featuredImageCaption = dto.featuredImageCaption.trim() || null;
    }
    if (dto.sectors !== undefined) {
      data.sectors = [
        ...new Set(dto.sectors.map((s) => s.trim()).filter(Boolean)),
      ];
    }
    if (dto.sourceAttribution !== undefined) {
      data.sourceAttribution = dto.sourceAttribution.map((s) => {
        const url = s.url?.trim() ? safeHref(s.url) : null;
        if (s.url?.trim() && (!url || !/^https?:/.test(url))) {
          throw new BadRequestException(
            `"${s.name}": source links must be full web addresses.`,
          );
        }
        return {
          name: s.name.trim(),
          ...(url ? { url } : {}),
          ...(s.note?.trim() ? { note: s.note.trim() } : {}),
        };
      });
    }
    if (dto.editorialNotes !== undefined) {
      data.editorialNotes = dto.editorialNotes.trim() || null;
    }
    if (dto.isAiGenerated === false) {
      // Readers are told when AI helped write a story: once AI-written text
      // has been used here, the label stays.
      const used = await this.prisma.aiJob.count({
        where: {
          articleId: id,
          appliedAt: { not: null },
          task: { in: STORY_WRITING_TASKS },
        },
      });
      if (used > 0) {
        throw new BadRequestException(
          'AI-written text was used in this story, so it keeps its AI-assisted label.',
        );
      }
    }
    if (dto.isAiGenerated !== undefined) data.isAiGenerated = dto.isAiGenerated;
    if (dto.seo !== undefined) {
      const current = await this.prisma.newsArticle.findUniqueOrThrow({
        where: { id },
        select: { seo: true },
      });
      data.seo = await this.cleanSeo(dto.seo, current.seo);
    }
    if (dto.slug !== undefined && dto.slug !== a.slug) {
      if (RESERVED_ARTICLE_SLUGS.has(dto.slug)) {
        throw new BadRequestException(
          'That web address belongs to a section of the news site. Pick another.',
        );
      }
      if (a.firstPublishedAt) {
        throw new BadRequestException(
          "The web address can't change once an article has been published.",
        );
      }
      const clash = await this.prisma.newsArticle.findFirst({
        where: { slug: dto.slug, id: { not: id } },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException(
          'Another article already uses that web address.',
        );
      }
      data.slug = dto.slug;
    }
    if (dto.tagIds !== undefined) {
      const found = await this.prisma.newsTag.count({
        where: { id: { in: dto.tagIds } },
      });
      if (found !== new Set(dto.tagIds).size) {
        throw new BadRequestException('One of the tags no longer exists.');
      }
    }
    if (dto.relatedIds !== undefined) {
      const ids = [...new Set(dto.relatedIds)].filter((r) => r !== id);
      const found = await this.prisma.newsArticle.count({
        where: { id: { in: ids } },
      });
      if (found !== ids.length) {
        throw new BadRequestException(
          'One of the related articles no longer exists.',
        );
      }
    }
    const stocks =
      dto.stocks !== undefined ? this.resolveStocks(dto.stocks) : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const res = await tx.newsArticle.updateMany({
        where: { id, version: dto.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (res.count === 0) throw new ConflictException(STALE_VERSION);
      if (dto.tagIds !== undefined) {
        await tx.newsArticleTag.deleteMany({ where: { articleId: id } });
        await tx.newsArticleTag.createMany({
          data: [...new Set(dto.tagIds)].map((tagId) => ({
            articleId: id,
            tagId,
          })),
        });
      }
      if (dto.relatedIds !== undefined) {
        await tx.newsRelatedArticle.deleteMany({ where: { articleId: id } });
        await tx.newsRelatedArticle.createMany({
          data: [...new Set(dto.relatedIds)]
            .filter((r) => r !== id)
            .map((relatedId, position) => ({
              articleId: id,
              relatedId,
              position,
            })),
        });
      }
      if (stocks !== undefined) {
        await tx.newsArticleStock.deleteMany({ where: { articleId: id } });
        await tx.newsArticleStock.createMany({
          data: stocks.map((s, i) => ({
            articleId: id,
            ...s,
            isPrimary: i === 0,
          })),
        });
      }
      if (widgets !== undefined) await this.indexWidgets(tx, id, widgets);
      let recorded = false;
      if (dto.autosave) {
        const last = await tx.newsVersion.findFirst({
          where: { articleId: id },
          orderBy: { version: 'desc' },
          select: { createdAt: true },
        });
        if (
          !last ||
          Date.now() - last.createdAt.getTime() >= AUTOSAVE_VERSION_EVERY_MS
        ) {
          recorded = await recordVersion(
            tx,
            id,
            NewsVersionReason.AUTOSAVE,
            actor.staffId,
          );
        }
      } else {
        recorded = await recordVersion(
          tx,
          id,
          NewsVersionReason.MANUAL,
          actor.staffId,
        );
      }
      // Every explicit save is audited; keystroke autosaves only when they
      // also record a version, so the log stays readable.
      if (!dto.autosave || recorded) {
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'news.article.update',
            entityType: 'NewsArticle',
            entityId: id,
            meta: {
              fields: [...changed, ...(seoChanged ? ['seo'] : [])],
              autosave: !!dto.autosave,
              version: dto.version + 1,
            },
            ...client,
          },
          tx,
        );
      }
      return tx.newsArticle.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          version: true,
          status: true,
          slug: true,
          updatedAt: true,
          readingMinutes: true,
        },
      });
    });
    // Editors may change a live story: readers get the new text right away.
    if (result.status === NewsStatus.PUBLISHED) {
      await this.cache.invalidate('article');
    }
    return result;
  }

  /** Puts an older version's text and details back (as a new version). */
  async restore(
    actor: StaffPrincipal,
    id: string,
    versionId: string,
    expected: number,
    client: ClientInfo,
  ) {
    const a = await this.loadAccess(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!can.edit)
      throw new ForbiddenException(this.lockedMessage(a.status, actor));
    const v = await this.prisma.newsVersion.findFirst({
      where: { id: versionId, articleId: id },
    });
    if (!v) throw new NotFoundException('Version not found.');
    const snap = v.snapshot as unknown as ArticleSnapshot;
    const r = await this.renderContent(snap.content);
    // Anything deleted since that version is left empty rather than failing.
    const category = snap.categoryId
      ? await this.prisma.newsCategory.findUnique({
          where: { id: snap.categoryId },
          select: { id: true },
        })
      : null;
    const author = snap.authorId
      ? await this.prisma.newsAuthor.findUnique({
          where: { id: snap.authorId },
          select: { id: true },
        })
      : null;
    const featured = snap.featuredImageId
      ? await this.prisma.mediaAsset.findFirst({
          where: { id: snap.featuredImageId, status: 'READY' },
          select: { id: true },
        })
      : null;
    const tagIds = (
      await this.prisma.newsTag.findMany({
        where: { id: { in: snap.tagIds ?? [] } },
        select: { id: true },
      })
    ).map((t) => t.id);
    const relatedIds = (
      await this.prisma.newsArticle.findMany({
        where: { id: { in: (snap.relatedIds ?? []).filter((x) => x !== id) } },
        select: { id: true },
      })
    ).map((x) => x.id);

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.newsArticle.updateMany({
        where: { id, version: expected },
        data: {
          title: snap.title,
          subtitle: snap.subtitle,
          summary: snap.summary,
          content: r.doc as unknown as Prisma.InputJsonValue,
          contentHtml: r.html,
          contentText: r.text,
          readingMinutes: r.minutes,
          categoryId: category?.id ?? null,
          authorId: author?.id ?? null,
          featuredImageId: featured?.id ?? null,
          featuredImageCaption: snap.featuredImageCaption,
          sectors: snap.sectors ?? [],
          seo: snap.seo ?? {},
          sourceAttribution: snap.sourceAttribution ?? [],
          isAiGenerated: snap.isAiGenerated ?? false,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw new ConflictException(STALE_VERSION);
      await tx.newsArticleTag.deleteMany({ where: { articleId: id } });
      await tx.newsArticleTag.createMany({
        data: tagIds.map((tagId) => ({ articleId: id, tagId })),
      });
      await tx.newsRelatedArticle.deleteMany({ where: { articleId: id } });
      await tx.newsRelatedArticle.createMany({
        data: relatedIds.map((relatedId, position) => ({
          articleId: id,
          relatedId,
          position,
        })),
      });
      await this.indexWidgets(tx, id, r.widgets);
      // Versions saved before stocks existed leave them as they are.
      if (snap.stocks) {
        await tx.newsArticleStock.deleteMany({ where: { articleId: id } });
        await tx.newsArticleStock.createMany({
          data: snap.stocks.map((s, i) => ({
            articleId: id,
            exchange: s.exchange,
            symbol: s.symbol,
            isPrimary: i === 0,
          })),
        });
      }
      await recordVersion(tx, id, NewsVersionReason.RESTORE, actor.staffId, {
        force: true,
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.restore',
          entityType: 'NewsArticle',
          entityId: id,
          meta: { fromVersion: v.version },
          ...client,
        },
        tx,
      );
    });
    if (a.status === NewsStatus.PUBLISHED) {
      await this.cache.invalidate('article');
    }
    return this.get(actor, id);
  }

  /** Never-published articles only; published ones are archived instead. */
  async remove(
    actor: StaffPrincipal,
    id: string,
    expected: number,
    client: ClientInfo,
  ) {
    const a = await this.loadAccess(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!can.delete) {
      throw new ForbiddenException(
        a.firstPublishedAt
          ? 'Articles that have been published are archived, not deleted.'
          : "You can't delete this article.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.newsArticle.deleteMany({
        where: { id, version: expected },
      });
      if (res.count === 0) throw new ConflictException(STALE_VERSION);
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.delete',
          entityType: 'NewsArticle',
          entityId: id,
          before: { title: a.title, slug: a.slug, status: a.status },
          ...client,
        },
        tx,
      );
    });
  }

  // ── Shared with the workflow ────────────────────────────────────────

  async loadAccess(id: string): Promise<ArticleAccessRow> {
    const a = await this.prisma.newsArticle.findUnique({
      where: { id },
      select: ACCESS_SELECT,
    });
    if (!a) throw new NotFoundException('Article not found.');
    return a;
  }

  /** Why the editor is read-only right now, in words a writer understands. */
  lockedMessage(status: NewsStatus, actor: StaffPrincipal): string {
    const editor = has(actor, 'news.update_all');
    switch (status) {
      case NewsStatus.IN_REVIEW:
        return 'This article is with the editors. Withdraw it from review to make changes.';
      case NewsStatus.APPROVED:
      case NewsStatus.SCHEDULED:
        return 'This article has been approved. Ask an editor if it needs changes.';
      case NewsStatus.PUBLISHED:
        return editor
          ? "You can't edit this article."
          : 'Published articles can only be changed by editors.';
      case NewsStatus.REJECTED:
      case NewsStatus.CANCELLED:
      case NewsStatus.ARCHIVED:
        return 'Reopen this article as a draft to edit it.';
      default:
        return 'You can only edit your own articles and work assigned to you.';
    }
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async loadReadable(actor: StaffPrincipal, id: string) {
    const a = await this.loadAccess(id);
    if (!capabilities(a, actor).read)
      throw new NotFoundException('Article not found.');
    return a;
  }

  /**
   * Validates a body against the allowlist, resolves its images and related
   * articles, and renders the reader HTML.
   */
  private async renderContent(raw: unknown) {
    let normalized: ReturnType<typeof normalizeDoc>;
    try {
      normalized = normalizeDoc(raw);
    } catch (err) {
      if (err instanceof ContentError)
        throw new BadRequestException(err.message);
      throw err;
    }
    await this.widgets.check(normalized.widgets);
    const media = await this.media.renderMap(normalized.mediaIds);
    const relatedRows = normalized.relatedIds.length
      ? await this.prisma.newsArticle.findMany({
          where: { id: { in: normalized.relatedIds } },
          select: { id: true, title: true, slug: true },
        })
      : [];
    if (relatedRows.length !== normalized.relatedIds.length) {
      throw new BadRequestException(
        'A related-article block points to an article that no longer exists.',
      );
    }
    const related = new Map(
      relatedRows.map((r) => [r.id, { title: r.title, slug: r.slug }]),
    );
    // The stored document carries canonical image URLs and related titles
    // for the editor and the app, whatever the client sent.
    const fill = (n: PmNode) => {
      if (n.type === 'image') {
        n.attrs = {
          ...n.attrs,
          src: media.get(String(n.attrs?.mediaId))?.url ?? '',
        };
      } else if (n.type === 'relatedArticle') {
        const rel = related.get(String(n.attrs?.articleId));
        n.attrs = {
          ...n.attrs,
          title: rel?.title ?? '',
          slug: rel?.slug ?? '',
        };
      }
      n.content?.forEach(fill);
    };
    fill(normalized.doc);
    const html = renderHtml(normalized.doc, {
      media,
      related,
      articleBase: ARTICLE_BASE,
    });
    const text = plainText(normalized.doc);
    return {
      doc: normalized.doc,
      html,
      text,
      minutes: readingMinutes(text),
      widgets: normalized.widgets,
    };
  }

  /**
   * Rebuilds the article's widget index: which saved widgets it uses, and
   * which stocks its widgets quote (the public quote allowlist reads this).
   */
  private async indexWidgets(
    tx: Prisma.TransactionClient,
    articleId: string,
    widgets: DocWidget[],
  ) {
    await tx.newsWidgetInstance.deleteMany({ where: { articleId } });
    if (widgets.length === 0) return;
    await tx.newsWidgetInstance.createMany({
      data: widgets.map((w) => ({
        articleId,
        position: w.position,
        type: w.widget,
        version: w.v,
        widgetId: w.widgetId ?? null,
        symbols: this.widgets.symbolsOf(w),
      })),
    });
  }

  private async cleanSeo(
    seo: NonNullable<UpdateArticleDto['seo']>,
    current: Prisma.JsonValue,
  ): Promise<Prisma.InputJsonValue> {
    const next = { ...((current ?? {}) as Record<string, unknown>) };
    if (seo.title !== undefined) next.title = seo.title.trim();
    if (seo.description !== undefined)
      next.description = seo.description.trim();
    if (seo.canonicalUrl !== undefined) {
      const raw = seo.canonicalUrl.trim();
      if (raw) {
        const safe = safeHref(raw);
        if (!safe || !/^https?:/.test(safe)) {
          throw new BadRequestException(
            'The canonical URL must be a full https:// address.',
          );
        }
        next.canonicalUrl = safe;
      } else {
        delete next.canonicalUrl;
      }
    }
    if (seo.noIndex !== undefined) next.noIndex = seo.noIndex;
    if (seo.noFollow !== undefined) next.noFollow = seo.noFollow;
    if (seo.ogImageId !== undefined) {
      if (seo.ogImageId) {
        await this.media.requireReady(seo.ogImageId);
        next.ogImageId = seo.ogImageId;
      } else {
        delete next.ogImageId;
      }
    }
    return next as Prisma.InputJsonValue;
  }

  private async assertCategory(id: string) {
    const c = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!c) throw new BadRequestException('That category no longer exists.');
  }

  private freeArticleSlug(base: string) {
    return freeSlug(
      base,
      async (s) =>
        RESERVED_ARTICLE_SLUGS.has(s) ||
        !!(await this.prisma.newsArticle.findUnique({
          where: { slug: s },
          select: { id: true },
        })),
    );
  }

  /**
   * Checks each company against the exchange's list and returns canonical
   * tickers, main company first, without repeats.
   */
  private resolveStocks(list: { exchange: 'NSE' | 'BSE'; symbol: string }[]) {
    if (!list.length) return [];
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(
        'The stock list is still loading. Try again in a minute.',
      );
    }
    const seen = new Set<string>();
    const out: { exchange: string; symbol: string }[] = [];
    for (const s of list) {
      const inst = this.scripMaster.getEquity(s.symbol, s.exchange);
      if (!inst) {
        throw new BadRequestException(
          `${s.symbol.toUpperCase()} isn't a listed ${s.exchange} stock.`,
        );
      }
      const key = `${s.exchange}:${inst.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ exchange: s.exchange, symbol: inst.name });
    }
    return out;
  }

  private async staffNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = unique.length
      ? await this.prisma.staffProfile.findMany({
          where: { id: { in: unique } },
          select: { id: true, displayName: true },
        })
      : [];
    return new Map(rows.map((r) => [r.id, r]));
  }

  private detailView(
    a: DetailRow,
    can: ArticleCapabilities,
    blocks: ReaderBlock[],
  ) {
    const featured = a.featuredImage ? this.media.view(a.featuredImage) : null;
    return {
      id: a.id,
      slug: a.slug,
      title: a.title,
      subtitle: a.subtitle,
      summary: a.summary,
      content: a.content,
      contentHtml: a.contentHtml,
      blocks,
      readingMinutes: a.readingMinutes,
      status: a.status,
      version: a.version,
      category: a.category,
      author: a.author,
      createdBy: a.createdBy,
      tags: a.tags.map((t) => t.tag),
      featuredImage: featured,
      featuredImageCaption: a.featuredImageCaption,
      sectors: a.sectors,
      isFeatured: a.isFeatured,
      isBreaking: a.isBreaking,
      isAiGenerated: a.isAiGenerated,
      seo: a.seo,
      sourceAttribution: a.sourceAttribution,
      editorialNotes: a.editorialNotes,
      correctionNote: a.correctionNote,
      retractedAt: a.retractedAt,
      retractionNote: a.retractionNote,
      related: a.related.map((r) => r.related),
      stocks: a.stocks.map((s) => ({
        ...s,
        name: this.directory.nameFor(s.symbol),
      })),
      scheduledAt: a.scheduledAt,
      publishedAt: a.publishedAt,
      firstPublishedAt: a.firstPublishedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      assignments: a.assignments.map((x) => ({
        id: x.id,
        role: x.role,
        status: x.status,
        note: x.note,
        dueAt: x.dueAt,
        assignee: x.assignee,
        assignedBy: x.assignedBy,
        createdAt: x.createdAt,
      })),
      reviews: a.reviews.map((r) => ({
        id: r.id,
        decision: r.decision,
        comment: r.comment,
        version: r.version,
        reviewer: r.reviewer,
        createdAt: r.createdAt,
      })),
      can,
    };
  }
}
