import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../queue/queue.module';
import { ArticlePublisher } from './article-publisher';
import { PUBLISH_JOB, SWEEP_JOB } from './publishing.queue';

/** Worker side of scheduled publishing. */
@Processor(QUEUES.publishing)
export class PublishingProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishingProcessor.name);

  constructor(private readonly publisher: ArticlePublisher) {
    super();
  }

  async process(job: Job<{ articleId?: string }>) {
    if (job.name === PUBLISH_JOB && job.data.articleId) {
      return {
        published: await this.publisher.publishScheduled(job.data.articleId),
      };
    }
    if (job.name === SWEEP_JOB) {
      const published = await this.publisher.publishDue();
      if (published > 0) {
        this.logger.log(`Sweep published ${published} overdue article(s)`);
      }
      return { published };
    }
    this.logger.warn(`Unknown publishing job "${job.name}" ignored`);
  }
}

/** The safety sweep: every minute, publish anything that is due. */
@Injectable()
export class PublishingScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublishingScheduler.name);

  constructor(@InjectQueue(QUEUES.publishing) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'publish-sweep-every-minute',
      { every: 60_000 },
      { name: SWEEP_JOB, opts: { removeOnComplete: 20, removeOnFail: 50 } },
    );
    this.logger.log('Scheduled the publishing sweep every minute');
  }
}
