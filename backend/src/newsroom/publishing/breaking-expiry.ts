import { Injectable, Logger } from '@nestjs/common';
import { NewsStatus } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BREAKING_HOURS,
  breakingEndedWhere,
  breakingSince,
  breakingUntil,
} from '../breaking';
import { NewsCache } from '../public/news-cache';

export const BREAKING_EXPIRY_JOB = 'breaking-expiry';
/// How often the worker looks for breaking stories whose 24 hours are up.
export const BREAKING_EXPIRY_EVERY_MS = 2 * 60_000;
/// Stories switched off per run; any more wait for the next run.
const BATCH = 200;

/**
 * Turns the Breaking switch off on stories whose 24 hours are up (owner,
 * 6 Nov 2026). Readers stop seeing the label at that moment anyway (the
 * public API and the website check the time themselves); this makes the
 * stored flag and the newsroom's switch agree, and refreshes the API's
 * cache and the website's pages that were cached with the label on. Runs in
 * the worker every two minutes (publishing.processor.ts) and is safe to run
 * twice or while an editor works: a story re-marked or edited after it was
 * read is left for the next run.
 *
 * Like the switch, it doesn't change the story: no new version, and its
 * updated time is kept, so bylines don't start saying "Updated".
 */
@Injectable()
export class BreakingExpiry {
  private readonly logger = new Logger(BreakingExpiry.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: NewsCache,
  ) {}

  /** Switches off every story whose breaking time is over; returns how many. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.newsArticle.findMany({
      where: breakingEndedWhere(now),
      orderBy: [{ breakingAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        status: true,
        isBreaking: true,
        breakingAt: true,
        publishedAt: true,
        updatedAt: true,
      },
      take: BATCH,
    });
    let expired = 0;
    let readersSawIt = false;
    for (const a of due) {
      const since = breakingSince(a);
      const until = breakingUntil(a);
      const done = await this.prisma.$transaction(async (tx) => {
        const res = await tx.newsArticle.updateMany({
          where: {
            AND: [
              breakingEndedWhere(now),
              // Unchanged since it was read: not re-marked, not edited.
              { id: a.id, breakingAt: a.breakingAt, updatedAt: a.updatedAt },
            ],
          },
          data: { isBreaking: false, breakingAt: null, updatedAt: a.updatedAt },
        });
        if (res.count === 0) return false;
        await this.audit.record(
          {
            actor: { userId: null, email: 'scheduler' },
            action: 'news.article.breaking_expired',
            entityType: 'NewsArticle',
            entityId: a.id,
            before: {
              isBreaking: true,
              breakingAt: since?.toISOString() ?? null,
            },
            after: { isBreaking: false, breakingAt: null },
            meta: {
              hours: BREAKING_HOURS,
              endedAt: until?.toISOString() ?? null,
            },
          },
          tx,
        );
        return true;
      });
      if (!done) continue;
      expired++;
      if (a.status === NewsStatus.PUBLISHED) readersSawIt = true;
    }
    if (expired > 0) {
      this.logger.log(
        `Breaking label ended on ${expired} ${expired === 1 ? 'story' : 'stories'} after ${BREAKING_HOURS} hours`,
      );
    }
    // Pages and responses cached while the label was on refresh now.
    if (readersSawIt) await this.cache.invalidate('breaking expired');
    return expired;
  }
}
