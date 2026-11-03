import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NewsArrivalMode,
  NewsFetchStatus,
  NewsFetchTrigger,
  NewsItemStatus,
  NewsSource,
  NewsSourceFormat,
  NewsSourceUsage,
  NewsStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AiAutoDraftService } from '../ai/ai-auto-draft.service';
import { AutoStoryService } from './auto-stories.service';
import { SecretBoxService, SecretUnreadableError } from '../common/secret-box';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { classify, suggestCategory } from './classifier';
import { EditorAlertsService } from './editor-alerts.service';
import {
  FeedParseError,
  JsonMapping,
  parseFeed,
  parseJsonApi,
  RawItem,
} from './feed-parser';
import { safeFetch, SafeFetchError, SafeResponse } from './safe-fetch';
import { StockMatcherService } from './stock-matcher.service';
import {
  canonicalUrl,
  clip,
  DUPLICATE_SIMILARITY,
  headlineSimilarity,
  htmlToText,
  oneLine,
  parseSourceDate,
  POSSIBLE_SIMILARITY,
  sha256,
  textSimilarity,
  textTokens,
  titleKey,
  titleTokens,
  DUPLICATE_TEXT_SIMILARITY,
  POSSIBLE_TEXT_SIMILARITY,
} from './text';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
// Names us and a contact, as public feeds (e.g. the US SEC) ask of robots.
const USER_AGENT =
  'StockVirtueNewsroom/1.0 (+https://stockvirtue.com/news; support@stockvirtue.com)';
const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5';
const SUMMARY_CHARS = 1500;
const CONTENT_CHARS = 50_000;

/** Where a source's secret goes on each request. */
export interface SourceAuth {
  mode: 'header' | 'query';
  name: string;
}

export function sourceAuth(raw: Prisma.JsonValue): SourceAuth | null {
  const a = (raw ?? {}) as Partial<SourceAuth>;
  if (
    (a.mode === 'header' || a.mode === 'query') &&
    typeof a.name === 'string' &&
    a.name
  ) {
    return { mode: a.mode, name: a.name };
  }
  return null;
}

export function sourceMapping(raw: Prisma.JsonValue): JsonMapping {
  const m = (raw ?? {}) as Partial<JsonMapping>;
  return {
    itemsPath: typeof m.itemsPath === 'string' ? m.itemsPath : '',
    fields: m.fields && typeof m.fields === 'object' ? m.fields : {},
  };
}

/** A failure staff can act on, with the HTTP status when there was one. */
export class IngestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
  }
}

/** What a fetch needs to know about a source (saved or being tested). */
export type FetchableSource = Pick<
  NewsSource,
  'format' | 'url' | 'auth' | 'secret' | 'mapping' | 'etag' | 'lastModified'
>;

/** An item cleaned up and limited to what the source's licence allows. */
interface Normalised {
  externalHash: string;
  url: string | null;
  urlHash: string | null;
  title: string;
  titleKey: string;
  tokens: string[];
  /** Words of the headline and summary, for stories told differently. */
  text: string[];
  summary: string | null;
  content: string | null;
  author: string | null;
  publishedAt: Date | null;
  feedCategories: string[];
}

/** A recent item, as duplicate checks compare against it. */
interface WindowItem {
  id: string;
  key: string;
  tokens: string[];
  text: Set<string>;
  stocks: string[];
  topics: string[];
  sourceId: string;
  at: number;
}

/// Topics about one company event: the same company and event from another
/// source within a day is likely the same news.
const EVENT_TOPICS = new Set(['ipo', 'results', 'corporate_action', 'deals']);
/// The score such a same-event match gets: a possible repeat, never certain.
const EVENT_SCORE = 0.5;

export interface FetchSummary {
  logId: string;
  status: NewsFetchStatus;
  httpStatus: number | null;
  itemsSeen: number;
  itemsNew: number;
  itemsDuplicate: number;
  error: string | null;
}

function httpMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `The source refused access (HTTP ${status}). Check the API key or credentials.`;
  }
  if (status === 404 || status === 410) {
    return `There’s nothing at this address any more (HTTP ${status}).`;
  }
  if (status === 429) {
    return 'The source is rate-limiting us (HTTP 429). Try a longer polling interval.';
  }
  if (status >= 500) return `The source had a problem (HTTP ${status}).`;
  return `The source answered with HTTP ${status}.`;
}

/** Decodes a response in the charset it declares (header, then XML declaration). */
function decodeBody(res: SafeResponse): string {
  const type = String(res.headers['content-type'] ?? '');
  const head = res.body.subarray(0, 200).toString('latin1');
  const label =
    /charset=["']?([\w-]+)/i.exec(type)?.[1] ??
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(label.toLowerCase()).decode(res.body);
  } catch {
    return new TextDecoder('utf-8').decode(res.body);
  }
}

/** RSS authors are often "desk@paper.com (Name)". */
function cleanAuthor(raw: string | null): string | null {
  if (!raw) return null;
  const t = htmlToText(raw);
  const named = /\(([^)]+)\)/.exec(t)?.[1] ?? t.replace(/\S+@\S+/g, '');
  return oneLine(named, 120) || null;
}

/**
 * The ingestion pipeline (spec §8): fetch a source safely, normalise what it
 * sent, catch duplicates, map related stocks, classify, store only what the
 * licence allows, log the fetch and the source's health, then make stories
 * where the source's arrival mode (a Super Admin's choice) says so, tell
 * editors about what is left and — where permitted — ask the AI for a draft.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly redis: RedisService,
    private readonly matcher: StockMatcherService,
    private readonly alerts: EditorAlertsService,
    private readonly autoDraft: AiAutoDraftService,
    private readonly autoStories: AutoStoryService,
  ) {}

  /** One fetch of one source. Never throws: failures are logged on the source. */
  async run(
    sourceId: string,
    trigger: NewsFetchTrigger,
    opts: { requestedBy?: string; retryOfId?: string } = {},
  ): Promise<FetchSummary | null> {
    const lock = `ingest:lock:${sourceId}`;
    const locked = await this.redis.client.set(
      lock,
      '1',
      'PX',
      5 * MINUTE,
      'NX',
    );
    if (!locked) return null;
    try {
      const source = await this.prisma.newsSource.findUnique({
        where: { id: sourceId },
      });
      if (!source || source.format === NewsSourceFormat.NONE || !source.url)
        return null;
      if (!source.isActive && trigger === NewsFetchTrigger.SCHEDULE)
        return null;
      return await this.fetchAndStore(source, trigger, opts);
    } finally {
      await this.redis.client.del(lock);
    }
  }

  private async fetchAndStore(
    source: NewsSource,
    trigger: NewsFetchTrigger,
    opts: { requestedBy?: string; retryOfId?: string },
  ): Promise<FetchSummary> {
    const log = await this.prisma.newsFetchLog.create({
      data: {
        sourceId: source.id,
        trigger,
        requestedBy: opts.requestedBy ?? null,
        retryOfId: opts.retryOfId ?? null,
      },
    });
    const started = Date.now();
    const now = new Date();
    let httpStatus: number | null = null;
    try {
      const res = await this.fetch(source, true);
      httpStatus = res.status;
      if (res.status === 304) {
        await this.finish(log.id, started, {
          status: NewsFetchStatus.NOT_MODIFIED,
          httpStatus,
        });
        await this.succeeded(source, now, res);
        return this.summary(
          log.id,
          NewsFetchStatus.NOT_MODIFIED,
          httpStatus,
          0,
          0,
          0,
          null,
        );
      }
      const raw = this.parse(source, decodeBody(res));
      const stored = await this.store(source, raw, res.url, now);
      await this.finish(log.id, started, {
        status: NewsFetchStatus.SUCCESS,
        httpStatus,
        itemsSeen: stored.seen,
        itemsNew: stored.created,
        itemsDuplicate: stored.duplicates,
      });
      await this.succeeded(source, now, res);
      await this.afterStore(source, stored.fresh);
      return this.summary(
        log.id,
        NewsFetchStatus.SUCCESS,
        httpStatus,
        stored.seen,
        stored.created,
        stored.duplicates,
        null,
      );
    } catch (err) {
      const message = this.describe(err);
      httpStatus = err instanceof IngestError ? err.httpStatus : httpStatus;
      await this.finish(log.id, started, {
        status: NewsFetchStatus.FAILED,
        httpStatus,
        error: message,
      });
      const failures = source.consecutiveFailures + 1;
      const backoff = Math.min(
        source.pollMinutes * 2 ** Math.min(failures - 1, 6),
        360,
      );
      await this.prisma.newsSource.update({
        where: { id: source.id },
        data: {
          lastFetchedAt: now,
          lastErrorAt: now,
          lastError: message.slice(0, 500),
          consecutiveFailures: failures,
          nextPollAt: new Date(now.getTime() + backoff * MINUTE),
        },
      });
      return this.summary(
        log.id,
        NewsFetchStatus.FAILED,
        httpStatus,
        0,
        0,
        0,
        message,
      );
    }
  }

  private summary(
    logId: string,
    status: NewsFetchStatus,
    httpStatus: number | null,
    itemsSeen: number,
    itemsNew: number,
    itemsDuplicate: number,
    error: string | null,
  ): FetchSummary {
    return {
      logId,
      status,
      httpStatus,
      itemsSeen,
      itemsNew,
      itemsDuplicate,
      error,
    };
  }

  private describe(err: unknown): string {
    if (
      err instanceof IngestError ||
      err instanceof SafeFetchError ||
      err instanceof FeedParseError ||
      err instanceof SecretUnreadableError
    ) {
      return err.message;
    }
    this.logger.error('Unexpected ingestion failure', err as Error);
    return 'Something went wrong reading this source.';
  }

  private finish(
    logId: string,
    started: number,
    data: Prisma.NewsFetchLogUpdateInput,
  ) {
    return this.prisma.newsFetchLog.update({
      where: { id: logId },
      data: {
        ...data,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
      },
    });
  }

  private succeeded(source: NewsSource, now: Date, res: SafeResponse) {
    const header = (h: string) => {
      const v = res.headers[h];
      return typeof v === 'string' && v.length <= 300 ? v : null;
    };
    return this.prisma.newsSource.update({
      where: { id: source.id },
      data: {
        lastFetchedAt: now,
        lastSuccessAt: now,
        lastError: null,
        consecutiveFailures: 0,
        nextPollAt: new Date(now.getTime() + source.pollMinutes * MINUTE),
        ...(res.status === 304
          ? {}
          : { etag: header('etag'), lastModified: header('last-modified') }),
      },
    });
  }

  /** The HTTP request, with the source's secret applied and never logged. */
  async fetch(
    source: FetchableSource,
    conditional: boolean,
  ): Promise<SafeResponse> {
    if (!source.url)
      throw new IngestError('This source has no address to fetch.');
    const headers: Record<string, string> = {
      'user-agent': USER_AGENT,
      accept:
        source.format === NewsSourceFormat.JSON_API
          ? 'application/json'
          : FEED_ACCEPT,
    };
    if (conditional && source.etag) headers['if-none-match'] = source.etag;
    if (conditional && source.lastModified)
      headers['if-modified-since'] = source.lastModified;
    let url = source.url;
    const auth = sourceAuth(source.auth);
    if (auth && source.secret) {
      const secret = this.secrets.open(source.secret, 'news-source');
      if (auth.mode === 'header') {
        headers[auth.name.toLowerCase()] = secret;
      } else {
        const u = new URL(url);
        u.searchParams.set(auth.name, secret);
        url = u.toString();
      }
    }
    const res = await safeFetch(url, {
      headers,
      timeoutMs: 20_000,
      privateHosts: this.config.get('newsroom', { infer: true })
        .ingestPrivateHosts,
    });
    if (res.status >= 400)
      throw new IngestError(httpMessage(res.status), res.status);
    return res;
  }

  parse(
    source: Pick<NewsSource, 'format' | 'mapping'>,
    body: string,
  ): RawItem[] {
    const feed =
      source.format === NewsSourceFormat.JSON_API
        ? parseJsonApi(body, sourceMapping(source.mapping))
        : parseFeed(body);
    return feed.items;
  }

  /** Cleans an item and keeps only what the licence allows. */
  normalise(
    raw: RawItem,
    usage: NewsSourceUsage,
    base: string | null,
  ): Normalised | null {
    const title = oneLine(htmlToText(raw.title), 300);
    if (!title) return null;
    const url = canonicalUrl(raw.url, base ?? undefined);
    const key = raw.id?.trim() || url || `${title}|${raw.publishedAt ?? ''}`;
    const summary =
      usage === NewsSourceUsage.HEADLINE_ONLY || !raw.summary
        ? null
        : clip(htmlToText(raw.summary), SUMMARY_CHARS) || null;
    const content =
      usage === NewsSourceUsage.FULL_TEXT && raw.content
        ? clip(htmlToText(raw.content), CONTENT_CHARS) || null
        : null;
    const tokens = titleTokens(title);
    return {
      externalHash: sha256(key),
      url,
      urlHash: url ? sha256(url) : null,
      title,
      titleKey: titleKey(title),
      tokens,
      text: summary ? textTokens(`${title}\n${summary}`) : [],
      summary,
      content,
      author: cleanAuthor(raw.author),
      publishedAt: parseSourceDate(raw.publishedAt),
      feedCategories: raw.categories
        .map((c) => oneLine(htmlToText(c), 60))
        .filter(Boolean)
        .slice(0, 10),
    };
  }

  /** A fetch without storing anything: the source form's Test button. */
  async preview(source: FetchableSource & { usage: NewsSourceUsage }) {
    const res = await this.fetch(source, false);
    const raw = this.parse(source, decodeBody(res));
    const items = raw
      .map((r) => this.normalise(r, source.usage, res.url))
      .filter((n): n is Normalised => n !== null)
      .slice(0, 8);
    return {
      httpStatus: res.status,
      found: raw.length,
      items: items.map((n) => ({
        title: n.title,
        url: n.url,
        publishedAt: n.publishedAt,
        summary: n.summary ? clip(n.summary, 300) : null,
        hasFullText: !!n.content,
        author: n.author,
      })),
    };
  }

  /**
   * Stores new items: skips ones this source already delivered, then checks
   * each against recent items from every source and recent stories.
   */
  async store(
    source: Pick<
      NewsSource,
      | 'id'
      | 'type'
      | 'usage'
      | 'allowAiDrafts'
      | 'attribution'
      | 'name'
      | 'categoryId'
    >,
    raw: RawItem[],
    base: string | null,
    now = new Date(),
  ) {
    const seenHashes = new Set<string>();
    const candidates: Normalised[] = [];
    for (const r of raw) {
      const n = this.normalise(r, source.usage, base);
      if (!n || seenHashes.has(n.externalHash)) continue;
      seenHashes.add(n.externalHash);
      candidates.push(n);
    }
    const existing = await this.prisma.newsSourceItem.findMany({
      where: { sourceId: source.id, externalHash: { in: [...seenHashes] } },
      select: { externalHash: true },
    });
    const known = new Set(existing.map((e) => e.externalHash));
    const fresh = candidates.filter((c) => !known.has(c.externalHash));
    if (fresh.length === 0) {
      return {
        seen: candidates.length,
        created: 0,
        duplicates: 0,
        ids: [] as string[],
        fresh: [] as { id: string; title: string }[],
      };
    }

    const [recent, byUrl, stories, categories, matcher] = await Promise.all([
      this.prisma.newsSourceItem.findMany({
        where: {
          fetchedAt: { gte: new Date(now.getTime() - 3 * DAY) },
          status: { not: NewsItemStatus.DUPLICATE },
        },
        select: {
          id: true,
          titleKey: true,
          title: true,
          summary: true,
          stockRefs: true,
          topics: true,
          sourceId: true,
          fetchedAt: true,
        },
        orderBy: { fetchedAt: 'desc' },
        take: 5000,
      }),
      this.prisma.newsSourceItem.findMany({
        where: {
          urlHash: {
            in: fresh.map((f) => f.urlHash).filter((h): h is string => !!h),
          },
          fetchedAt: { gte: new Date(now.getTime() - 30 * DAY) },
        },
        select: { id: true, urlHash: true, duplicateOfId: true, status: true },
        orderBy: { fetchedAt: 'asc' },
      }),
      this.prisma.newsArticle.findMany({
        where: {
          updatedAt: { gte: new Date(now.getTime() - 7 * DAY) },
          status: {
            notIn: [
              NewsStatus.CANCELLED,
              NewsStatus.REJECTED,
              NewsStatus.ARCHIVED,
            ],
          },
        },
        select: { id: true, title: true, sourceAttribution: true },
        take: 2000,
      }),
      this.prisma.newsCategory.findMany({
        where: { isActive: true },
        select: { id: true, slug: true, name: true },
      }),
      this.matcher.matcher(),
    ]);
    const window: WindowItem[] = recent.map((r) => ({
      id: r.id,
      key: r.titleKey,
      tokens: r.titleKey.split(' ').filter(Boolean),
      text: new Set(r.summary ? textTokens(`${r.title}\n${r.summary}`) : []),
      stocks: r.stockRefs,
      topics: r.topics,
      sourceId: r.sourceId,
      at: r.fetchedAt.getTime(),
    }));
    const articleTokens = stories.map((s) => ({
      id: s.id,
      tokens: titleTokens(s.title),
      urls: Array.isArray(s.sourceAttribution)
        ? (s.sourceAttribution as { url?: unknown }[])
            .map((x) =>
              typeof x.url === 'string' ? canonicalUrl(x.url) : null,
            )
            .filter((u): u is string => !!u)
        : [],
    }));
    const batchUrls = new Map<string, string>();

    const rows: Prisma.NewsSourceItemCreateManyInput[] = [];
    for (const c of fresh) {
      const id = randomUUID();
      const stocks = matcher.match(`${c.title}\n${c.summary ?? ''}`);
      const topics = classify(
        `${c.title}\n${c.summary ?? ''}`,
        source.type,
        c.feedCategories,
      );
      const stockRefs = stocks.map((s) => `${s.exchange}:${s.symbol}`);
      const dup = this.duplicateOf(
        c,
        { window, byUrl, articleTokens, batchUrls },
        { stocks: stockRefs, topics, sourceId: source.id, at: now.getTime() },
      );
      rows.push({
        id,
        sourceId: source.id,
        externalHash: c.externalHash,
        url: c.url,
        urlHash: c.urlHash,
        title: c.title,
        titleKey: c.titleKey,
        summary: c.summary,
        content: c.content,
        author: c.author,
        publishedAt: c.publishedAt,
        fetchedAt: now,
        usage: source.usage,
        allowAiDrafts: source.allowAiDrafts,
        attribution: source.attribution || source.name,
        feedCategories: c.feedCategories,
        stocks: stocks as unknown as Prisma.InputJsonValue,
        stockRefs,
        topics,
        suggestedCategoryId: suggestCategory(
          topics,
          categories,
          source.categoryId,
        ),
        status: dup?.sure ? NewsItemStatus.DUPLICATE : NewsItemStatus.NEW,
        duplicateOfId: dup?.itemId ?? null,
        duplicateOfArticleId: dup?.articleId ?? null,
        duplicateScore: dup?.score ?? null,
      });
      if (c.urlHash && !batchUrls.has(c.urlHash)) batchUrls.set(c.urlHash, id);
      if (!dup?.sure) {
        window.push({
          id,
          key: c.titleKey,
          tokens: c.tokens,
          text: new Set(c.text),
          stocks: stockRefs,
          topics,
          sourceId: source.id,
          at: now.getTime(),
        });
      }
    }
    // Originals first, so a repeat in the same batch can point at one.
    const originals = rows.filter((r) => !r.duplicateOfId);
    const repeats = rows.filter((r) => r.duplicateOfId);
    if (originals.length) {
      await this.prisma.newsSourceItem.createMany({
        data: originals,
        skipDuplicates: true,
      });
    }
    if (repeats.length) {
      await this.prisma.newsSourceItem.createMany({
        data: repeats,
        skipDuplicates: true,
      });
    }
    return {
      seen: candidates.length,
      created: rows.length,
      duplicates: rows.filter((r) => r.status === NewsItemStatus.DUPLICATE)
        .length,
      ids: rows.map((r) => r.id as string),
      fresh: rows
        .filter((r) => r.status === NewsItemStatus.NEW)
        .map((r) => ({ id: r.id as string, title: r.title })),
    };
  }

  /**
   * The item or story this one repeats: same link, same headline, nearly the
   * same headline or text, or (possibly) the same company event from another
   * source within a day.
   */
  private duplicateOf(
    c: Normalised,
    ctx: {
      window: WindowItem[];
      byUrl: {
        id: string;
        urlHash: string | null;
        duplicateOfId: string | null;
      }[];
      articleTokens: { id: string; tokens: string[]; urls: string[] }[];
      batchUrls: Map<string, string>;
    },
    self: { stocks: string[]; topics: string[]; sourceId: string; at: number },
  ): {
    itemId?: string;
    articleId?: string;
    score: number;
    sure: boolean;
  } | null {
    if (c.urlHash) {
      const prior = ctx.byUrl.find((x) => x.urlHash === c.urlHash);
      if (prior)
        return {
          itemId: prior.duplicateOfId ?? prior.id,
          score: 1,
          sure: true,
        };
      const inBatch = ctx.batchUrls.get(c.urlHash);
      if (inBatch) return { itemId: inBatch, score: 1, sure: true };
    }
    if (c.url) {
      const cited = ctx.articleTokens.find((a) =>
        a.urls.includes(c.url as string),
      );
      if (cited) return { articleId: cited.id, score: 1, sure: true };
    }
    if (c.titleKey) {
      const same = ctx.window.find((w) => w.key === c.titleKey);
      if (same) return { itemId: same.id, score: 1, sure: true };
    }
    let best: { itemId?: string; articleId?: string; score: number } | null =
      null;
    for (const w of ctx.window) {
      const score = headlineSimilarity(c.tokens, w.tokens);
      if (score >= POSSIBLE_SIMILARITY && score > (best?.score ?? 0))
        best = { itemId: w.id, score };
    }
    for (const a of ctx.articleTokens) {
      const score = headlineSimilarity(c.tokens, a.tokens);
      if (score >= POSSIBLE_SIMILARITY && score > (best?.score ?? 0))
        best = { articleId: a.id, score };
    }
    if (best && best.score >= DUPLICATE_SIMILARITY) {
      return { ...best, score: Math.round(best.score * 100) / 100, sure: true };
    }
    // Told in other words: much the same text, or the same company event.
    const events = self.topics.filter((t) => EVENT_TOPICS.has(t));
    let text: { itemId: string; score: number } | null = null;
    for (const w of ctx.window) {
      if (c.text.length >= 8) {
        const score = textSimilarity(c.text, w.text);
        if (score >= POSSIBLE_TEXT_SIMILARITY && score > (text?.score ?? 0))
          text = { itemId: w.id, score };
      }
      if (
        events.length &&
        self.stocks.length &&
        w.sourceId !== self.sourceId &&
        Math.abs(self.at - w.at) <= DAY &&
        self.stocks.some((s) => w.stocks.includes(s)) &&
        events.some((t) => w.topics.includes(t)) &&
        (best?.score ?? 0) < EVENT_SCORE
      ) {
        best = { itemId: w.id, score: EVENT_SCORE };
      }
    }
    if (text?.score && text.score >= DUPLICATE_TEXT_SIMILARITY) {
      return { ...text, score: Math.round(text.score * 100) / 100, sure: true };
    }
    if (text && text.score > (best?.score ?? 0)) best = text;
    if (!best) return null;
    return {
      ...best,
      score: Math.round(best.score * 100) / 100,
      sure: false,
    };
  }

  private async afterStore(
    source: Pick<
      NewsSource,
      | 'id'
      | 'name'
      | 'notifyEditors'
      | 'arrivalMode'
      | 'autoDailyLimit'
      | 'categoryId'
    >,
    stored: { id: string; title: string }[],
  ) {
    if (stored.length === 0) return;
    let fresh = stored;
    if (source.arrivalMode !== NewsArrivalMode.INBOX) {
      await this.autoStories
        .handle(
          source,
          stored.map((s) => s.id),
        )
        .catch((err: unknown) =>
          this.logger.warn(
            `Automatic stories failed: ${(err as Error).message}`,
          ),
        );
      // Editors and the AI hear only about items still waiting for a person.
      const waiting = await this.prisma.newsSourceItem.findMany({
        where: {
          id: { in: stored.map((s) => s.id) },
          status: NewsItemStatus.NEW,
        },
        select: { id: true },
      });
      const ids = new Set(waiting.map((w) => w.id));
      fresh = stored.filter((s) => ids.has(s.id));
      if (fresh.length === 0) return;
    }
    if (source.notifyEditors) {
      await this.alerts
        .newItems(source, fresh)
        .catch((err: unknown) =>
          this.logger.warn(`Editor alert failed: ${(err as Error).message}`),
        );
    }
    await this.autoDraft
      .queueFor(fresh.map((f) => f.id))
      .catch((err: unknown) =>
        this.logger.warn(
          `Automatic AI drafts failed: ${(err as Error).message}`,
        ),
      );
  }

  /** A manual submission (a tip, a press release) through the same checks. */
  async addManual(
    source: Pick<
      NewsSource,
      | 'id'
      | 'type'
      | 'usage'
      | 'allowAiDrafts'
      | 'attribution'
      | 'name'
      | 'categoryId'
      | 'notifyEditors'
    >,
    raw: RawItem,
  ): Promise<string | null> {
    const stored = await this.store(source, [raw], null);
    // Typed-in tips always wait for a person.
    await this.afterStore(
      { ...source, arrivalMode: NewsArrivalMode.INBOX, autoDailyLimit: 0 },
      stored.fresh,
    );
    return stored.ids[0] ?? null;
  }

  /** Due sources, claimed atomically so two sweeps never queue the same one. */
  async claimDue(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE news_sources
      SET "nextPollAt" = now() + make_interval(mins => "pollMinutes")
      WHERE "isActive"
        AND format <> 'NONE'
        AND url IS NOT NULL
        AND ("nextPollAt" IS NULL OR "nextPollAt" <= now())
      RETURNING id`;
    return rows.map((r) => r.id);
  }

  /** Fetch logs kept 60 days; untouched items 120 days (items behind a story stay). */
  async cleanup(now = new Date()) {
    const logs = await this.prisma.newsFetchLog.deleteMany({
      where: { startedAt: { lt: new Date(now.getTime() - 60 * DAY) } },
    });
    const items = await this.prisma.newsSourceItem.deleteMany({
      where: {
        fetchedAt: { lt: new Date(now.getTime() - 120 * DAY) },
        articleId: null,
        status: {
          in: [
            NewsItemStatus.NEW,
            NewsItemStatus.DISMISSED,
            NewsItemStatus.DUPLICATE,
          ],
        },
      },
    });
    // A fetch the worker never finished (it was restarted mid-fetch).
    const stuck = await this.prisma.newsFetchLog.updateMany({
      where: {
        status: NewsFetchStatus.RUNNING,
        startedAt: { lt: new Date(now.getTime() - 15 * MINUTE) },
      },
      data: {
        status: NewsFetchStatus.FAILED,
        error: 'The fetch didn’t finish (the worker restarted).',
        finishedAt: now,
      },
    });
    return { logs: logs.count, items: items.count, stuck: stuck.count };
  }
}
