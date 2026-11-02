import { Injectable, Logger } from '@nestjs/common';
import {
  MediaAsset,
  MediaStatus,
  NotificationCampaignKind,
  NotificationCampaignStatus,
  Prisma,
} from '@prisma/client';
import type { MulticastMessage } from 'firebase-admin/messaging';
import { FirebaseAdminService } from '../../firebase/firebase-admin.service';
import { CompanyDirectoryService } from '../../market/company-directory.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { StorageService } from '../../storage/storage.service';
import { istDay, listedWhere } from '../public/public-articles';
import { FOLLOW_EXCHANGES } from '../readers/news-alerts.service';

const Kind = NotificationCampaignKind;
const Status = NotificationCampaignStatus;

/// Pushes wait this long after a story goes live, so a mistake taken down
/// straight away never reaches anyone.
export const GRACE_MS = 30_000;
/// Breaking pushes only for stories first published this recently.
export const BREAKING_WINDOW_MS = 3 * 3600_000;
/// Followed-stock pushes only for stories first published this recently.
export const STOCKS_WINDOW_MS = 6 * 3600_000;
/// News pushes per reader per day (IST), all kinds together.
export const DAILY_NEWS_PUSHES = 5;
/// The app's Android notification channel for news.
export const NEWS_CHANNEL_ID = 'stockvirtue_news';
const USERS_PER_BATCH = 500;
/// FCM's limit per multicast send.
const TOKENS_PER_SEND = 500;
/// A send with no progress for this long was cut off by a restart.
const STUCK_MS = 15 * 60_000;
/// After an FCM outage, try the rest of the campaign again this much later
/// (only while the story is still within its window).
const RETRY_AFTER_MS = 5 * 60_000;
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);
/// FCM or network trouble on Google's side, worth trying again later.
const OUTAGE_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/unknown-error',
  'messaging/quota-exceeded',
  'app/network-error',
  'app/network-timeout',
  'app/internal-error',
]);

interface Recipient {
  userId: string;
  /** For followed-stock pushes: the followed stock to name in the title. */
  symbol?: string;
}

const STORY_SELECT = {
  id: true,
  slug: true,
  title: true,
  isBreaking: true,
  status: true,
  publishedAt: true,
  firstPublishedAt: true,
  retractedAt: true,
  featuredImage: true,
} satisfies Prisma.NewsArticleSelect;
type Story = Prisma.NewsArticleGetPayload<{ select: typeof STORY_SELECT }>;

interface SendResult {
  delivered: number;
  failed: number;
  /** Readers at least one of whose devices took the push. */
  reached: Set<string>;
  /** FCM error codes for refusals that weren't about a dead device. */
  errors: string[];
  /** FCM itself was down: stop and try again later. */
  outage: string | null;
}

/** "Infosys Limited" → "Infosys", for a short notification title. */
export function shortCompanyName(name: string): string {
  return name.replace(/\s+(limited|ltd\.?)$/i, '').trim() || name;
}

/**
 * Breaking-news and followed-stock pushes. Runs in the worker from a sweep
 * every 30 seconds: stories that went live recently get their campaigns
 * (at most one of each kind per story), then each campaign goes to its
 * readers through FCM. Every reader gets at most one push per story and
 * DAILY_NEWS_PUSHES a day, readers' alert settings are honoured, and
 * device tokens FCM no longer recognises are dropped. A story taken down
 * mid-send stops the send; a reader no device of whose took the push keeps
 * their place (and their daily allowance) for a retry; an FCM outage puts
 * the rest of the campaign back in the queue while the story is fresh.
 */
@Injectable()
export class NewsPushService {
  private readonly logger = new Logger(NewsPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly firebase: FirebaseAdminService,
    private readonly storage: StorageService,
    private readonly directory: CompanyDirectoryService,
  ) {}

  /** One pass: tidy up, plan new campaigns, send what's due. */
  async sweep(now = new Date()) {
    await this.resumeStuck(now);
    const planned = await this.plan(now);
    const due = await this.prisma.notificationCampaign.findMany({
      where: {
        status: Status.QUEUED,
        scheduledAt: { lte: new Date(Math.max(now.getTime(), Date.now())) },
      },
      // Breaking first, so its readers aren't sent the same story again.
      orderBy: [{ scheduledAt: 'asc' }, { kind: 'asc' }],
      select: { id: true },
      take: 20,
    });
    for (const c of due) await this.deliver(c.id);
    return { planned, delivered: due.length };
  }

