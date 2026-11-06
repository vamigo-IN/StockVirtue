import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NewsReviewDecision,
  NewsStatus,
  NewsVersionReason,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { breakingAtForSwitch, breakingAtOnPublish } from '../breaking';
import { NewsCache } from '../public/news-cache';
import { PublishingQueue } from '../publishing/publishing.queue';
import {
  breakingNotifies,
  EDITORS_PICK_WINDOW_MS,
  editorsPickCampaign,
  isLive,
  NOTIFY_CAMPAIGN_INCLUDE,
  notificationView,
} from '../push/push-rules';
import { ArticleCapabilities, capabilities, has } from './article-access';
import { recordVersion } from './article-versions';
import {
  ArticleAccessRow,
  ArticlesService,
  STALE_VERSION,
} from './articles.service';

const S = NewsStatus;

const NOTIFY_DENIED =
  'Sending a notification to app readers needs news.publish and news.feature.';

/**
 * Writes `data` to a story without stamping its updatedAt, for changes that
 * are not edits of the story (the Featured and Breaking switches): Prisma's
 * @updatedAt would set it to now, and readers would see an "Updated" time.
 * The write keeps the updatedAt it read and applies only while that is
 * still current, so an edit saved in between keeps its own time (the row is
 * read again and the write retried).
 */
export async function updateKeepingUpdatedAt(
  tx: Prisma.TransactionClient,
  id: string,
  data: Prisma.NewsArticleUpdateManyMutationInput,
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await tx.newsArticle.findUnique({
      where: { id },
      select: { updatedAt: true },
    });
    if (!cur) throw new NotFoundException('Article not found.');
    const res = await tx.newsArticle.updateMany({
      where: { id, updatedAt: cur.updatedAt },
      data: { ...data, updatedAt: cur.updatedAt },
    });
    if (res.count === 1) return;
  }
  throw new ConflictException(
    'The story was being saved at the same moment. Try the switch again.',
  );
}

interface Move {
  action: string;
  allowed: (c: ArticleCapabilities) => boolean;
  /** Why not, when `allowed` says no. */
  denied?: string;
  to?: NewsStatus;
  data?: (
    a: ArticleAccessRow,
    now: Date,
  ) => Prisma.NewsArticleUncheckedUpdateManyInput;
  check?: (a: ArticleAccessRow) => void;
  review?: { decision: NewsReviewDecision; comment?: string };
  versionReason?: NewsVersionReason;
  meta?: Prisma.InputJsonValue;
  after?: (a: ArticleAccessRow) => Promise<void>;
}

/**
 * The editorial lifecycle. Every move checks the same capability map the
 * portal uses, refuses stale versions, and writes the status change, any
 * review decision, a version and the audit row in one transaction.
 *
 *   DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED
 *                ↘ CHANGES_REQUESTED → (edit) → IN_REVIEW
 *                ↘ REJECTED
 *   CANCELLED (spiked before release) · ARCHIVED · reopen → DRAFT
 */
