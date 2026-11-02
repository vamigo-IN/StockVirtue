import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { NewsFetchTrigger } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { IngestService } from './ingest.service';
import {
  CLEANUP_JOB,
  FETCH_JOB,
  FetchJobData,
  SWEEP_JOB,
} from './ingest.queue';

/** Worker side of ingestion. Four sources at a time: fetches wait on the network. */
@Processor(QUEUES.ingest, { concurrency: 4 })
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(
    private readonly ingest: IngestService,
    @InjectQueue(QUEUES.ingest) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job<FetchJobData>) {
    if (job.name === FETCH_JOB) {
      return this.ingest.run(job.data.sourceId, job.data.trigger, {
        requestedBy: job.data.requestedBy,
        retryOfId: job.data.retryOfId,
      });
    }
    if (job.name === SWEEP_JOB) {
      const due = await this.ingest.claimDue();
      for (const sourceId of due) {
        await this.queue.add(
          FETCH_JOB,
          { sourceId, trigger: NewsFetchTrigger.SCHEDULE },
          {
            jobId: `fetch-${sourceId}-${Date.now()}`,
            attempts: 1,
            removeOnComplete: 200,
            removeOnFail: 200,
          },
        );
      }
      return { queued: due.length };
    }
    if (job.name === CLEANUP_JOB) {
      const res = await this.ingest.cleanup();
      this.logger.log(
        `ingest-cleanup: ${res.logs} fetch logs and ${res.items} old items removed`,
      );
      return res;
    }
    this.logger.warn(`Unknown ingest job "${job.name}" ignored`);
  }
}

/** The polling sweep every minute, and retention every six hours. */
@Injectable()
export class IngestScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestScheduler.name);

  constructor(@InjectQueue(QUEUES.ingest) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'ingest-sweep-every-minute',
      { every: 60_000 },
      { name: SWEEP_JOB, opts: { removeOnComplete: 20, removeOnFail: 50 } },
    );
    await this.queue.upsertJobScheduler(
      'ingest-cleanup-every-6-hours',
      { every: 6 * 60 * 60_000 },
      { name: CLEANUP_JOB, opts: { removeOnComplete: 20, removeOnFail: 50 } },
    );
    this.logger.log('Scheduled source polling every minute');
  }
}