  /**
   * Creates the campaigns stories now qualify for: breaking stories first
   * published in the last BREAKING_WINDOW_MS, and stories tagged with listed
   * stocks first published in the last STOCKS_WINDOW_MS. A story republished
   * after a correction never pushes again.
   */
  async plan(now = new Date()): Promise<number> {
    // Only stories still owed a campaign, newest first, so a busy day's
    // already-planned stories never crowd out a new one.
    const stories = await this.prisma.newsArticle.findMany({
      where: {
        AND: [
          listedWhere(now),
          { publishedAt: { lte: new Date(now.getTime() - GRACE_MS) } },
          {
            OR: [
              {
                isBreaking: true,
                firstPublishedAt: {
                  gte: new Date(now.getTime() - BREAKING_WINDOW_MS),
                },
                pushCampaigns: { none: { kind: Kind.BREAKING } },
              },
              {
                firstPublishedAt: {
                  gte: new Date(now.getTime() - STOCKS_WINDOW_MS),
                },
                stocks: { some: { exchange: { in: ['NSE', 'BSE'] } } },
                pushCampaigns: { none: { kind: Kind.FOLLOWED_STOCKS } },
              },
            ],
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        isBreaking: true,
        firstPublishedAt: true,
        stocks: {
          select: { exchange: true, symbol: true },
          orderBy: [{ isPrimary: 'desc' }, { symbol: 'asc' }],
        },
        pushCampaigns: { select: { kind: true } },
      },
    });
    let created = 0;
    for (const s of stories) {
      const age = now.getTime() - (s.firstPublishedAt?.getTime() ?? 0);
      const has = new Set(s.pushCampaigns.map((c) => c.kind));
      if (
        s.isBreaking &&
        age <= BREAKING_WINDOW_MS &&
        !has.has(Kind.BREAKING)
      ) {
        if (
          await this.create({
            kind: Kind.BREAKING,
            dedupeKey: `article:${s.id}:breaking`,
            articleId: s.id,
            scheduledAt: now,
            title: 'Breaking news',
            body: s.title,
          })
        ) {
          created++;
        }
      }
      const listed = s.stocks.filter(
        (x) => x.exchange === 'NSE' || x.exchange === 'BSE',
      );
      if (
        listed.length &&
        age <= STOCKS_WINDOW_MS &&
        !has.has(Kind.FOLLOWED_STOCKS)
      ) {
        if (
          await this.create({
            kind: Kind.FOLLOWED_STOCKS,
            dedupeKey: `article:${s.id}:stocks`,
            articleId: s.id,
            scheduledAt: now,
            title: this.stockTitle(listed[0].symbol),
            body: s.title,
            audience: {
              stocks: listed.map((x) => `${x.exchange}:${x.symbol}`),
            },
          })
        ) {
          created++;
        }
      }
    }
    return created;
  }

  /**
   * Sends one queued campaign. Safe to call twice: only one call claims it.
   * Resumes where an interrupted attempt left off (readers already sent it
   * are skipped), and checks the story again before every batch.
   */
  async deliver(id: string): Promise<void> {
    const claimed = await this.prisma.notificationCampaign.updateMany({
      where: { id, status: Status.QUEUED },
      data: { status: Status.SENDING, startedAt: new Date() },
    });
    if (claimed.count === 0) return;
    const c = await this.prisma.notificationCampaign.findUniqueOrThrow({
      where: { id },
      include: { article: { select: STORY_SELECT } },
    });
    // Only while it is still ours: a stuck-send sweep may have moved it.
    const finish = (
      status: NotificationCampaignStatus,
      data: Prisma.NotificationCampaignUpdateManyMutationInput = {},
    ) =>
      this.prisma.notificationCampaign.updateMany({
        where: { id, status: Status.SENDING },
        data: { status, ...data },
      });

    const why = this.unsendable(c.kind, c.article, true);
    if (why) {
      await finish(Status.SKIPPED, { note: why });
      return;
    }
    if (!this.firebase.configured) {
      await finish(Status.SKIPPED, {
        note: 'Push isn’t set up on this server (FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT).',
      });
      return;
    }

    const story = c.article!;
    const symbols = this.audienceSymbols(c.audience);
    const image = this.pushImage(story.featuredImage);
    // Counts carry over from an interrupted attempt.
    let { recipients, delivered, failed } = c;
    const errors: string[] = [];
    let cursor = '';
    try {
      for (;;) {
        // The story may come down, or lose its breaking flag, mid-send.
        const now = await this.prisma.newsArticle.findUnique({
          where: { id: story.id },
          select: STORY_SELECT,
        });
        const stopped = this.unsendable(c.kind, now, false);
        if (stopped) {
          await finish(recipients ? Status.SENT : Status.SKIPPED, {
            recipients,
            delivered,
            failed,
            ...(recipients ? { sentAt: new Date() } : {}),
            note: recipients
              ? `Stopped after ${recipients} reader(s). ${stopped}`
              : stopped,
          });
          return;
        }
        const batch =
          c.kind === Kind.BREAKING
            ? await this.breakingReaders(cursor)
            : await this.stockReaders(symbols, cursor);
        if (!batch.length) break;
        cursor = batch[batch.length - 1].userId;
        const admitted = await this.admit(
          story.id,
          batch.map((r) => r.userId),
        );
        const readers = batch.filter((r) => admitted.has(r.userId));
        let sent: SendResult;
        try {
          sent = await this.send(c.id, c.kind, c.body, story, image, readers);
        } catch (err) {
          sent = {
            delivered: 0,
            failed: 0,
            reached: new Set(),
            errors: [],
            outage: (err as { code?: string }).code ?? (err as Error).message,
          };
        }
        // Readers no device of whose took it keep their place for a retry.
        await this.release(
          story.id,
          readers.map((r) => r.userId).filter((u) => !sent.reached.has(u)),
        );
        recipients += sent.reached.size;
        delivered += sent.delivered;
        failed += sent.failed;
        errors.push(...sent.errors);
        // Also the heartbeat the stuck-send check watches.
        await this.prisma.notificationCampaign.updateMany({
          where: { id, status: Status.SENDING },
          data: { recipients, delivered, failed },
        });
        if (sent.outage) {
          const at = new Date(Date.now() + RETRY_AFTER_MS);
          await finish(Status.QUEUED, {
            scheduledAt: at,
            note: `FCM was unavailable (${sent.outage.slice(0, 120)}); trying the rest again at ${at.toISOString()}.`,
          });
          this.logger.warn(
            `News push ${id} paused by an FCM outage (${sent.outage})`,
          );
          return;
        }
        if (batch.length < USERS_PER_BATCH) break;
      }
    } catch (err) {
      this.logger.warn(`News push ${id} failed: ${(err as Error).message}`);
      await finish(Status.FAILED, {
        recipients,
        delivered,
        failed,
        note: (err as Error).message.slice(0, 500),
      });
      return;
    }
    const refusedAll = delivered === 0 && failed > 0 && errors.length > 0;
    await finish(refusedAll ? Status.FAILED : Status.SENT, {
      recipients,
      delivered,
      failed,
      sentAt: new Date(),
      note: refusedAll
        ? `FCM refused every message (${mostCommon(errors)}).`
        : recipients
          ? null
          : 'No readers to send it to.',
    });
    this.logger.log(
      `News push ${id} (${c.kind}) reached ${recipients} reader(s), ${delivered} device(s)`,
    );
  }

  /**
   * Why a story can't go out in this kind of push now, or null. The age
   * window applies when a send starts, not part-way through one.
   */
  private unsendable(
    kind: NotificationCampaignKind,
    s: Story | null,
    checkAge: boolean,
  ): string | null {
    if (!s || !this.stillListed(s)) return 'The story is no longer published.';
    if (kind === Kind.BREAKING && !s.isBreaking) {
      return 'The story is no longer marked breaking.';
    }
    if (checkAge) {
      const age = Date.now() - (s.firstPublishedAt?.getTime() ?? 0);
      const window =
        kind === Kind.BREAKING ? BREAKING_WINDOW_MS : STOCKS_WINDOW_MS;
      if (age > window) return 'The story was too old by the time it was due.';
    }
    return null;
  }

  // ── Audiences ───────────────────────────────────────────────────────

  /** Readers with a device, an active account and breaking news on. */
  private breakingReaders(after: string): Promise<Recipient[]> {
    return this.prisma.$queryRaw<Recipient[]>`
      SELECT DISTINCT t."userId" AS "userId"
        FROM device_tokens t
        JOIN users u ON u.id = t."userId"
        LEFT JOIN news_alert_preferences p ON p."userId" = t."userId"
       WHERE u.status = 'ACTIVE'
         AND COALESCE(p.breaking, true)
         AND t."userId" > ${after}
       ORDER BY t."userId"
       LIMIT ${USERS_PER_BATCH}`;
  }

  /**
   * Readers following any of the story's stocks (a watchlist entry, or an
   * open position, in the company), with a device and the alert on. Each
   * comes with the first of the story's stocks they follow.
   */
  private async stockReaders(
    refs: string[],
    after: string,
  ): Promise<Recipient[]> {
    const symbols = [...new Set(refs.map((r) => r.split(':')[1]))];
    if (!symbols.length) return [];
    const rows = await this.prisma.$queryRaw<
      { userId: string; rank: number }[]
    >`
      WITH followers AS (
        SELECT w."userId", wi.symbol
          FROM watchlist_items wi
          JOIN watchlists w ON w.id = wi."watchlistId"
         WHERE wi.symbol = ANY(${symbols}) AND wi.exchange = ANY(${FOLLOW_EXCHANGES})
        UNION
        SELECT po."userId", po.symbol
          FROM positions po
         WHERE po.symbol = ANY(${symbols}) AND po.quantity <> 0
           AND po.exchange = ANY(${FOLLOW_EXCHANGES})
      )
      SELECT f."userId" AS "userId",
             min(array_position(${symbols}::text[], f.symbol))::int AS rank
        FROM followers f
        JOIN users u ON u.id = f."userId"
        LEFT JOIN news_alert_preferences p ON p."userId" = f."userId"
       WHERE u.status = 'ACTIVE'
         AND COALESCE(p."followedStocks", true)
         AND EXISTS (SELECT 1 FROM device_tokens t WHERE t."userId" = f."userId")
         AND f."userId" > ${after}
       GROUP BY f."userId"
       ORDER BY f."userId"
       LIMIT ${USERS_PER_BATCH}`;
    return rows.map((r) => ({
      userId: r.userId,
      symbol: symbols[(r.rank ?? 1) - 1] ?? symbols[0],
    }));
  }

  /**
   * Who of these readers may get this story now: not sent it already (by
   * either kind of push) and under the day's limit. Without Redis nothing
   * is sent, rather than risk repeats.
   */
  private async admit(articleId: string, userIds: string[]) {
    const ok = new Set<string>();
    if (!userIds.length) return ok;
    const sentKey = `news:push:sent:${articleId}`;
    const fresh = this.redis.client.multi();
    for (const u of userIds) fresh.sadd(sentKey, u);
    fresh.expire(sentKey, 3 * 86_400);
    const added = (await fresh.exec()) ?? [];
    const firstTime = userIds.filter((_, i) => added[i]?.[1] === 1);
    if (!firstTime.length) return ok;
    const day = istDay();
    const counts = this.redis.client.multi();
    for (const u of firstTime) {
      counts.incr(`news:push:day:${day}:${u}`);
      counts.expire(`news:push:day:${day}:${u}`, 2 * 86_400);
    }
    const res = (await counts.exec()) ?? [];
    firstTime.forEach((u, i) => {
      const n = Number(res[i * 2]?.[1] ?? Number.POSITIVE_INFINITY);
      if (n <= DAILY_NEWS_PUSHES) ok.add(u);
    });
    return ok;
  }

  /** Undoes admit() for readers the push never reached. */
  private async release(articleId: string, userIds: string[]) {
    if (!userIds.length) return;
    const day = istDay();
    const undo = this.redis.client.multi();
    undo.srem(`news:push:sent:${articleId}`, ...userIds);
    for (const u of userIds) undo.decr(`news:push:day:${day}:${u}`);
    await undo.exec();
  }

  // ── Sending ─────────────────────────────────────────────────────────

  private async send(
    campaignId: string,
    kind: NotificationCampaignKind,
    body: string,
    story: Story,
    image: string | undefined,
    readers: Recipient[],
  ): Promise<SendResult> {
    const out: SendResult = {
      delivered: 0,
      failed: 0,
      reached: new Set(),
      errors: [],
      outage: null,
    };
    if (!readers.length) return out;
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: readers.map((r) => r.userId) } },
      select: { userId: true, token: true },
    });
    const owner = new Map(tokens.map((t) => [t.token, t.userId]));
    const titleOf = new Map(
      readers.map((r) => [
        r.userId,
        kind === Kind.BREAKING
          ? 'Breaking news'
          : this.stockTitle(r.symbol ?? ''),
      ]),
    );
    const byTitle = new Map<string, string[]>();
    for (const t of tokens) {
      const title = titleOf.get(t.userId) ?? 'StockVirtue news';
      byTitle.set(title, [...(byTitle.get(title) ?? []), t.token]);
    }
    const messaging = this.firebase.messaging();
    for (const [title, all] of byTitle) {
      for (let i = 0; i < all.length; i += TOKENS_PER_SEND) {
        const chunk = all.slice(i, i + TOKENS_PER_SEND);
        const res = await messaging.sendEachForMulticast(
          this.message(chunk, title, body, story, campaignId, image),
        );
        out.delivered += res.successCount;
        out.failed += res.failureCount;
        const dead: string[] = [];
        const outages: string[] = [];
        res.responses.forEach((r, j) => {
          if (r.success) {
            const user = owner.get(chunk[j]);
            if (user) out.reached.add(user);
            return;
          }
          const code = r.error?.code ?? 'unknown';
          if (DEAD_TOKEN_CODES.has(code)) {
            dead.push(chunk[j]);
          } else {
            out.errors.push(code);
            if (OUTAGE_CODES.has(code)) outages.push(code);
          }
        });
        if (dead.length) {
          await this.prisma.deviceToken.deleteMany({
            where: { token: { in: dead } },
          });
        }
        // Nothing got through and FCM blamed itself, not the devices.
        if (res.successCount === 0 && outages.length) {
          out.outage = mostCommon(outages);
          return out;
        }
      }
    }
    return out;
  }

  private message(
    tokens: string[],
    title: string,
    body: string,
    story: Story,
    campaignId: string,
    image: string | undefined,
  ): MulticastMessage {
    return {
      tokens,
      notification: { title, body, ...(image ? { imageUrl: image } : {}) },
      // The app opens the story from these (FCM data values are strings).
      data: {
        type: 'news',
        slug: story.slug,
        articleId: story.id,
        campaignId,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: NEWS_CHANNEL_ID,
          tag: `news-${story.id}`,
          icon: 'ic_stat_notify',
          color: '#22D38A',
        },
      },
      apns: {
        payload: { aps: { sound: 'default', threadId: 'news' } },
        ...(image ? { fcmOptions: { imageUrl: image } } : {}),
      },
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Create a campaign unless one with this key exists; true if created. */
  private async create(
    data: Prisma.NotificationCampaignUncheckedCreateInput,
  ): Promise<boolean> {
    try {
      await this.prisma.notificationCampaign.create({ data });
      return true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return false;
      }
      throw err;
    }
  }

  /**
   * A send with no progress for STUCK_MS was cut off (the worker stopped
   * mid-send): queue the rest again. Readers it already reached are
   * skipped, and a story past its window is dropped when the retry starts.
   */
  private async resumeStuck(now: Date) {
    await this.prisma.notificationCampaign.updateMany({
      where: {
        status: Status.SENDING,
        updatedAt: { lt: new Date(now.getTime() - STUCK_MS) },
      },
      data: {
        status: Status.QUEUED,
        scheduledAt: now,
        note: 'Resumed after an interruption.',
      },
    });
  }

  private stillListed(s: Story) {
    return (
      s.status === 'PUBLISHED' &&
      !s.retractedAt &&
      !!s.publishedAt &&
      s.publishedAt.getTime() <= Date.now()
    );
  }

  private stockTitle(symbol: string) {
    const name = this.directory.nameFor(symbol);
    return `${name ? shortCompanyName(name) : symbol} in the news`;
  }

  private audienceSymbols(audience: Prisma.JsonValue): string[] {
    const stocks =
      audience && typeof audience === 'object' && !Array.isArray(audience)
        ? (audience as Record<string, unknown>).stocks
        : null;
    return Array.isArray(stocks)
      ? stocks.filter((s): s is string => typeof s === 'string')
      : [];
  }

  /** A mid-sized copy of the story's picture, if it is served over https. */
  private pushImage(a: MediaAsset | null): string | undefined {
    if (!a || a.status !== MediaStatus.READY) return undefined;
    const variants = Object.values(
      (a.variants ?? {}) as Record<string, { key: string; width: number }>,
    ).sort((x, y) => x.width - y.width);
    const pick =
      variants.find((v) => v.width >= 400 && v.width <= 800) ?? variants[0];
    const url = this.storage.publicUrl(pick?.key ?? a.storageKey);
    return url.startsWith('https://') ? url : undefined;
  }
}

/** The most frequent of some error codes. */
function mostCommon(codes: string[]): string {
  const counts = new Map<string, number>();
  for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
}
