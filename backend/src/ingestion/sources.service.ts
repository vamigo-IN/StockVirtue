import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NewsArrivalMode,
  NewsFetchStatus,
  NewsFetchTrigger,
  NewsItemStatus,
  NewsSource,
  NewsSourceFormat,
  NewsSourceType,
  NewsSourceUsage,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { SecretBoxService, SecretUnreadableError } from '../common/secret-box';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { FeedParseError, JSON_FIELDS } from './feed-parser';
import {
  IngestError,
  IngestService,
  sourceAuth,
  sourceMapping,
} from './ingest.service';
import { IngestQueue } from './ingest.queue';
import { LogsQuery, SourceDto, TestSourceDto } from './ingestion.dto';
import { checkedUrl, SafeFetchError } from './safe-fetch';
import {
  OFFICIAL_CATEGORY_SLUG,
  OFFICIAL_TYPES,
  SOURCE_CATALOGUE,
} from './source-catalogue';
import { sourceHealth } from './source-health';

const MINUTE = 60_000;

const PAGE_SIZE = 30;

/**
 * News sources (portal: News sources). Adding, editing, pausing and
 * deleting them; credentials are sealed and write-only; Test fetches without
 * storing; Fetch now and Retry hand the work to the worker.
 */
@Injectable()
export class SourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
    private readonly audit: AuditService,
    private readonly ingest: IngestService,
    private readonly queue: IngestQueue,
  ) {}

  async list() {
    const [sources, newCounts, dayCounts] = await Promise.all([
      this.prisma.newsSource.findMany({
        include: { category: { select: { id: true, name: true } } },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.newsSourceItem.groupBy({
        by: ['sourceId'],
        where: { status: NewsItemStatus.NEW },
        _count: { _all: true },
      }),
      this.prisma.newsSourceItem.groupBy({
        by: ['sourceId'],
        where: { fetchedAt: { gte: new Date(Date.now() - 24 * 60 * MINUTE) } },
        _count: { _all: true },
      }),
    ]);
    const newBy = new Map(newCounts.map((c) => [c.sourceId, c._count._all]));
    const dayBy = new Map(dayCounts.map((c) => [c.sourceId, c._count._all]));
    return sources.map((s) => ({
      ...this.view(s),
      waiting: newBy.get(s.id) ?? 0,
      last24h: dayBy.get(s.id) ?? 0,
    }));
  }

  /** Ready-made official sources, marked when already added (same address). */
  async catalogue() {
    const added = new Set(
      (await this.prisma.newsSource.findMany({ select: { url: true } }))
        .map((s) => s.url)
        .filter(Boolean),
    );
    return SOURCE_CATALOGUE.map((c) => ({
      ...c,
      official: OFFICIAL_TYPES.has(c.type),
      added: added.has(c.url),
    }));
  }

  /**
   * Adds a ready-made source with the usage its terms allow; items wait in
   * Incoming news. Government bodies and regulators file their stories in
   * Official updates (kept apart from the main news) while that category is on.
   */
  async addFromCatalogue(
    actor: StaffPrincipal,
    key: string,
    client: ClientInfo,
  ) {
    const c = SOURCE_CATALOGUE.find((x) => x.key === key);
    if (!c) throw new NotFoundException('That source isn’t in the catalogue.');
    if (await this.prisma.newsSource.count({ where: { url: c.url } })) {
      throw new ConflictException(`${c.name} is already one of your sources.`);
    }
    const official = OFFICIAL_TYPES.has(c.type)
      ? await this.prisma.newsCategory.findFirst({
          where: { slug: OFFICIAL_CATEGORY_SLUG, isActive: true },
          select: { id: true },
        })
      : null;
    const dto: SourceDto = {
      name: c.name,
      type: c.type,
      format: NewsSourceFormat.FEED,
      url: c.url,
      pollMinutes: c.pollMinutes,
      ...(official ? { categoryId: official.id } : {}),
      usage: c.usage,
      attribution: c.attribution,
      licenceNote: [c.terms, `Terms: ${c.termsUrl}`, c.caution]
        .filter(Boolean)
        .join('\n'),
      isActive: true,
    };
    return this.create(actor, dto, client);
  }

  async get(id: string) {
    const s = await this.prisma.newsSource.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!s) throw new NotFoundException('That source no longer exists.');
    const [waiting, total] = await Promise.all([
      this.prisma.newsSourceItem.count({
        where: { sourceId: id, status: NewsItemStatus.NEW },
      }),
      this.prisma.newsSourceItem.count({ where: { sourceId: id } }),
    ]);
    return { ...this.view(s), waiting, total };
  }

  /** Never the secret: only whether there is one and whether it can be read. */
  view(s: NewsSource & { category?: { id: string; name: string } | null }) {
    const auth = sourceAuth(s.auth);
    return {
      id: s.id,
      name: s.name,
      type: s.type,
      format: s.format,
      url: s.url,
      auth: auth ?? { mode: 'none' as const },
      hasSecret: !!s.secret,
      secretReadable: !s.secret || this.secrets.ownsValue(s.secret),
      mapping: sourceMapping(s.mapping),
      pollMinutes: s.pollMinutes,
      isActive: s.isActive,
      category: s.category ?? null,
      usage: s.usage,
      allowAiDrafts: s.allowAiDrafts,
      useImages: s.useImages,
      attribution: s.attribution,
      licenceNote: s.licenceNote,
      notifyEditors: s.notifyEditors,
      arrivalMode: s.arrivalMode,
      autoDailyLimit: s.autoDailyLimit,
      health: sourceHealth(s),
      lastFetchedAt: s.lastFetchedAt,
      lastSuccessAt: s.lastSuccessAt,
      lastErrorAt: s.lastErrorAt,
      lastError: s.lastError,
      consecutiveFailures: s.consecutiveFailures,
      nextPollAt: s.nextPollAt,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /** The source's settings after `dto`, validated as a whole. */
  private async settle(dto: SourceDto, existing?: NewsSource) {
    const type = dto.type ?? existing?.type ?? NewsSourceType.RSS;
    let format = dto.format ?? existing?.format ?? NewsSourceFormat.FEED;
    if (type === NewsSourceType.MANUAL) format = NewsSourceFormat.NONE;
    if (format === NewsSourceFormat.NONE && type !== NewsSourceType.MANUAL) {
      throw new BadRequestException(
        'Only manual sources have nothing to fetch.',
      );
    }
    const name = (dto.name ?? existing?.name ?? '').trim();
    if (name.length < 2)
      throw new BadRequestException('Give the source a name.');

    let url: string | null = null;
    if (format !== NewsSourceFormat.NONE) {
      const raw = (dto.url ?? existing?.url ?? '').trim();
      if (!raw) throw new BadRequestException('Give the address to fetch.');
      try {
        url = checkedUrl(raw).toString();
      } catch (err) {
        throw new BadRequestException((err as Error).message);
      }
    }

    const authIn =
      dto.auth ??
      (existing
        ? (sourceAuth(existing.auth) ?? { mode: 'none' as const })
        : { mode: 'none' as const });
    const auth =
      authIn.mode === 'none' || format === NewsSourceFormat.NONE
        ? {}
        : { mode: authIn.mode, name: (authIn as { name?: string }).name ?? '' };
    if ('mode' in auth && !auth.name) {
      throw new BadRequestException(
        auth.mode === 'header'
          ? 'Name the header the key goes in (e.g. X-API-Key).'
          : 'Name the parameter the key goes in (e.g. apikey).',
      );
    }

    let mapping: Prisma.InputJsonValue = {};
    if (format === NewsSourceFormat.JSON_API) {
      const m =
        dto.mapping ?? (existing ? sourceMapping(existing.mapping) : undefined);
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(m?.fields ?? {})) {
        if (!(JSON_FIELDS as readonly string[]).includes(k)) continue;
        if (typeof v !== 'string' || !/^[\w.-]{0,100}$/.test(v)) {
          throw new BadRequestException(`The “${k}” field path isn’t valid.`);
        }
        if (v) fields[k] = v;
      }
      mapping = { itemsPath: m?.itemsPath ?? '', fields };
    }

    const categoryId =
      dto.categoryId === undefined
        ? (existing?.categoryId ?? null)
        : dto.categoryId;
    if (categoryId) {
      const ok = await this.prisma.newsCategory.count({
        where: { id: categoryId },
      });
      if (!ok) throw new BadRequestException('That category no longer exists.');
    }
    const usage = dto.usage ?? existing?.usage ?? NewsSourceUsage.HEADLINE_ONLY;
    const allowAiDrafts =
      usage === NewsSourceUsage.HEADLINE_ONLY
        ? false
        : (dto.allowAiDrafts ?? existing?.allowAiDrafts ?? false);
    // Pictures come with licensed full text, never with a headline or summary.
    const useImages =
      usage === NewsSourceUsage.FULL_TEXT
        ? (dto.useImages ?? existing?.useImages ?? false)
        : false;
    const arrivalMode =
      dto.arrivalMode ?? existing?.arrivalMode ?? NewsArrivalMode.INBOX;
    if (
      arrivalMode === NewsArrivalMode.PUBLISH &&
      usage === NewsSourceUsage.HEADLINE_ONLY
    ) {
      throw new BadRequestException(
        'Publishing automatically needs a source whose terms let you use its summary or full text. A headline-only source can save drafts instead.',
      );
    }
    if (
      arrivalMode !== NewsArrivalMode.INBOX &&
      type === NewsSourceType.MANUAL
    ) {
      throw new BadRequestException(
        'Typed-in items always wait in Incoming news.',
      );
    }
    return {
      name,
      type,
      format,
      url,
      auth: auth as Prisma.InputJsonValue,
      mapping,
      pollMinutes: dto.pollMinutes ?? existing?.pollMinutes ?? 30,
      isActive: dto.isActive ?? existing?.isActive ?? true,
      categoryId,
      usage,
      allowAiDrafts,
      useImages,
      attribution: (dto.attribution ?? existing?.attribution ?? '').trim(),
      licenceNote:
        dto.licenceNote === undefined
          ? (existing?.licenceNote ?? null)
          : dto.licenceNote.trim() || null,
      notifyEditors: dto.notifyEditors ?? existing?.notifyEditors ?? false,
      arrivalMode,
      autoDailyLimit: dto.autoDailyLimit ?? existing?.autoDailyLimit ?? 20,
    };
  }

  /**
   * Whether new items become drafts or are published, and how many a day, is
   * a Super Admin's call: an automatic story reaches readers (or the drafts
   * list) without anyone having read it.
   */
  private assertMayChangeArrival(
    actor: StaffPrincipal,
    next: { arrivalMode: NewsArrivalMode; autoDailyLimit: number },
    before?: Pick<NewsSource, 'arrivalMode' | 'autoDailyLimit'>,
  ) {
    const changed =
      next.arrivalMode !== (before?.arrivalMode ?? NewsArrivalMode.INBOX) ||
      next.autoDailyLimit !== (before?.autoDailyLimit ?? 20);
    if (changed && !actor.roles.includes(SUPER_ADMIN)) {
      throw new ForbiddenException(
        'Only a Super Admin can choose what happens to a source’s new items.',
      );
    }
  }

  private auditable(s: NewsSource) {
    return {
      name: s.name,
      type: s.type,
      format: s.format,
      url: s.url,
      auth: s.auth,
      pollMinutes: s.pollMinutes,
      isActive: s.isActive,
      categoryId: s.categoryId,
      usage: s.usage,
      allowAiDrafts: s.allowAiDrafts,
      useImages: s.useImages,
      attribution: s.attribution,
      notifyEditors: s.notifyEditors,
      arrivalMode: s.arrivalMode,
      autoDailyLimit: s.autoDailyLimit,
      hasSecret: !!s.secret,
    } satisfies Prisma.InputJsonValue;
  }

  async create(actor: StaffPrincipal, dto: SourceDto, client: ClientInfo) {
    const data = await this.settle(dto);
    this.assertMayChangeArrival(actor, data);
    const secret =
      dto.secret?.trim() && data.format !== NewsSourceFormat.NONE
        ? this.secrets.seal(dto.secret.trim(), 'news-source')
        : null;
    const s = await this.prisma.newsSource.create({
      data: {
        ...data,
        secret,
        createdById: actor.staffId,
        nextPollAt: new Date(),
      },
      include: { category: { select: { id: true, name: true } } },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.source.create',
      entityType: 'NewsSource',
      entityId: s.id,
      after: this.auditable(s),
      ...client,
    });
    return this.view(s);
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: SourceDto,
    client: ClientInfo,
  ) {
    const before = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('That source no longer exists.');
    const data = await this.settle(dto, before);
    this.assertMayChangeArrival(actor, data, before);
    let secret = before.secret;
    if (dto.secret !== undefined) {
      secret = dto.secret.trim()
        ? this.secrets.seal(dto.secret.trim(), 'news-source')
        : null;
    }
    if (data.format === NewsSourceFormat.NONE) secret = null;
    const addressChanged =
      data.url !== before.url ||
      JSON.stringify(data.auth) !== JSON.stringify(before.auth) ||
      secret !== before.secret;
    const s = await this.prisma.newsSource.update({
      where: { id },
      data: {
        ...data,
        secret,
        // A new address starts fresh: no cached validators, poll soon.
        ...(addressChanged
          ? { etag: null, lastModified: null, nextPollAt: new Date() }
          : {}),
        ...(data.isActive && !before.isActive
          ? { nextPollAt: new Date(), consecutiveFailures: 0 }
          : {}),
      },
      include: { category: { select: { id: true, name: true } } },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.source.update',
      entityType: 'NewsSource',
      entityId: id,
      before: this.auditable(before),
      after: { ...this.auditable(s), secretChanged: dto.secret !== undefined },
      ...client,
    });
    return this.view(s);
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const s = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('That source no longer exists.');
    const items = await this.prisma.newsSourceItem.count({
      where: { sourceId: id },
    });
    // Stories started from its items keep their source credit (a copy).
    await this.prisma.newsSource.delete({ where: { id } });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.source.delete',
      entityType: 'NewsSource',
      entityId: id,
      before: this.auditable(s),
      meta: { itemsRemoved: items },
      ...client,
    });
  }

  /** Fetches with these settings and shows what would arrive; stores nothing. */
  async test(dto: TestSourceDto) {
    const existing = dto.sourceId
      ? await this.prisma.newsSource.findUnique({ where: { id: dto.sourceId } })
      : null;
    if (dto.sourceId && !existing)
      throw new NotFoundException('That source no longer exists.');
    const data = await this.settle(
      { ...dto, name: dto.name ?? existing?.name ?? 'Test' },
      existing ?? undefined,
    );
    if (data.format === NewsSourceFormat.NONE) {
      throw new BadRequestException('Manual sources have nothing to fetch.');
    }
    const secret =
      dto.secret === undefined
        ? (existing?.secret ?? null)
        : dto.secret.trim()
          ? this.secrets.seal(dto.secret.trim(), 'news-source')
          : null;
    try {
      return await this.ingest.preview({
        format: data.format,
        url: data.url,
        auth: data.auth as Prisma.JsonValue,
        secret,
        mapping: data.mapping as Prisma.JsonValue,
        etag: null,
        lastModified: null,
        usage: data.usage,
        useImages: data.useImages,
      });
    } catch (err) {
      if (
        err instanceof IngestError ||
        err instanceof SafeFetchError ||
        err instanceof FeedParseError ||
        err instanceof SecretUnreadableError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async fetchNow(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const s = await this.prisma.newsSource.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('That source no longer exists.');
    if (s.format === NewsSourceFormat.NONE) {
      throw new BadRequestException('Manual sources have nothing to fetch.');
    }
    await this.queue.fetch({
      sourceId: id,
      trigger: NewsFetchTrigger.MANUAL,
      requestedBy: actor.displayName,
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.source.fetch',
      entityType: 'NewsSource',
      entityId: id,
      ...client,
    });
    return { queued: true };
  }

  async retry(actor: StaffPrincipal, logId: string, client: ClientInfo) {
    const log = await this.prisma.newsFetchLog.findUnique({
      where: { id: logId },
      include: { source: { select: { id: true, format: true } } },
    });
    if (!log)
      throw new NotFoundException('That fetch is no longer in the history.');
    if (log.status !== NewsFetchStatus.FAILED) {
      throw new ConflictException('Only failed fetches can be retried.');
    }
    await this.queue.fetch({
      sourceId: log.sourceId,
      trigger: NewsFetchTrigger.RETRY,
      requestedBy: actor.displayName,
      retryOfId: log.id,
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'news.source.retry',
      entityType: 'NewsSource',
      entityId: log.sourceId,
      meta: { retryOf: log.id },
      ...client,
    });
    return { queued: true };
  }

  async logs(q: LogsQuery) {
    const where: Prisma.NewsFetchLogWhereInput = {
      ...(q.sourceId ? { sourceId: q.sourceId } : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const page = q.page ?? 1;
    const [rows, total] = await Promise.all([
      this.prisma.newsFetchLog.findMany({
        where,
        include: {
          source: { select: { id: true, name: true } },
          retries: {
            select: { id: true, status: true, startedAt: true },
            orderBy: { startedAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.newsFetchLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        source: r.source,
        trigger: r.trigger,
        status: r.status,
        requestedBy: r.requestedBy,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        httpStatus: r.httpStatus,
        itemsSeen: r.itemsSeen,
        itemsNew: r.itemsNew,
        itemsDuplicate: r.itemsDuplicate,
        error: r.error,
        retryOfId: r.retryOfId,
        retriedBy: r.retries[0] ?? null,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
    };
  }
}
