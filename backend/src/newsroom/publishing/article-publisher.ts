import { Injectable, Logger } from '@nestjs/common';
import { NewsStatus, NewsVersionReason } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { recordVersion } from '../articles/article-versions';
import { NewsCache } from '../public/news-cache';

/// The delayed job may fire a moment before the scheduled second.
const EARLY_GRACE_MS = 2_000;

/**
 * Publishes scheduled articles. Runs in the worker (src/worker.ts) from a
 * delayed job per article plus a one-minute sweep that catches anything a
 * job missed (Redis restart, worker down). Needs only the database, so the
 * worker never loads trading modules. Safe to run twice for one article.
 */
@Injectable()
export class ArticlePublisher {
  private readonly logger = new Logger(ArticlePublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: NewsCache,
  ) {}

  /** Every scheduled article whose time has come. */
  async publishDue(now = new Date()): Promise<number> {
    const due = await this.prisma.newsArticle.findMany({
      where: {
        status: NewsStatus.SCHEDULED,
        scheduledAt: { lte: new Date(now.getTime() + EARLY_GRACE_MS) },
      },
      orderBy: { scheduledAt: 'asc' },
      select: { id: true },
      take: 100,
    });
    let published = 0;
    for (const { id } of due) {
      if (await this.publishScheduled(id, now)) published++;
    }
    return published;
  }

  /** One article, if it is still scheduled and due. */
  async publishScheduled(id: string, now = new Date()): Promise<boolean> {
    const published = await this.prisma.$transaction(async (tx) => {
      const a = await tx.newsArticle.findUnique({
        where: { id },
        select: { status: true, scheduledAt: true, firstPublishedAt: true },
      });
      if (
        !a ||
        a.status !== NewsStatus.SCHEDULED ||
        !a.scheduledAt ||
        a.scheduledAt.getTime() > now.getTime() + EARLY_GRACE_MS
      ) {
        return false;
      }
      // Readers see when it actually went live, even if the worker was late.
      const res = await tx.newsArticle.updateMany({
        where: { id, status: NewsStatus.SCHEDULED },
        data: {
          status: NewsStatus.PUBLISHED,
          publishedAt: now,
          firstPublishedAt: a.firstPublishedAt ?? now,
          scheduledAt: null,
          version: { increment: 1 },
        },
      });
      if (res.count === 0) return false;
      await recordVersion(tx, id, NewsVersionReason.PUBLISH, null, {
        force: true,
      });
      await this.audit.record(
        {
          actor: { userId: null, email: 'scheduler' },
          action: 'news.article.publish',
          entityType: 'NewsArticle',
          entityId: id,
          before: { status: NewsStatus.SCHEDULED },
          after: { status: NewsStatus.PUBLISHED },
          meta: {
            scheduledFor: a.scheduledAt.toISOString(),
            lateBySeconds: Math.max(
              0,
              Math.round((now.getTime() - a.scheduledAt.getTime()) / 1000),
            ),
          },
        },
        tx,
      );
      return true;
    });
    if (published) {
      this.logger.log(`Published scheduled article ${id}`);
      await this.cache.invalidate('scheduled publish');
    }
    return published;
  }
}
