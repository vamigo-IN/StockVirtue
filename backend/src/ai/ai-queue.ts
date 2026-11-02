import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { AiJobStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.module';

export const AI_RUN_JOB = 'run';
export const AI_SWEEP_JOB = 'ai-sweep';

/** Hands AI jobs to the worker. The job row is the source of truth; the queue only wakes the worker. */
@Injectable()
export class AiQueue {
  private readonly logger = new Logger(AiQueue.name);

  constructor(
    @InjectQueue(QUEUES.ai) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(jobId: string): Promise<void> {
    try {
      await this.queue.add(
        AI_RUN_JOB,
        { jobId },
        {
          jobId: `ai-${jobId}`,
          attempts: 1,
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
    } catch (err) {
      this.logger.warn(
        `Couldn't queue AI job ${jobId}: ${(err as Error).message}`,
      );
      await this.prisma.aiJob.updateMany({
        where: { id: jobId, status: AiJobStatus.QUEUED },
        data: {
          status: AiJobStatus.FAILED,
          error: 'The request couldn’t be queued. Try again in a moment.',
          finishedAt: new Date(),
        },
      });
    }
  }
}
