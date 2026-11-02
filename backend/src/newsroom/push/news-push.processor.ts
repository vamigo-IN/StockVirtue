import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../../queue/queue.module';
import { NewsPushService } from './news-push.service';

export const PUSH_SWEEP_JOB = 'news-push-sweep';

/** Worker side of news pushes: one job does a sweep (plan, then send). */
@Processor(QUEUES.push)
export class NewsPushProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsPushProcessor.name);

  constructor(private readonly push: NewsPushService) {
    super();
  }

  async process(job: Job) {
    if (job.name === PUSH_SWEEP_JOB) return this.push.sweep();
    this.logger.warn(`Unknown push job "${job.name}" ignored`);
  }
}

/** Every 30 seconds: look for stories to push and send them. */
@Injectable()
export class NewsPushScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NewsPushScheduler.name);

  constructor(@InjectQueue(QUEUES.push) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'news-push-every-30s',
      { every: 30_000 },
      {
        name: PUSH_SWEEP_JOB,
        opts: { removeOnComplete: 20, removeOnFail: 50 },
      },
    );
    this.logger.log('Scheduled the news push sweep every 30 seconds');
  }
}
