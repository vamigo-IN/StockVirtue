import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QUEUES } from '../queue/queue.module';
import { AI_RUN_JOB, AI_SWEEP_JOB } from './ai-queue';
import { AiRunner } from './ai-runner.service';

/** Worker side of the AI assistant. Two at a time: requests are slow, not CPU-bound. */
@Processor(QUEUES.ai, { concurrency: 2 })
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(private readonly runner: AiRunner) {
    super();
  }

  async process(job: Job<{ jobId?: string }>) {
    if (job.name === AI_RUN_JOB && job.data.jobId) {
      return { status: await this.runner.run(job.data.jobId) };
    }
    if (job.name === AI_SWEEP_JOB) {
      const res = await this.runner.sweep();
      if (res.stuck)
        this.logger.warn(`Marked ${res.stuck} stuck AI job(s) failed`);
      return res;
    }
    this.logger.warn(`Unknown AI job "${job.name}" ignored`);
  }
}

@Injectable()
export class AiScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiScheduler.name);

  constructor(@InjectQueue(QUEUES.ai) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'ai-sweep-every-5-minutes',
      { every: 5 * 60_000 },
      { name: AI_SWEEP_JOB, opts: { removeOnComplete: 20, removeOnFail: 50 } },
    );
    this.logger.log('Scheduled the AI housekeeping sweep every 5 minutes');
  }
}
