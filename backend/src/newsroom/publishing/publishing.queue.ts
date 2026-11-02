import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../queue/queue.module';

export const PUBLISH_JOB = 'publish-due';
export const SWEEP_JOB = 'publish-sweep';

/** One job per article and time, so rescheduling never duplicates. */
export const publishJobId = (articleId: string, at: Date) =>
  `publish-${articleId}-${at.getTime()}`;

/**
 * The API's side of scheduled publishing: it queues a delayed job that the
 * worker runs at the scheduled time. A queue hiccup is not fatal, because the
 * worker's one-minute sweep publishes anything that is due regardless.
 */
@Injectable()
export class PublishingQueue {
  private readonly logger = new Logger(PublishingQueue.name);

  constructor(@InjectQueue(QUEUES.publishing) private readonly queue: Queue) {}

  async enqueue(articleId: string, at: Date): Promise<void> {
    try {
      await this.queue.add(
        PUBLISH_JOB,
        { articleId },
        {
          jobId: publishJobId(articleId, at),
          delay: Math.max(0, at.getTime() - Date.now()),
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Couldn't queue publishing for ${articleId}; the sweep will publish it: ${(err as Error).message}`,
      );
    }
  }

  async cancel(articleId: string, at: Date | null): Promise<void> {
    if (!at) return;
    try {
      const job = await this.queue.getJob(publishJobId(articleId, at));
      await job?.remove();
    } catch (err) {
      // Harmless: a stray job finds the article no longer scheduled.
      this.logger.warn(
        `Couldn't remove the publishing job for ${articleId}: ${(err as Error).message}`,
      );
    }
  }
}
