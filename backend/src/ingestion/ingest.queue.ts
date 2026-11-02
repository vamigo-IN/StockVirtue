import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { NewsFetchTrigger } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUES } from '../queue/queue.module';

export const FETCH_JOB = 'fetch-source';
export const SWEEP_JOB = 'ingest-sweep';
export const CLEANUP_JOB = 'ingest-cleanup';

export interface FetchJobData {
  sourceId: string;
  trigger: NewsFetchTrigger;
  requestedBy?: string;
  retryOfId?: string;
}

/** The API's side of ingestion: Fetch now and Retry hand the work to the worker. */
@Injectable()
export class IngestQueue {
  constructor(@InjectQueue(QUEUES.ingest) private readonly queue: Queue) {}

  async fetch(data: FetchJobData): Promise<void> {
    try {
      await this.queue.add(FETCH_JOB, data, {
        jobId: `fetch-${data.sourceId}-${Date.now()}`,
        attempts: 1,
        removeOnComplete: 200,
        removeOnFail: 200,
      });
    } catch {
      throw new ServiceUnavailableException(
        'The fetch couldn’t be queued. Try again in a moment.',
      );
    }
  }
}
