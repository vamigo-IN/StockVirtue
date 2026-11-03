import { Injectable, Logger } from '@nestjs/common';
import { PrivacyRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountErasureService } from './account-erasure.service';
import { RETENTION } from './privacy.constants';

export interface RetentionResult {
  accountsErased: number;
  inactiveNoticed: number;
  inactiveDeleted: number;
  contactMessages: number;
  notifications: number;
  deviceTokens: number;
  staffInvitations: number;
  auditLog: number;
  visitorConsents: number;
  closedRequests: number;
  adminSecurity: number;
}

/**
 * The retention schedule (DPDP Act s.8(7): personal data is erased once its
 * purpose is served). Run daily by the worker: erases deleted accounts whose
 * year is up, warns and then erases long-unused accounts, and removes each
 * kind of record once its period in RETENTION has passed. Request logs and
 * abuse events are pruned by the monitoring jobs; staff sign-in records by
 * the staff cleanup.
 */
@Injectable()
export class PrivacyRetentionService {
  private readonly logger = new Logger(PrivacyRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly erasure: AccountErasureService,
  ) {}

  async sweep(now = new Date()): Promise<RetentionResult> {
    const before = (ms: number) => new Date(now.getTime() - ms);
    const accountsErased = await this.erasure.eraseDue(now);
    const inactive = await this.erasure.sweepInactive(now);

    const contact = before(RETENTION.contactMessages);
    const [
      contactMessages,
      notifications,
      deviceTokens,
      staffInvitations,
      auditLog,
      visitorConsents,
      closedRequests,
    ] = await Promise.all([
      this.prisma.contactMessage.deleteMany({
        where: {
          createdAt: { lt: contact },
          OR: [{ repliedAt: null }, { repliedAt: { lt: contact } }],
        },
      }),
      this.prisma.notification.deleteMany({
        where: { createdAt: { lt: before(RETENTION.notifications) } },
      }),
      this.prisma.deviceToken.deleteMany({
        where: { lastSeenAt: { lt: before(RETENTION.deviceTokens) } },
      }),
      this.prisma.staffInvitation.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: before(RETENTION.staffInvitations) } },
            { acceptedAt: { lt: before(RETENTION.staffInvitations) } },
            { revokedAt: { lt: before(RETENTION.staffInvitations) } },
          ],
        },
      }),
      this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: before(RETENTION.auditLog) } },
      }),
      this.prisma.consentRecord.deleteMany({
        where: {
          userId: null,
          createdAt: { lt: before(RETENTION.visitorConsents) },
        },
      }),
      this.prisma.privacyRequest.deleteMany({
        where: {
          status: {
            in: [PrivacyRequestStatus.RESOLVED, PrivacyRequestStatus.REJECTED],
          },
          updatedAt: { lt: before(RETENTION.closedRequests) },
        },
      }),
    ]);

    const admin = before(RETENTION.adminSecurity);
    const adminSecurity = (
      await Promise.all([
        this.prisma.adminLoginSession.deleteMany({
          where: { createdAt: { lt: admin } },
        }),
        this.prisma.adminSession.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: admin } }, { revokedAt: { lt: admin } }],
          },
        }),
        this.prisma.adminDevice.deleteMany({
          where: { lastSeenAt: { lt: admin } },
        }),
      ])
    ).reduce((n, r) => n + r.count, 0);

    const result: RetentionResult = {
      accountsErased,
      inactiveNoticed: inactive.noticed,
      inactiveDeleted: inactive.deleted,
      contactMessages: contactMessages.count,
      notifications: notifications.count,
      deviceTokens: deviceTokens.count,
      staffInvitations: staffInvitations.count,
      auditLog: auditLog.count,
      visitorConsents: visitorConsents.count,
      closedRequests: closedRequests.count,
      adminSecurity,
    };
    const total = (Object.values(result) as number[]).reduce(
      (a, b) => a + b,
      0,
    );
    if (total) this.logger.log(`privacy-retention: ${JSON.stringify(result)}`);
    return result;
  }
}
