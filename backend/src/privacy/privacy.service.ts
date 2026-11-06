import { BadRequestException, Injectable } from '@nestjs/common';
import { PrivacyRequestStatus, User } from '@prisma/client';
import { enforceRateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { DEFAULT_CONFIG, PrivacyConfig, readConfig } from '../site/site-config';
import { ConsentService } from './consent.service';
import { WebConsentDto } from './privacy.dto';
import { PrivacyNoticeService } from './privacy-notice.service';
import { RECIPIENTS } from './privacy.constants';

/** Most rows of one kind put in a data export (the newest). */
const EXPORT_ROWS = 20_000;
/** Data exports per account per hour. */
const EXPORTS_PER_HOUR = 5;

/** JSON can't hold bigint: amounts (paise) become exact strings. */
function plain(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, plain(v)]),
    );
  }
  return value;
}

/**
 * The privacy side of the service (DPDP Act 2023): who answers for personal
 * data, each person's privacy status, the summary of their data they can
 * download (s.11), their nominee (s.14) and the website's cookie choices.
 */
@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly consent: ConsentService,
    private readonly notice: PrivacyNoticeService,
  ) {}

  /** The current privacy notice version (from the database, §5.4). */
  currentNoticeVersion(): string {
    return this.notice.current().version;
  }

  /** The grievance officer and response time, as saved under Site settings. */
  async contact(): Promise<PrivacyConfig> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: 'singleton' },
      select: { config: true, contactEmail: true },
    });
    const privacy = readConfig(row?.config).privacy;
    return {
      ...privacy,
      // Until a grievance officer is named, privacy mail goes to the site's
      // contact address.
      officerEmail:
        privacy.officerEmail || row?.contactEmail || 'support@stockvirtue.com',
      legalName: privacy.legalName || DEFAULT_CONFIG.privacy.legalName,
    };
  }

  /**
   * What the app and website show: the notice version, when it last changed
   * in substance and what changed (W7 addendum §5.7; the summary is null
   * for the seed version), and who to contact.
   */
  async publicInfo() {
    const c = await this.contact();
    const notice = this.notice.current();
    return {
      noticeVersion: notice.version,
      noticeUpdatedAt: notice.materialAt,
      noticeChangeSummary: notice.announce
        ? { en: notice.summaryEn, hi: notice.summaryHi }
        : null,
      legalName: c.legalName,
      postalAddress: c.postalAddress || null,
      grievanceOfficer: {
        name: c.officerName || null,
        email: c.officerEmail,
        phone: c.officerPhone || null,
      },
      responseDays: c.responseDays,
      links: {
        notice: 'https://stockvirtue.com/privacy',
        noticeHindi: 'https://stockvirtue.com/privacy/hi',
        requests: 'https://stockvirtue.com/privacy/requests',
        terms: 'https://stockvirtue.com/terms',
      },
    };
  }

  /** The account's privacy settings, for the app's "Privacy & your data". */
  async status(user: User) {
    const [nominee, open] = await Promise.all([
      this.prisma.privacyNominee.findUnique({ where: { userId: user.id } }),
      this.prisma.privacyRequest.count({
        where: {
          userId: user.id,
          status: {
            in: [PrivacyRequestStatus.OPEN, PrivacyRequestStatus.IN_PROGRESS],
          },
        },
      }),
    ]);
    return {
      ...this.consent.view(user),
      nominee: nominee
        ? {
            name: nominee.name,
            email: nominee.email,
            phone: nominee.phone,
            relationship: nominee.relationship,
          }
        : null,
      openRequests: open,
      contact: await this.publicInfo(),
    };
  }

  /**
   * Everything we hold about the account, and who we share it with (s.11).
   * Secrets (password hash, push tokens, sign-in ids) are left out; amounts
   * are in paise.
   */
  async export(user: User) {
    await enforceRateLimit(
      this.redis.client,
      `privacy:export:${user.id}`,
      EXPORTS_PER_HOUR,
      3600,
      'You can download your data 5 times an hour. Try again later.',
    );
    const id = user.id;
    const recent = {
      orderBy: { createdAt: 'desc' as const },
      take: EXPORT_ROWS,
    };
    const [
      wallet,
      walletCredits,
      orders,
      positions,
      snapshots,
      watchlists,
      alerts,
      notifications,
      ownedRooms,
      memberships,
      achievements,
      lessons,
      quizzes,
      bookmarks,
      newsAlerts,
      devices,
      consents,
      requests,
      nominee,
      referredBy,
      referrals,
    ] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId: id } }),
      this.prisma.walletCredit.findMany({ where: { userId: id }, ...recent }),
      this.prisma.order.findMany({ where: { userId: id }, ...recent }),
      this.prisma.position.findMany({ where: { userId: id } }),
      this.prisma.portfolioSnapshot.findMany({
        where: { userId: id },
        orderBy: { asOfDate: 'desc' },
        take: EXPORT_ROWS,
      }),
      this.prisma.watchlist.findMany({
        where: { userId: id },
        include: { items: true },
        orderBy: { position: 'asc' },
      }),
      this.prisma.priceAlert.findMany({ where: { userId: id }, ...recent }),
      this.prisma.notification.findMany({ where: { userId: id }, ...recent }),
      this.prisma.room.findMany({ where: { ownerId: id } }),
      this.prisma.roomMember.findMany({
        where: { userId: id },
        include: { room: { select: { name: true, code: true } } },
      }),
      this.prisma.userAchievement.findMany({ where: { userId: id } }),
      this.prisma.lessonProgress.findMany({ where: { userId: id } }),
      this.prisma.quizAttempt.findMany({ where: { userId: id } }),
      this.prisma.newsBookmark.findMany({
        where: { userId: id },
        include: { article: { select: { title: true, slug: true } } },
      }),
      this.prisma.newsAlertPreference.findUnique({ where: { userId: id } }),
      this.prisma.deviceToken.findMany({
        where: { userId: id },
        select: { platform: true, createdAt: true, lastSeenAt: true },
      }),
      this.consent.history(id),
      this.prisma.privacyRequest.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          reference: true,
          type: true,
          details: true,
          status: true,
          createdAt: true,
          dueAt: true,
          response: true,
          respondedAt: true,
        },
      }),
      this.prisma.privacyNominee.findUnique({ where: { userId: id } }),
      user.referredById
        ? this.prisma.user.findUnique({
            where: { id: user.referredById },
            select: { displayName: true },
          })
        : null,
      this.prisma.user.count({ where: { referredById: id } }),
    ]);
    const strip = <T extends object>(rows: T[], ...keys: string[]) =>
      rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(([k]) => !keys.includes(k)),
        ),
      );
    return plain({
      about:
        'Your StockVirtue data, as of the time below. Amounts are in paise (100 paise = 1 rupee). Lists hold at most the newest 20,000 entries.',
      generatedAt: new Date(),
      noticeVersion: this.notice.current().version,
      account: {
        id,
        displayName: user.displayName,
        email: user.emailAlias,
        phone: user.phone,
        photoUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        signedUpAt: user.createdAt,
        lastSignInAt: user.lastLoginAt,
        status: user.status,
        referralCode: user.referralCode,
        invitedBy: referredBy?.displayName ?? null,
        peopleYouInvited: referrals,
      },
      privacy: {
        ...this.consent.view(user),
        adultConfirmedAt: user.adultConfirmedAt,
        tradeEmails: user.tradeEmailsOptIn,
        consentHistory: consents,
        nominee,
        requests,
      },
      trading: {
        wallet,
        walletCredits: strip(walletCredits, 'userId'),
        orders: strip(orders, 'userId'),
        positions: strip(positions, 'userId'),
        dailySnapshots: strip(snapshots, 'userId'),
        watchlists: watchlists.map((w) => ({
          name: w.name,
          items: strip(w.items, 'watchlistId'),
        })),
        priceAlerts: strip(alerts, 'userId'),
      },
      rooms: {
        owned: strip(ownedRooms, 'ownerId'),
        memberships: memberships.map((m) => ({
          room: m.room.name,
          code: m.room.code,
          joinedAt: m.joinedAt,
          startingEquity: m.baselineEquityP,
          finalEquity: m.finalEquityP,
        })),
      },
      learning: {
        achievements: strip(achievements, 'userId', 'id'),
        lessonsCompleted: strip(lessons, 'userId', 'id'),
        quizAttempts: strip(quizzes, 'userId', 'id'),
      },
      news: {
        bookmarks: bookmarks.map((b) => ({
          title: b.article.title,
          url: `https://stockvirtue.com/news/${b.article.slug}`,
          savedAt: b.createdAt,
        })),
        alerts: newsAlerts
          ? {
              breaking: newsAlerts.breaking,
              followedStocks: newsAlerts.followedStocks,
            }
          : { breaking: true, followedStocks: true },
      },
      notifications: strip(notifications, 'userId'),
      devices,
      sharedWith: RECIPIENTS,
    });
  }

  nominee(userId: string) {
    return this.prisma.privacyNominee.findUnique({ where: { userId } });
  }

  setNominee(
    userId: string,
    n: { name: string; email?: string; phone?: string; relationship?: string },
  ) {
    const data = {
      name: n.name,
      email: n.email || null,
      phone: n.phone || null,
      relationship: n.relationship || null,
    };
    return this.prisma.privacyNominee.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async removeNominee(userId: string) {
    await this.prisma.privacyNominee.deleteMany({ where: { userId } });
    return { ok: true };
  }

  /**
   * One cookie choice from the website, kept as proof of consent. Only the
   * random id from the visitor's cookie: no IP address, nothing else. The
   * version is the cookie choice version the banner showed (W7 decision 4,
   * §5.13): one above the current version is refused, after a database read
   * so a reload still in flight never loses a record; a lower one (a page
   * cached just before a change) is kept.
   */
  async logWebConsent(dto: WebConsentDto, ip: string | null) {
    await enforceRateLimit(
      this.redis.client,
      `privacy:consent:${ip ?? 'unknown'}`,
      30,
      60,
      'Too many requests.',
    );
    if (
      dto.version > this.notice.cookieVersion() &&
      dto.version > (await this.notice.cookieVersionFromDb())
    ) {
      throw new BadRequestException({
        message: 'That cookie choice version is not known.',
        code: 'cookie_version_unknown',
      });
    }
    const granted = [
      ...(dto.analytics ? ['analytics'] : []),
      ...(dto.advertising ? ['advertising'] : []),
    ];
    const refused = [
      ...(dto.analytics ? [] : ['analytics']),
      ...(dto.advertising ? [] : ['advertising']),
    ];
    await this.prisma.consentRecord.create({
      data: {
        visitorId: dto.id,
        noticeVersion: `cookies-${dto.version}`,
        granted,
        refused,
        source: dto.source,
      },
    });
    return { ok: true };
  }
}
