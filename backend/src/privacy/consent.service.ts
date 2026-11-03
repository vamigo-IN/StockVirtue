import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PRIVACY_NOTICE_VERSION } from './privacy.constants';

/** What the app sends when someone accepts the privacy notice. */
export interface NoticeAcceptance {
  noticeVersion: string;
  /** They confirmed being 18 or older. */
  adult: boolean;
  /** Optional: app usage analytics. */
  analytics?: boolean;
}

/** Where a decision was made (kept with it as proof). */
export type ConsentSource =
  | 'app.signup'
  | 'app.notice'
  | 'app.settings'
  | 'app.delete'
  | 'staff'
  | 'automation';

/**
 * Consent for app accounts (DPDP Act s.6): the notice version a person
 * accepted, their 18+ confirmation and the optional analytics purpose, each
 * decision kept as a ConsentRecord so we can show what they agreed to and
 * when (s.6(10)). Used at sign-up (auth) and from the privacy settings.
 */
@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether the person still has to read and accept the current notice. */
  needsNotice(user: Pick<User, 'noticeVersion' | 'adultConfirmedAt'>) {
    return (
      user.noticeVersion !== PRIVACY_NOTICE_VERSION || !user.adultConfirmedAt
    );
  }

  /** The privacy part of the account the app reads with /auth/me. */
  view(
    user: Pick<
      User,
      | 'noticeVersion'
      | 'noticeAcceptedAt'
      | 'adultConfirmedAt'
      | 'analyticsConsent'
    >,
  ) {
    return {
      noticeVersion: user.noticeVersion,
      currentNoticeVersion: PRIVACY_NOTICE_VERSION,
      noticeAcceptedAt: user.noticeAcceptedAt,
      needsNotice: this.needsNotice(user),
      adultConfirmed: !!user.adultConfirmedAt,
      analytics: user.analyticsConsent,
    };
  }

  /**
   * Records acceptance of the current notice. Refuses an old version (the
   * person read something else) and anyone who doesn't confirm 18+: the
   * service is for adults only, so a child's data is never processed.
   */
  async accept(
    userId: string,
    input: NoticeAcceptance,
    source: ConsentSource,
    tx?: Prisma.TransactionClient,
  ) {
    this.check(input);
    const db = tx ?? this.prisma;
    const now = new Date();
    const analytics = input.analytics === true;
    await db.consentRecord.create({
      data: {
        userId,
        noticeVersion: PRIVACY_NOTICE_VERSION,
        granted: analytics ? ['account', 'analytics'] : ['account'],
        refused: analytics ? [] : ['analytics'],
        adultDeclared: true,
        source,
      },
    });
    return db.user.update({
      where: { id: userId },
      data: {
        noticeVersion: PRIVACY_NOTICE_VERSION,
        noticeAcceptedAt: now,
        adultConfirmedAt: now,
        ...(input.analytics !== undefined
          ? { analyticsConsent: analytics }
          : {}),
      },
    });
  }

  /** Throws unless the acceptance is of the current notice by an adult. */
  check(input: NoticeAcceptance) {
    if (input.noticeVersion !== PRIVACY_NOTICE_VERSION) {
      throw new ConflictException({
        message:
          'Our privacy notice has just changed. Please read the new one and accept it again.',
        code: 'notice_outdated',
        currentNoticeVersion: PRIVACY_NOTICE_VERSION,
      });
    }
    if (input.adult !== true) {
      throw new BadRequestException({
        message:
          'StockVirtue is for adults only. You must be 18 or older to have an account.',
        code: 'adult_required',
      });
    }
  }

  /** Gives or withdraws consent to app usage analytics. */
  async setAnalytics(userId: string, enabled: boolean, source: ConsentSource) {
    return this.prisma.$transaction(async (tx) => {
      await tx.consentRecord.create({
        data: {
          userId,
          noticeVersion: PRIVACY_NOTICE_VERSION,
          granted: enabled ? ['analytics'] : [],
          refused: enabled ? [] : ['analytics'],
          source,
        },
      });
      return tx.user.update({
        where: { id: userId },
        data: { analyticsConsent: enabled },
      });
    });
  }

  /** The consent history of an account, newest first. */
  history(userId: string) {
    return this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        noticeVersion: true,
        granted: true,
        refused: true,
        adultDeclared: true,
        source: true,
        createdAt: true,
      },
    });
  }
}