@Injectable()
export class ArticleWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly articles: ArticlesService,
    private readonly publishing: PublishingQueue,
    private readonly cache: NewsCache,
  ) {}

  submit(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'submit',
      allowed: (c) => c.submit,
      denied:
        'Only drafts you wrote (or work assigned to you) can be sent for review.',
      to: S.IN_REVIEW,
      check: (a) => {
        if (!a.contentText.trim()) {
          throw new BadRequestException(
            'Write the story before sending it for review.',
          );
        }
      },
      versionReason: NewsVersionReason.SUBMIT,
    });
  }

  withdraw(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'withdraw',
      allowed: (c) => c.withdraw,
      to: S.DRAFT,
    });
  }

  approve(
    actor: StaffPrincipal,
    id: string,
    version: number,
    comment: string | undefined,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'approve',
      allowed: (c) => c.review,
      denied: this.signOffDenied(actor),
      to: S.APPROVED,
      review: { decision: NewsReviewDecision.APPROVED, comment },
      versionReason: NewsVersionReason.APPROVE,
    });
  }

  requestChanges(
    actor: StaffPrincipal,
    id: string,
    version: number,
    comment: string | undefined,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'request_changes',
      allowed: (c) => c.review,
      denied: this.signOffDenied(actor),
      to: S.CHANGES_REQUESTED,
      check: () =>
        this.requireComment(comment, 'Tell the writer what to change.'),
      review: { decision: NewsReviewDecision.CHANGES_REQUESTED, comment },
    });
  }

  reject(
    actor: StaffPrincipal,
    id: string,
    version: number,
    comment: string | undefined,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'reject',
      allowed: (c) => c.review,
      denied: this.signOffDenied(actor),
      to: S.REJECTED,
      check: () => this.requireComment(comment, 'Say why the story won’t run.'),
      review: { decision: NewsReviewDecision.REJECTED, comment },
    });
  }

  /** Publish now: from Approved, Scheduled, or straight from review. */
  async publish(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    const a = await this.articles.loadAccess(id);
    return this.move(actor, id, version, client, {
      action: 'publish',
      allowed: (c) => c.publish,
      denied: this.signOffDenied(actor, 'publish'),
      to: S.PUBLISHED,
      check: (row) => this.assertReady(row),
      data: (row, now) => ({
        publishedAt: now,
        firstPublishedAt: row.firstPublishedAt ?? now,
        scheduledAt: null,
        // Marked breaking before it went out: its 24 hours start now.
        ...breakingAtOnPublish(row, now),
      }),
      // Publishing straight from review is also the approval.
      review:
        a.status === S.IN_REVIEW
          ? {
              decision: NewsReviewDecision.APPROVED,
              comment: 'Approved and published.',
            }
          : undefined,
      versionReason: NewsVersionReason.PUBLISH,
      after: (row) => this.publishing.cancel(id, row.scheduledAt),
    });
  }

  async schedule(
    actor: StaffPrincipal,
    id: string,
    version: number,
    scheduledAt: string,
    client: ClientInfo,
  ) {
    const at = new Date(scheduledAt);
    const now = Date.now();
    if (Number.isNaN(at.getTime()) || at.getTime() < now + 60_000) {
      throw new BadRequestException('Pick a time at least a minute from now.');
    }
    if (at.getTime() > now + 366 * 86_400_000) {
      throw new BadRequestException('Schedule within the next year.');
    }
    const a = await this.articles.loadAccess(id);
    return this.move(actor, id, version, client, {
      action: 'schedule',
      allowed: (c) => c.schedule,
      denied: this.signOffDenied(actor, 'schedule'),
      to: S.SCHEDULED,
      check: (row) => this.assertReady(row),
      data: () => ({ scheduledAt: at }),
      review:
        a.status === S.IN_REVIEW
          ? {
              decision: NewsReviewDecision.APPROVED,
              comment: 'Approved and scheduled.',
            }
          : undefined,
      versionReason:
        a.status === S.IN_REVIEW ? NewsVersionReason.APPROVE : undefined,
      meta: { scheduledAt: at.toISOString() },
      after: () => this.publishing.enqueue(id, at),
    });
  }

  unschedule(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'unschedule',
      allowed: (c) => c.unschedule,
      to: S.APPROVED,
      data: () => ({ scheduledAt: null }),
      after: (row) => this.publishing.cancel(id, row.scheduledAt),
    });
  }

  /** Takes a story down and returns it to Draft, so it is reviewed again before it returns. */
  unpublish(
    actor: StaffPrincipal,
    id: string,
    version: number,
    reason: string | undefined,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'unpublish',
      allowed: (c) => c.unpublish,
      to: S.DRAFT,
      data: () => ({ publishedAt: null }),
      meta: { reason: reason?.trim() || null },
    });
  }

  archive(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'archive',
      allowed: (c) => c.archive,
      to: S.ARCHIVED,
    });
  }

  /** "Spike" a story before it runs. */
  cancel(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'cancel',
      allowed: (c) => c.cancel,
      to: S.CANCELLED,
    });
  }

  reopen(
    actor: StaffPrincipal,
    id: string,
    version: number,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'reopen',
      allowed: (c) => c.reopen,
      to: S.DRAFT,
    });
  }

  /**
   * Retracted stories stay public with the retraction notice (transparency).
   *
   * Correction notes were retired on 6 Nov 2026 (owner's decision): editors
   * fix a live story by editing it, and readers see only its "Updated" time.
   * Retraction keeps the names it shared with them: the `correct` capability
   * (permission news.correct, a key stored roles hold) and the CORRECTION
   * version reason (a stored enum value; the portal labels it "Live update").
   */
  retract(
    actor: StaffPrincipal,
    id: string,
    version: number,
    note: string,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'retract',
      allowed: (c) => c.correct,
      data: (_a, now) => ({ retractedAt: now, retractionNote: note.trim() }),
      versionReason: NewsVersionReason.CORRECTION,
      meta: { note: note.trim() },
    });
  }

  /**
   * Featured and breaking flags. They don't change the story, so they don't
   * bump the version (and never interrupt someone editing it), and they keep
   * its updatedAt: a live story's byline shows "Updated <time>" only for
   * real edits (web news/format.ts wasUpdated), never for a placement
   * switch.
   */
  async setFlags(
    actor: StaffPrincipal,
    id: string,
    flags: { isFeatured?: boolean; isBreaking?: boolean },
    client: ClientInfo,
  ) {
    const a = await this.articles.loadAccess(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!can.feature) {
      throw new ForbiddenException(
        'Marking stories featured or breaking needs news.feature.',
      );
    }
    const data = {
      ...(flags.isFeatured !== undefined
        ? { isFeatured: flags.isFeatured }
        : {}),
      ...(flags.isBreaking !== undefined
        ? {
            isBreaking: flags.isBreaking,
            // Its 24 hours start now if it's live, else at publication.
            breakingAt: breakingAtForSwitch(
              a,
              flags.isBreaking,
              a.status === S.PUBLISHED,
              new Date(),
            ),
          }
        : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await updateKeepingUpdatedAt(tx, id, data);
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.flags',
          entityType: 'NewsArticle',
          entityId: id,
          after: data,
          ...client,
        },
        tx,
      );
    });
    if (a.status === S.PUBLISHED) await this.cache.invalidate('flags');
    return this.articles.get(actor, id);
  }

  // ── Notifications to app readers (push/push-rules.ts) ───────────────

  /**
   * "Send a notification when published". Kept on the story, so it holds
   * through review and scheduled publishing: once the story is live the
   * worker's push sweep sends one EDITORS_PICK push to app readers with
   * breaking alerts on, unless breaking news notifies it anyway. Like the
   * placement flags it doesn't bump the version. A live story is notified
   * with notifyNow instead, which the portal confirms first.
   */
  async setNotify(
    actor: StaffPrincipal,
    id: string,
    on: boolean,
    client: ClientInfo,
  ) {
    const a = await this.notifyRow(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!can.notify) throw new ForbiddenException(NOTIFY_DENIED);
    if (on && a.pushCampaigns.length) {
      throw new ConflictException(
        'This story has already sent its notification. A story sends one, ever.',
      );
    }
    if (on && isLive(a)) {
      throw new ConflictException(
        'This story is already live. Use Send notification now to notify readers.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.newsArticle.update({
        where: { id },
        // Not an edit of the story: keep its updatedAt, so readers never see
        // an "Updated" time for it (web news/format.ts wasUpdated).
        data: { notifyOnPublish: on, updatedAt: a.updatedAt },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'news.article.notify_on_publish',
          entityType: 'NewsArticle',
          entityId: id,
          before: { notifyOnPublish: a.notifyOnPublish },
          after: { notifyOnPublish: on },
          ...client,
        },
        tx,
      );
    });
    return this.articles.get(actor, id);
  }

  /**
   * "Send notification now" for a story that is already live: queues its
   * editor's notification (EDITORS_PICK) for the worker's next push sweep,
   * which sends it to app readers with breaking alerts on, through the same
   * pipeline as breaking news (one push per reader and story, the daily
   * limit, quiet devices dropped). Once per story, ever; never as well as a
   * breaking push; only within EDITORS_PICK_WINDOW_MS of first publication.
   */
  async notifyNow(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const a = await this.notifyRow(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!can.notify) throw new ForbiddenException(NOTIFY_DENIED);
    const now = new Date();
    if (!isLive(a, now)) {
      throw new BadRequestException(
        a.retractedAt
          ? 'Retracted stories can’t send a notification.'
          : 'Publish the story first, or turn on Send a notification when published.',
      );
    }
    if (a.pushCampaigns.length) {
      throw new ConflictException(
        'This story has already sent its notification. A story sends one, ever.',
      );
    }
    if (breakingNotifies(a, now)) {
      throw new ConflictException(
        'This is breaking news: readers with breaking alerts on get its notification automatically.',
      );
    }
    if (
      a.firstPublishedAt &&
      now.getTime() - a.firstPublishedAt.getTime() > EDITORS_PICK_WINDOW_MS
    ) {
      throw new BadRequestException(
        'A notification can only go out within 24 hours of a story first going live.',
      );
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        // The campaign is the record; the story itself isn't written, so a
        // live story never shows readers an "Updated" time for this.
        const c = await tx.notificationCampaign.create({
          data: editorsPickCampaign(a, now),
          select: { id: true },
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'news.article.notify',
            entityType: 'NewsArticle',
            entityId: id,
            after: { campaignId: c.id, kind: 'EDITORS_PICK' },
            meta: {
              title: a.title,
              when: 'now',
              audience: 'App readers with breaking alerts on',
            },
            ...client,
          },
          tx,
        );
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'This story’s notification is already on its way.',
        );
      }
      throw err;
    }
    return this.articles.get(actor, id);
  }

  /**
   * The Placement card's notification state on its own, which the portal
   * reads again while a notification is on its way (the article itself
   * isn't reloaded, so nobody's editing is disturbed).
   */
  async notification(actor: StaffPrincipal, id: string) {
    const a = await this.notifyRow(id);
    if (!capabilities(a, actor).read) {
      throw new NotFoundException('Article not found.');
    }
    return notificationView(a, a.pushCampaigns[0] ?? null);
  }

  /** What the notification rules need to know about a story. */
  private async notifyRow(id: string) {
    const a = await this.prisma.newsArticle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        title: true,
        createdById: true,
        isBreaking: true,
        notifyOnPublish: true,
        publishedAt: true,
        firstPublishedAt: true,
        retractedAt: true,
        updatedAt: true,
        assignments: {
          select: { assigneeId: true, role: true, status: true },
        },
        // Its one every-reader push (breaking or an editor's), if any.
        pushCampaigns: NOTIFY_CAMPAIGN_INCLUDE,
      },
    });
    if (!a) throw new NotFoundException('Article not found.');
    return a;
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async move(
    actor: StaffPrincipal,
    id: string,
    expected: number,
    client: ClientInfo,
    m: Move,
  ) {
    const a = await this.articles.loadAccess(id);
    const can = capabilities(a, actor);
    if (!can.read) throw new NotFoundException('Article not found.');
    if (!m.allowed(can)) {
      throw new ForbiddenException(
        m.denied ?? "You can't do that with this article in its current state.",
      );
    }
    m.check?.(a);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.newsArticle.updateMany({
        where: { id, version: expected, status: a.status },
        data: {
          ...(m.to ? { status: m.to } : {}),
          ...(m.data?.(a, now) ?? {}),
          version: { increment: 1 },
        },
      });
      if (res.count === 0) throw new ConflictException(STALE_VERSION);
      if (m.review) {
        await tx.newsReview.create({
          data: {
            articleId: id,
            version: expected + 1,
            reviewerId: actor.staffId,
            decision: m.review.decision,
            comment: m.review.comment?.trim() || null,
          },
        });
      }
      if (m.versionReason) {
        await recordVersion(tx, id, m.versionReason, actor.staffId, {
          force: true,
        });
      }
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: `news.article.${m.action}`,
          entityType: 'NewsArticle',
          entityId: id,
          before: { status: a.status },
          after: { status: m.to ?? a.status },
          ...(m.review?.comment?.trim()
            ? { meta: { comment: m.review.comment.trim() } }
            : m.meta
              ? { meta: m.meta }
              : {}),
          ...client,
        },
        tx,
      );
    });
    await m.after?.(a);
    // Going live, coming down, or a retraction of a live story.
    if (a.status === S.PUBLISHED || m.to === S.PUBLISHED) {
      await this.cache.invalidate(m.action);
    }
    return this.articles.get(actor, id);
  }

  /** What a reader needs before a story can go live. */
  private assertReady(a: ArticleAccessRow) {
    const missing: string[] = [];
    if (!a.categoryId) missing.push('a category');
    if (!a.summary.trim()) missing.push('a summary');
    if (!a.contentText.trim()) missing.push('the story text');
    if (missing.length) {
      const list =
        missing.length === 1
          ? missing[0]
          : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;
      throw new BadRequestException(`Before publishing, add ${list}.`);
    }
  }

  private requireComment(comment: string | undefined, message: string) {
    if (!comment || comment.trim().length < 5)
      throw new BadRequestException(message);
  }

  private signOffDenied(actor: StaffPrincipal, what = 'approve') {
    return has(actor, 'news.publish_own')
      ? `You can't ${what} this article in its current state.`
      : `You can't ${what} this article: either it isn't ready for that, or it's your own work and another editor has to sign it off.`;
  }
}
