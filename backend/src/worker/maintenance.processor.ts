import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { MediaStatus, MediaStore, StaffChallengeStatus } from '@prisma/client';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyRetentionService } from '../privacy/privacy-retention.service';
import { QUEUES } from '../queue/queue.module';
import { incomingKey } from '../storage/media-keys';
import { StorageService } from '../storage/storage.service';

const DAY_MS = 86_400_000;
/// Sign-in attempts (who, from where) and ended sessions are logs of access
/// to personal data: kept a year, then deleted (DPDP Rules 2025, rules
/// 6(1)(e) and 8(3)).
const CHALLENGE_RETENTION_DAYS = 365;
const SESSION_RETENTION_DAYS = 365;
/// An upload not completed within a day was abandoned (tab closed mid-way).
const ABANDONED_UPLOAD_HOURS = 24;

export interface CleanupResult {
  challengesExpired: number;
  challengesDeleted: number;
  sessionsDeleted: number;
}

/**
 * Housekeeping, run by the worker: hourly, expires stale sign-in codes,
 * deletes sign-in records and ended sessions after a year and removes
 * abandoned uploads; daily, the privacy retention sweep (deleted and unused
 * accounts, and every other record past its retention period).
 */
@Processor(QUEUES.maintenance)
export class MaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(MaintenanceProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly retention: PrivacyRetentionService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'privacy-retention') {
      return this.retention.sweep(new Date());
    }
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
    const cutoff = new Date(now.getTime() - ABANDONED_UPLOAD_HOURS * 3_600_000);
    const stale = await this.prisma.mediaAsset.findMany({
      where: { status: MediaStatus.PENDING, createdAt: { lt: cutoff } },
      select: { id: true, store: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    let removed = 0;
    for (const a of stale) {
      try {
        await this.storage.delete(a.store, incomingKey(a.id));
      } catch (err) {
        // With no R2 connection at all the file can't be reached (an R2
        // lifecycle rule clears it); otherwise the next run tries again.
        const unreachable =
          a.store === MediaStore.R2 && !(await this.storage.connection()).r2;
        if (!unreachable) {
          this.logger.warn(
            `Couldn't remove upload ${a.id}: ${(err as Error).message}`,
          );
          continue;
        }
      }
      await this.prisma.mediaAsset.update({
        where: { id: a.id },
        data: { status: MediaStatus.DELETED },
      });
      removed++;
    }
    // Leftovers of interrupted writes on this server's disk.
    const swept = await this.storage.local.sweep('incoming', cutoff);
    if (swept) this.logger.log(`media-cleanup: ${swept} stale files removed`);
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
    // 03:30 IST, after the night's settlement jobs.
    await this.queue.upsertJobScheduler(
      'privacy-retention-daily',
      { pattern: '0 22 * * *', tz: 'UTC' },
      {
        name: 'privacy-retention',
        opts: { removeOnComplete: 30, removeOnFail: 60 },
      },
    );
    this.logger.log(
      'Scheduled staff-cleanup and media-cleanup every hour, privacy-retention daily',
    );
  }
}
