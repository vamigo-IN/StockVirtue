import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { paiseToRupees } from '../common/money';
import { AchievementsService } from '../achievements/achievements.service';
import { MailService, escapeHtml } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

/// Wallet bonuses (in paise). Tweak here to change the program economics.
///   • Referrer earns ₹50,000 per successful invite — recurring.
///   • Referred (the new user) earns ₹25,000 — one-time at redemption.
const REFERRER_BONUS_P = 5_000_000n;  // ₹50,000
const REFERRED_BONUS_P = 2_500_000n;  // ₹25,000

/// Anti-abuse: only users created within this window can redeem someone
/// else's code. Stops year-old accounts from harvesting bonuses by
/// trading codes among themselves after the program launches.
const REDEEM_WINDOW_DAYS = 7;

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly achievements: AchievementsService,
  ) {}

  /// Redeems `code` for the caller. Credits both wallets, records the
  /// `referredById` link, and returns the updated stats so the client
  /// can re-paint immediately without a second round-trip.
  async redeem(userId: string, codeRaw: string) {
    const code = codeRaw?.trim().toUpperCase();
    if (!code) {
      throw new BadRequestException('Invite code is required');
    }
    if (!/^SV-[A-F0-9]{6}$/.test(code)) {
      throw new BadRequestException(
        'Invite codes look like "SV-XXXXXX" — six hex characters after the dash',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const me = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          createdAt: true,
          referredById: true,
          referralCode: true,
        },
      });
      if (!me) throw new NotFoundException('User not found');
      if (me.referredById) {
        throw new ConflictException('You have already redeemed an invite code');
      }
      if (me.referralCode === code) {
        throw new BadRequestException("You can't redeem your own code");
      }
      const ageMs = Date.now() - me.createdAt.getTime();
      const windowMs = REDEEM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      if (ageMs > windowMs) {
        throw new BadRequestException(
          `Invite codes can only be redeemed within ${REDEEM_WINDOW_DAYS} days of signup`,
        );
      }

      const referrer = await tx.user.findUnique({
        where: { referralCode: code },
        select: { id: true, displayName: true },
      });
      if (!referrer) {
        throw new NotFoundException('No user owns that invite code');
      }
      if (referrer.id === userId) {
        throw new BadRequestException("You can't redeem your own code");
      }

      // Atomically CLAIM the redemption before crediting anything: set
      // referredById only if it's still null. Two concurrent redeem() calls
      // both read referredById=null above (READ COMMITTED), but this guarded
      // updateMany serialises on the row lock — exactly one wins (count=1),
      // the loser sees count=0 and aborts, so the bonus is credited once.
      const claim = await tx.user.updateMany({
        where: { id: userId, referredById: null },
        data: { referredById: referrer.id },
      });
      if (claim.count === 0) {
        throw new ConflictException('You have already redeemed an invite code');
      }

      // Both wallets get upserted-then-credited so first-time users get
      // their ₹10L starter balance + bonus in a single tx (no race with
      // a wallet that might not exist yet for the brand-new account). The
      // `increment` is an atomic DB update (no read-modify-write).
      await tx.wallet.upsert({
        where: { userId: referrer.id },
        update: { balanceP: { increment: REFERRER_BONUS_P } },
        create: {
          userId: referrer.id,
          balanceP: 100_000_000n + REFERRER_BONUS_P,
        },
      });
      await tx.wallet.upsert({
        where: { userId },
        update: { balanceP: { increment: REFERRED_BONUS_P } },
        create: {
          userId,
          balanceP: 100_000_000n + REFERRED_BONUS_P,
        },
      });

      // Pull fresh aggregates so the client can paint stats without
      // another /referrals/stats round trip.
      const referrerCount = await tx.user.count({
        where: { referredById: referrer.id },
      });

      return {
        ok: true,
        referrer: {
          id: referrer.id,
          displayName: referrer.displayName ?? 'A StockVirtue trader',
        },
        bonusEarned: paiseToRupees(REFERRED_BONUS_P),
        referrerCount,
      };
    });

    // Always-on referral-redeemed emails (fire-and-forget; the redemption is
    // already committed, so an email failure must not surface to the caller).
    void this.sendReferralEmails(
      userId,
      result.referrer.id,
      result.referrer.displayName,
    ).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`referral email failed: ${msg}`);
    });

    // Re-evaluate social badges for both parties (referralCount changed for
    // the referrer; the redeemer's account is now linked). Fire-and-forget.
    for (const id of [userId, result.referrer.id]) {
      void this.achievements.evaluate(id).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`referral achievement eval failed: ${msg}`);
      });
    }

    return result;
  }

  private async sendReferralEmails(
    redeemerId: string,
    referrerId: string,
    referrerName: string,
  ): Promise<void> {
    const [redeemer, referrer] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: redeemerId },
        select: { emailAlias: true, displayName: true },
      }),
      this.prisma.user.findUnique({
        where: { id: referrerId },
        select: { emailAlias: true },
      }),
    ]);
    const redeemerName = redeemer?.displayName ?? 'A StockVirtue trader';
    const referredRupees = paiseToRupees(REFERRED_BONUS_P).toLocaleString(
      'en-IN',
    );
    const referrerRupees = paiseToRupees(REFERRER_BONUS_P).toLocaleString(
      'en-IN',
    );
    if (redeemer?.emailAlias) {
      await this.mail.notify(
        redeemer.emailAlias,
        'Your referral bonus is in',
        'Referral bonus credited',
        this.mail.heroCard({
          eyebrow: 'Wallet credit',
          value: `+₹${referredRupees}`,
          caption: 'Added to your virtual wallet',
        }) +
          this.mail.para(
            `You redeemed an invite from <b>${escapeHtml(referrerName)}</b>. Welcome aboard — your bonus is ready to put to work.`,
          ),
        `You redeemed an invite from ${referrerName}. Rs ${referredRupees} added to your virtual wallet.`,
      );
    }
    if (referrer?.emailAlias) {
      await this.mail.notify(
        referrer.emailAlias,
        'You earned a referral bonus',
        'Referral bonus credited',
        this.mail.heroCard({
          eyebrow: 'Wallet credit',
          value: `+₹${referrerRupees}`,
          caption: 'Added to your virtual wallet',
        }) +
          this.mail.para(
            `<b>${escapeHtml(redeemerName)}</b> just joined StockVirtue with your invite code. Keep sharing to earn more.`,
          ),
        `${redeemerName} joined with your invite code. Rs ${referrerRupees} added to your virtual wallet.`,
      );
    }
  }

  /// Returns the caller's referral picture:
  ///   • their public code (for the share sheet)
  ///   • how many people they've referred + total bonus rupees earned
  ///   • who referred them (if anyone)
  ///   • whether they're still within the redemption window
  async getStats(userId: string) {
    const [me, referredList, referralCount] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          createdAt: true,
          referralCode: true,
          referredById: true,
          referredBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.user.findMany({
        where: { referredById: userId },
        select: { id: true, displayName: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.user.count({ where: { referredById: userId } }),
    ]);
    if (!me) throw new NotFoundException('User not found');

    const ageMs = Date.now() - me.createdAt.getTime();
    const windowMs = REDEEM_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    return {
      code: me.referralCode,
      referredById: me.referredById,
      referredBy: me.referredBy
        ? {
            id: me.referredBy.id,
            displayName: me.referredBy.displayName ?? 'A StockVirtue trader',
          }
        : null,
      referralCount,
      // Lifetime referrer bonus = count × per-referral amount. Cheap to
      // recompute; no need for a denormalized column.
      bonusEarned: paiseToRupees(BigInt(referralCount) * REFERRER_BONUS_P),
      perReferralBonus: paiseToRupees(REFERRER_BONUS_P),
      perRedemptionBonus: paiseToRupees(REFERRED_BONUS_P),
      canRedeem: !me.referredById && ageMs <= windowMs,
      redeemWindowDays: REDEEM_WINDOW_DAYS,
      referrals: referredList.map((r) => ({
        id: r.id,
        displayName: r.displayName ?? 'A StockVirtue trader',
        joinedAt: r.createdAt.toISOString(),
      })),
    };
  }
}
