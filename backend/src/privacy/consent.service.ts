import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyNoticeService } from './privacy-notice.service';

/** What the app sends when someone accepts the privacy notice. */
export interface NoticeAcceptance {
  noticeVersion: string;
  /** They confirmed being 18 or older. */
  adult: boolean;
  /** Optional: app usage analytics. */
  analytics?: boolean;
  /**
   * App 1.4.1: the value the analytics box was prefilled with (the person's
   * current choice), sent only when the screen prefilled it (§5.12).
   */
  analyticsPrefilled?: boolean;
}

/** Where a decision was made (kept with it as proof). */
export type ConsentSource =
  | 'app.signup'
  | 'app.notice'
  | 'app.settings'
  | 'app.delete'
  | 'staff'
  | 'automation';

/** What one acceptance records about analytics (W7 addendum §5.12). */
export interface AnalyticsDecision {
  granted: string[];
  refused: string[];
  /** The new `users.analyticsConsent`, or undefined to keep it. */
  flag?: boolean;
}

/**
 * The §5.12 rule (W7 decision 3), row by row:
 * 1. asked afresh (never accepted, or a version since theirs affects
 *    analytics): the box's value decides, an absent one counts as "no", and
 *    a prefilled box means the screen is stale ('stale': 409, no record);
 * 2. not changed, and app 1.4.1 showed the current choice
 *    (`analyticsPrefilled`): only a change to the box is a decision;
 * 3. not changed, app 1.4.0 (its box always starts unticked): `true` grants,
 *    `false` decides nothing.
 */
export function analyticsDecision(
  askedAfresh: boolean,
  input: Pick<NoticeAcceptance, 'analytics' | 'analyticsPrefilled'>,
): AnalyticsDecision | 'stale' {
  const grant: AnalyticsDecision = {
    granted: ['account', 'analytics'],
    refused: [],
    flag: true,
  };
  const keep: AnalyticsDecision = { granted: ['account'], refused: [] };
  if (askedAfresh) {
    if (input.analyticsPrefilled !== undefined) return 'stale';
    return input.analytics === true
      ? grant
      : { granted: ['account'], refused: ['analytics'], flag: false };
  }
  if (input.analyticsPrefilled !== undefined) {
    const shown = input.analyticsPrefilled;
    const sent = input.analytics ?? shown;
    if (sent === shown) return keep;
    return sent
      ? grant
      : { granted: ['account'], refused: ['analytics'], flag: false };
  }
  return input.analytics === true ? grant : keep;
}

const OUTDATED_MESSAGE =
  'Our privacy notice has just changed. Please read the new one and accept it again.';

/**
 * Consent for app accounts (DPDP Act s.6): the notice version a person
 * accepted, their 18+ confirmation and the optional analytics purpose, each
 * decision kept as a ConsentRecord so we can show what they agreed to and
 * when (s.6(10)). Used at sign-up (auth) and from the privacy settings. The
 * current notice version comes from the database, through
 * PrivacyNoticeService (W7 addendum §5.4).
 */
@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notice: PrivacyNoticeService,
  ) {}

  /** Whether the person still has to read and accept the current notice. */
  needsNotice(user: Pick<User, 'noticeVersion' | 'adultConfirmedAt'>) {
    return (
      user.noticeVersion !== this.notice.current().version ||
      !user.adultConfirmedAt
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
    const current = this.notice.current();
    return {
      noticeVersion: user.noticeVersion,
      currentNoticeVersion: current.version,
      noticeAcceptedAt: user.noticeAcceptedAt,
      needsNotice: this.needsNotice(user),
      adultConfirmed: !!user.adultConfirmedAt,
      analytics: user.analyticsConsent,
      noticeUpdatedAt: current.materialAt,
      noticeChangeSummary: current.announce
        ? { en: current.summaryEn, hi: current.summaryHi }
        : null,
      analyticsReask: this.notice.analyticsChangedSince(user.noticeVersion),
    };
  }

  /**
   * Records acceptance of the current notice. Refuses an old version (the
   * person read something else) and anyone who doesn't confirm 18+: the
   * service is for adults only, so a child's data is never processed. Runs
   * in a transaction (the caller's or its own) and re-reads the current
   * version there, under the lock a material publish takes, so the record
   * always names the version that was current when it was written.
   */
  async accept(
    userId: string,
    input: NoticeAcceptance,
    source: ConsentSource,
    tx?: Prisma.TransactionClient,
  ): Promise<User> {
    this.check(input);
    const run = async (db: Prisma.TransactionClient): Promise<User> => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext('privacy-notice'))`;
      const current = await this.notice.currentFromDb(db);
      if (input.noticeVersion !== current.version) {
        throw this.outdated(current.version);
      }
      const before = await db.user.findUnique({
        where: { id: userId },
        select: { noticeVersion: true },
      });
      // Sign-up is always a first acceptance (its box has no analytics choice).
      const afresh =
        source === 'app.signup' ||
        (await this.notice.analyticsChangedSinceDb(
          db,
          before?.noticeVersion ?? null,
        ));
      const decision = analyticsDecision(afresh, input);
      if (decision === 'stale') throw this.outdated(current.version);
      const now = new Date();
      await db.consentRecord.create({
        data: {
          userId,
          noticeVersion: current.version,
          granted: decision.granted,
          refused: decision.refused,
          adultDeclared: true,
          source,
        },
      });
      return db.user.update({
        where: { id: userId },
        data: {
          noticeVersion: current.version,
          noticeAcceptedAt: now,
          adultConfirmedAt: now,
          ...(decision.flag !== undefined
            ? { analyticsConsent: decision.flag }
            : {}),
        },
      });
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Throws unless the acceptance is of the current notice by an adult. */
  check(input: NoticeAcceptance) {
    const current = this.notice.current().version;
    if (input.noticeVersion !== current) throw this.outdated(current);
    if (input.adult !== true) {
      throw new BadRequestException({
        message:
          'StockVirtue is for adults only. You must be 18 or older to have an account.',
        code: 'adult_required',
      });
    }
  }

  private outdated(current: string) {
    return new ConflictException({
      message: OUTDATED_MESSAGE,
      code: 'notice_outdated',
      currentNoticeVersion: current,
    });
  }

  /**
   * Gives or withdraws consent to app usage analytics, recorded under the
   * notice version the person accepted (§5.4 row 6).
   */
  async setAnalytics(userId: string, enabled: boolean, source: ConsentSource) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { noticeVersion: true },
      });
      await tx.consentRecord.create({
        data: {
          userId,
          noticeVersion: user?.noticeVersion ?? this.notice.current().version,
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
