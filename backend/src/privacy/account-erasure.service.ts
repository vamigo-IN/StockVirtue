import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlertStatus,
  OrderStatus,
  Prisma,
  PrivacyRequestStatus,
  PrivacyRequestType,
  UserStatus,
} from '@prisma/client';
import { AuditActor, AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PrivacyMail } from './privacy-mail';
import { DELETED_RETENTION_MS, INACTIVITY_NOTICE_MS } from './privacy.constants';
import { PrivacyService } from './privacy.service';
import { newRequestReference } from './privacy-reference';

export type ErasureSource = 'self' | 'inactivity' | 'staff';

/** What identified a deleted account, kept locked for the retention year. */
interface RetainedIdentity {
  email: string | null;
  phone: string | null;
  displayName: string | null;
  firebaseUid: string | null;
  avatarUrl: string | null;
}

/** Most accounts handled per run of each sweep. */
const BATCH = 200;
const YEAR_MS = 365 * 86_400_000;

/**
 * Account deletion (the right to erasure, DPDP Act s.12; withdrawing consent,
 * s.6(4)). Deleting stops all use at once: no sign-in, no pushes or emails,
 * nothing shown to anyone, the Firebase sign-in identity removed. The DPDP
 * Rules (rule 8(3)) then ask for the personal data and logs of processing to
 * be kept for a year, so the account stays as a locked, hidden copy until
 * `eraseAfter` and is then removed for good with everything it owns.
 *
 * Also erases accounts nobody has used for `PRIVACY_INACTIVE_YEARS` years,
 * after an email at least 48 hours ahead (rule 8(2)); signing in cancels it.
 */
