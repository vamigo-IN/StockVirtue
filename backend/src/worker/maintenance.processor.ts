import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { StaffChallengeStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.module';

const DAY_MS = 86_400_000;
/// Sign-in codes are useless once expired; failures are in the audit log.
const CHALLENGE_RETENTION_DAYS = 7;
/// Ended sessions stay listed on the security page for a month.
const SESSION_RETENTION_DAYS = 30;

export interface CleanupResult {
  challengesExpired: number;
  challengesDeleted: number;
  sessionsDeleted: number;
}

/**
 * Newsroom housekeeping, run hourly by the worker: expires stale sign-in codes
 * and deletes old codes and ended sessions so those tables stay small.
 */
@Processor(QUEUES.maintenance)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<CleanupResult | void> {
    if (job.name !== 'staff-cleanup') {
      this.logger.warn(`Unknown maintenance job "${job.name}" ignored`);
      return;
    }
    const result = await this.cleanupStaffAuth(new Date());
    this.logger.log(
      `staff-cleanup: ${result.challengesExpired} codes expired, ${result.challengesDeleted} codes and ${result.sessionsDeleted} sessions deleted`,
    );
    return result;
  }

  async cleanupStaffAuth(now: Date): Promise<CleanupResult> {
    const expired = await this.prisma.staffLoginChallenge.updateMany({
      where: { status: StaffChallengeStatus.PENDING, expiresAt: { lte: now } },
      data: { status: StaffChallengeStatus.EXPIRED },
    });
    const challenges = await this.prisma.staffLoginChallenge.deleteMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - CHALLENGE_RETENTION_DAYS * DAY_MS),
        },
      },
    });
    const cutoff = new Date(now.getTime() - SESSION_RETENTION_DAYS * DAY_MS);
    const sessions = await this.prisma.staffSession.deleteMany({
      where: {
        OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
      },
    });
    return {
      challengesExpired: expired.count,
      challengesDeleted: challenges.count,
      sessionsDeleted: sessions.count,
    };
  }
}

/** Registers the repeating jobs when the worker starts (idempotent). */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);

  constructor(@InjectQueue(QUEUES.maintenance) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      'staff-cleanup-hourly',
      { every: 60 * 60 * 1000 },
      {
        name: 'staff-cleanup',
        opts: { removeOnComplete: 50, removeOnFail: 100 },
      },
    );
    this.logger.log('Scheduled staff-cleanup every hour');
  }
}
