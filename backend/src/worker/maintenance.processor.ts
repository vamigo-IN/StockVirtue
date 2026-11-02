import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MediaStatus, StaffChallengeStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUES } from '../queue/queue.module';
import { incomingKey } from '../storage/media-keys';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 86_400_000;
/// Sign-in codes are useless once expired; failures are in the audit log.
const CHALLENGE_RETENTION_DAYS = 7;
/// Ended sessions stay listed on the security page for a month.
const SESSION_RETENTION_DAYS = 30;
/// An upload not completed within a day was abandoned (tab closed mid-way).
const ABANDONED_UPLOAD_HOURS = 24;

export interface CleanupResult {
  challengesExpired: number;
  challengesDeleted: number;
  sessionsDeleted: number;
}

/**
 * Newsroom housekeeping, run hourly by the worker: expires stale sign-in codes
 * and deletes old codes and ended sessions so those tables stay small, and
 * removes abandoned uploads so they don't fill the server's disk.
 */
@Processor(QUEUES.maintenance)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job): Promise<CleanupResult | number | void> {
    if (job.name === 'media-cleanup') {
      const removed = await this.cleanupUploads(new Date());
      if (removed) {
        this.logger.log(`media-cleanup: ${removed} abandoned uploads removed`);
      }
      return removed;
    }
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

  /** Uploads started but never completed: their bytes go, the row is closed. */
  async cleanupUploads(now: Date): Promise<number> {
    const stale = await this.prisma.mediaAsset.findMany({
      where: {
        status: MediaStatus.PENDING,
        createdAt: {
          lt: new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 3_600_000),
        },
      },
      select: { id: true, store: true },
      take: 500,
    });
    let removed = 0;
    for (const a of stale) {
      try {
        await this.storage.delete(a.store, incomingKey(a.id));
      } catch (err) {
        // Kept PENDING, so the next run tries again.
        this.logger.warn(
          `Couldn't remove upload ${a.id}: ${(err as Error).message}`,
        );
        continue;
      }
      await this.prisma.mediaAsset.update({
        where: { id: a.id },
        data: { status: MediaStatus.DELETED },
      });
      removed++;
    }
    return removed;
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
    await this.queue.upsertJobScheduler(
      'media-cleanup-hourly',
      { every: 60 * 60 * 1000 },
      {
        name: 'media-cleanup',
        opts: { removeOnComplete: 50, removeOnFail: 100 },
      },
    );
    this.logger.log('Scheduled staff-cleanup and media-cleanup every hour');
  }
}
