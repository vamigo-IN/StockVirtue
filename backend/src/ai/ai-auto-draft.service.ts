import { Injectable, Logger } from '@nestjs/common';
import {
  AiTask,
  NewsItemStatus,
  NewsSourceUsage,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { draftBlocked, draftInput } from './ai-inputs';
import { AiQueue } from './ai-queue';
import { AiSettingsService } from './ai-settings.service';
import { taskDef } from './ai-tasks';

/** Drafts queued from one fetch at most, so a busy feed can't run up a bill. */
const MAX_PER_FETCH = 5;

/**
 * Step 7 of ingestion: an AI-assisted draft, where permitted. Runs only when
 * the assistant is on, automatic drafting is switched on, the source's terms
 * allow AI drafts and the month's budget isn't spent. The draft is stored on
 * the item for a person to read; it never becomes a story by itself.
 */
@Injectable()
export class AiAutoDraftService {
  private readonly logger = new Logger(AiAutoDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly queue: AiQueue,
  ) {}

  async queueFor(itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0;
    const ready = await this.settings.readiness();
    if (
      !ready.ok ||
      !ready.autoDraft ||
      ready.disabledTasks.includes(AiTask.DRAFT_FROM_SOURCE)
    ) {
      return 0;
    }
    if (
      ready.monthlyBudgetUsd != null &&
      (await this.settings.monthSpend()) >= ready.monthlyBudgetUsd
    ) {
      this.logger.log('Monthly AI budget reached: no automatic drafts');
      return 0;
    }
    const items = await this.prisma.newsSourceItem.findMany({
      where: {
        id: { in: itemIds },
        status: NewsItemStatus.NEW,
        allowAiDrafts: true,
        usage: { not: NewsSourceUsage.HEADLINE_ONLY },
      },
      include: { source: { select: { name: true } } },
      orderBy: { publishedAt: 'desc' },
      take: MAX_PER_FETCH,
    });
    const def = taskDef(AiTask.DRAFT_FROM_SOURCE);
    let queued = 0;
    for (const item of items) {
      if (draftBlocked(item)) continue;
      const job = await this.prisma.aiJob.create({
        data: {
          task: AiTask.DRAFT_FROM_SOURCE,
          promptId: def.promptId,
          promptVersion: def.version,
          input: draftInput(item) as unknown as Prisma.InputJsonValue,
          sourceItemId: item.id,
        },
      });
      await this.queue.enqueue(job.id);
      queued++;
    }
    return queued;
  }
}