@Injectable()
export class AccountErasureService {
  private readonly logger = new Logger(AccountErasureService.name);
  private readonly mailer: PrivacyMail;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly firebase: FirebaseAdminService,
    private readonly audit: AuditService,
    private readonly privacy: PrivacyService,
    private readonly config: ConfigService<AppConfig, true>,
    mail: MailService,
  ) {
    this.mailer = new PrivacyMail(mail, () => this.privacy.contact());
  }

  async deleteAccount(
    userId: string,
    opts: {
      source: ErasureSource;
      actor?: AuditActor;
      reason?: string;
      /** The privacy request this fulfils, if any. */
      requestId?: string;
      ip?: string | null;
      userAgent?: string | null;
    },
  ): Promise<{ deleted: true; eraseAfter: Date }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { staffProfile: { select: { id: true } } },
    });
    if (!user) throw new NotFoundException('That account no longer exists.');
    if (user.status === UserStatus.DELETED) {
      return { deleted: true, eraseAfter: user.eraseAfter ?? new Date() };
    }
    if (user.staffProfile) {
      throw new ConflictException(
        'This account belongs to a member of the newsroom staff. Their newsroom access has to be removed by a Super Admin before the account can be deleted.',
      );
    }
    const now = new Date();
    const eraseAfter = new Date(now.getTime() + DELETED_RETENTION_MS);
    const identity: RetainedIdentity = {
      email: user.emailAlias,
      phone: user.phone,
      displayName: user.displayName,
      firebaseUid: user.firebaseUid,
      avatarUrl: user.avatarUrl,
    };
    const note =
      opts.source === 'inactivity'
        ? 'Deleted automatically: the account was not used for a long time and the person did not sign in after the 48-hour notice.'
        : opts.source === 'staff'
          ? 'Deleted by the privacy team on request.'
          : 'Deleted by the account holder in the app.';

    await this.prisma.$transaction(async (tx) => {
      // Hidden and unusable at once; the identifiers move aside so the same
      // email or number can sign up again.
      await tx.user.update({
        where: { id: userId },
        data: {
          status: UserStatus.DELETED,
          deletionRequestedAt: now,
          eraseAfter,
          retainedIdentity: identity as unknown as Prisma.InputJsonValue,
          emailAlias: null,
          phone: null,
          firebaseUid: null,
          passwordHash: null,
          avatarUrl: null,
          displayName: 'Deleted account',
          referralCode: null,
          tradeEmailsOptIn: false,
          analyticsConsent: false,
          inactivityNoticeAt: null,
        },
      });
      // Nothing keeps running for them: pushes, alerts, waiting orders.
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.priceAlert.updateMany({
        where: { userId, status: AlertStatus.ACTIVE },
        data: { status: AlertStatus.CANCELLED },
      });
      await tx.order.updateMany({
        where: { userId, status: OrderStatus.PENDING },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.leaderboardEntry.deleteMany({ where: { userId } });
      await tx.privacyNominee.deleteMany({ where: { userId } });
      await tx.consentRecord.create({
        data: {
          userId,
          // The version the person accepted, even when they delete from
          // the notice gate (W7 addendum §5.4 row 9).
          noticeVersion:
            user.noticeVersion ?? this.privacy.currentNoticeVersion(),
          refused: ['account', 'analytics'],
          source:
            opts.source === 'self'
              ? 'app.delete'
              : opts.source === 'staff'
                ? 'staff'
                : 'automation',
        },
      });
      // Every erasure is in the request register, answered.
      if (opts.requestId) {
        await tx.privacyRequest.update({
          where: { id: opts.requestId },
          data: {
            status: PrivacyRequestStatus.RESOLVED,
            respondedAt: now,
            response: `Your account was deleted on ${now.toISOString().slice(0, 10)}. A locked copy is kept for one year as the law requires, then erased for good.`,
          },
        });
      } else {
        await tx.privacyRequest.create({
          data: {
            reference: await newRequestReference(tx),
            userId,
            name: identity.displayName,
            email: identity.email,
            phone: identity.phone,
            type: PrivacyRequestType.ERASURE,
            details: opts.reason?.trim() || note,
            channel: opts.source === 'self' ? 'app' : 'staff',
            status: PrivacyRequestStatus.RESOLVED,
            dueAt: now,
            response: note,
            respondedAt: now,
          },
        });
      }
      await this.audit.record(
        {
          actor: opts.actor ?? {
            userId: opts.source === 'self' ? userId : null,
            email:
              opts.source === 'self'
                ? identity.email
                : `automation (${opts.source})`,
          },
          action: 'privacy.account.delete',
          entityType: 'User',
          entityId: userId,
          after: {
            source: opts.source,
            eraseAfter: eraseAfter.toISOString(),
          },
          ip: opts.ip ?? null,
          userAgent: opts.userAgent ?? null,
        },
        tx,
      );
    });

    // Signed out everywhere, and the Firebase sign-in identity removed.
    const keys = await this.redis.client.keys(`refresh:${userId}:*`);
    if (keys.length) await this.redis.client.del(...keys);
    if (identity.firebaseUid && this.firebase.configured) {
      try {
        await this.firebase.auth().deleteUser(identity.firebaseUid);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'auth/user-not-found') {
          this.logger.warn(
            `Couldn't remove the Firebase user of ${userId}: ${(err as Error).message}`,
          );
        }
      }
    }
    if (identity.email) {
      await this.mailer
        .accountDeleted(identity.email, {
          name: identity.displayName,
          eraseAfter,
        })
        .catch((err: Error) =>
          this.logger.warn(`Deletion email failed: ${err.message}`),
        );
    }
    return { deleted: true, eraseAfter };
  }

  /** Deleted accounts whose year is up: removed with everything they own. */
  async eraseDue(now = new Date()): Promise<number> {
    const due = await this.prisma.user.findMany({
      where: { status: UserStatus.DELETED, eraseAfter: { lte: now } },
      select: { id: true },
      orderBy: { eraseAfter: 'asc' },
      take: BATCH,
    });
    let erased = 0;
    for (const { id } of due) {
      try {
        await this.prisma.user.delete({ where: { id } });
        erased++;
      } catch (err) {
        this.logger.error(
          `Couldn't erase deleted account ${id}: ${(err as Error).message}`,
        );
      }
    }
    return erased;
  }

  /**
   * Accounts unused for the configured number of years: an email first, then
   * erasure 48 hours later unless they signed in. Staff accounts, and
   * accounts with no email to warn, are left alone.
   */
  async sweepInactive(now = new Date()) {
    const years = this.config.get('privacy', { infer: true }).inactiveYears;
    if (!years) return { noticed: 0, deleted: 0 };
    const cutoff = new Date(now.getTime() - years * YEAR_MS);
    const unused: Prisma.UserWhereInput = {
      status: UserStatus.ACTIVE,
      staffProfile: { is: null },
      OR: [
        { lastLoginAt: { lt: cutoff } },
        { lastLoginAt: null, createdAt: { lt: cutoff } },
      ],
    };
    const toWarn = await this.prisma.user.findMany({
      where: { ...unused, inactivityNoticeAt: null, emailAlias: { not: null } },
      select: { id: true, emailAlias: true, displayName: true },
      take: BATCH,
    });
    let noticed = 0;
    for (const u of toWarn) {
      try {
        await this.mailer.inactivityNotice(u.emailAlias!, {
          name: u.displayName,
          eraseAt: new Date(now.getTime() + INACTIVITY_NOTICE_MS),
        });
        await this.prisma.user.update({
          where: { id: u.id },
          data: { inactivityNoticeAt: now },
        });
        noticed++;
      } catch (err) {
        this.logger.warn(
          `Inactivity notice to ${u.id} failed: ${(err as Error).message}`,
        );
      }
    }
    const due = await this.prisma.user.findMany({
      where: {
        ...unused,
        inactivityNoticeAt: {
          lte: new Date(now.getTime() - INACTIVITY_NOTICE_MS),
        },
      },
      select: { id: true },
      take: BATCH,
    });
    let deleted = 0;
    for (const { id } of due) {
      try {
        await this.deleteAccount(id, { source: 'inactivity' });
        deleted++;
      } catch (err) {
        this.logger.warn(
          `Inactive account ${id} not deleted: ${(err as Error).message}`,
        );
      }
    }
    return { noticed, deleted };
  }
}
