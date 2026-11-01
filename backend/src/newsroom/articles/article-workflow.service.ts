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
import { PublishingQueue } from '../publishing/publishing.queue';
import { ArticleCapabilities, capabilities, has } from './article-access';
import { recordVersion } from './article-versions';
import {
  ArticleAccessRow,
  ArticlesService,
  STALE_VERSION,
} from './articles.service';

const S = NewsStatus;

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

const IST_DATE = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

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

  /** A public, dated correction note on a live story (its text is saved first). */
  correct(
    actor: StaffPrincipal,
    id: string,
    version: number,
    note: string,
    client: ClientInfo,
  ) {
    return this.move(actor, id, version, client, {
      action: 'correct',
      allowed: (c) => c.correct,
      data: (a, now) => {
        const line = `${IST_DATE.format(now)}: ${note.trim()}`;
        return {
          correctionNote: a.correctionNote
            ? `${a.correctionNote}\n${line}`
            : line,
        };
      },
      versionReason: NewsVersionReason.CORRECTION,
      meta: { note: note.trim() },
    });
  }

  /** Retracted stories stay public with the retraction notice (transparency). */
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
   * bump the version (and never interrupt someone editing it).
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
        ? { isBreaking: flags.isBreaking }
        : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.newsArticle.update({ where: { id }, data });
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
    return this.articles.get(actor, id);
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
