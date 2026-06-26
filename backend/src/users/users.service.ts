import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { referralCodeFromUserId } from './referral-code';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /// Lazy backfill: any pre-existing user that somehow slipped through the
  /// SQL migration without a code (e.g. created during the deploy window)
  /// gets one issued the first time auth touches them. No-op once filled.
  async ensureReferralCode(user: User): Promise<User> {
    if (user.referralCode) return user;
    const code = referralCodeFromUserId(user.id);
    try {
      return await this.prisma.user.update({
        where: { id: user.id },
        data: { referralCode: code },
      });
    } catch {
      // Race: another request already filled it. Re-read and return.
      return (await this.findById(user.id)) ?? user;
    }
  }

  /// Produces a referral code that doesn't collide with anything in the
  /// DB. We almost always succeed on the first try (the deterministic
  /// hash is injective for any realistic user count); the retry loop
  /// exists for the astronomical case where two cuids hash identically.
  private async allocateReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const seed =
        attempt === 0
          ? Math.random().toString(36) + Date.now().toString(36)
          : Math.random().toString(36) + Date.now().toString(36) + attempt;
      const code = referralCodeFromUserId(seed);
      const existing = await this.prisma.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!existing) return code;
    }
    // Last-resort: timestamp suffix so we never throw out of signup.
    return `SV-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  }

  markLoggedIn(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  // ── Server-side email/password accounts ──────────────────────────

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { emailAlias: email } });
  }

  /** Creates an unverified email/password account (verified via emailed OTP). */
  async createEmailUser(args: {
    email: string;
    passwordHash: string;
  }): Promise<User> {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return this.prisma.user.create({
      data: {
        emailAlias: args.email,
        passwordHash: args.passwordHash,
        emailVerified: false,
        displayName: `Trader-${suffix}`,
        referralCode: await this.allocateReferralCode(),
        // Brand-new account with no history — baseline now so the first badge
        // they earn actually notifies (push + email), not silently snapshots.
        achievementsBaselinedAt: new Date(),
      },
    });
  }

  setPassword(id: string, passwordHash: string): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  markEmailVerified(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { emailVerified: true },
    });
  }

  /** Per-trade email opt-in toggle. */
  setTradeEmailsOptIn(id: string, enabled: boolean): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { tradeEmailsOptIn: enabled },
    });
  }

  /**
   * Profile is "complete" once the user has set a real displayName — we know
   * it's still the auto-generated placeholder when it matches "Trader-XXXX".
   * Used by the client to decide whether to push the complete-profile flow.
   */
  /**
   * Profile is "complete" once we have the full identity set: a real
   * displayName (not the auto "Trader-XXXX" placeholder), an email, AND a
   * mobile number. Sign-in methods each provide some of these (email/password
   * → email; Google → email + name; phone → phone), so the complete-profile
   * flow collects whatever's missing.
   */
  isProfileComplete(
    user: Pick<User, 'displayName' | 'emailAlias' | 'phone'>,
  ): boolean {
    const name = user.displayName?.trim() ?? '';
    const hasRealName =
      name.length > 0 && !/^Trader-[A-Z0-9]{4}$/.test(name);
    return hasRealName && !!user.emailAlias && !!user.phone;
  }

  /**
   * Updates editable profile fields. `displayName` is always mutable. `email`
   * and `phone` are settable ONLY when not already present — so the
   * complete-profile flow can capture the identity bits a user's sign-in
   * method didn't provide — but an existing login identity can't be silently
   * overwritten here. Both are unique; a clash with another account surfaces
   * as a clear 409.
   */
  async updateProfile(
    id: string,
    patch: { displayName?: string; email?: string; phone?: string },
  ): Promise<User> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    const data: { displayName?: string; emailAlias?: string; phone?: string } =
      {};
    if (patch.displayName !== undefined) {
      const trimmed = patch.displayName.trim();
      if (trimmed.length > 0) data.displayName = trimmed;
    }
    if (patch.email !== undefined && current.emailAlias == null) {
      const email = patch.email.trim().toLowerCase();
      if (email.length > 0) data.emailAlias = email;
    }
    if (patch.phone !== undefined && current.phone == null) {
      const phone = patch.phone.trim();
      if (phone.length > 0) data.phone = this.normalizePhone(phone);
    }
    if (Object.keys(data).length === 0) return current;
    try {
      return await this.prisma.user.update({ where: { id }, data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = (err.meta?.target as string[] | undefined)?.join(',');
        const field = target?.includes('phone')
          ? 'mobile number'
          : target?.includes('emailAlias')
            ? 'email'
            : 'detail';
        throw new ConflictException(
          `That ${field} is already linked to another account.`,
        );
      }
      throw err;
    }
  }

  /// Normalises a user-entered mobile to E.164, defaulting to +91 (India).
  private normalizePhone(raw: string): string {
    const digits = raw.replace(/[^0-9]/g, '');
    let e164: string;
    if (raw.trim().startsWith('+')) {
      e164 = `+${digits}`;
    } else if (digits.length === 10) {
      e164 = `+91${digits}`;
    } else if (digits.length === 12 && digits.startsWith('91')) {
      e164 = `+${digits}`;
    } else {
      e164 = `+${digits}`;
    }
    if (!/^\+\d{10,15}$/.test(e164)) {
      throw new BadRequestException('Enter a valid mobile number');
    }
    return e164;
  }

  /**
   * Find or create the User row that backs a Firebase Auth identity.
   * Lookup priority: existing firebaseUid → existing phone → existing email →
   * create new. When a non-Firebase row already has the phone/email, we link
   * it to firebaseUid rather than create a duplicate.
   */
  async findOrCreateByFirebase(args: {
    firebaseUid: string;
    phone: string | null;
    email: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
  }): Promise<User> {
    const { firebaseUid, phone, email, displayName, avatarUrl } = args;

    const existingByUid = await this.prisma.user.findUnique({
      where: { firebaseUid },
    });
    if (existingByUid) {
      // Returning user — backfill name/avatar from the provider so we don't
      // keep treating a Google account as an incomplete profile.
      return this.applyProviderProfile(existingByUid, { displayName, avatarUrl });
    }

    const existingByPhone = phone
      ? await this.prisma.user.findUnique({ where: { phone } })
      : null;
    if (existingByPhone) {
      return this.applyProviderProfile(existingByPhone, {
        displayName,
        avatarUrl,
        firebaseUid,
        emailAlias: email ?? existingByPhone.emailAlias,
      });
    }

    const existingByEmail = email
      ? await this.prisma.user.findUnique({ where: { emailAlias: email } })
      : null;
    if (existingByEmail) {
      return this.applyProviderProfile(existingByEmail, {
        displayName,
        avatarUrl,
        firebaseUid,
        phone: phone ?? existingByEmail.phone,
      });
    }

    // Prefer the name from the federated provider (e.g. Google); fall back to
    // a placeholder that the client recognises as "profile incomplete".
    const name =
      displayName && displayName.trim().length > 0
        ? displayName.trim()
        : `Trader-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    return this.prisma.user.create({
      data: {
        firebaseUid,
        phone,
        emailAlias: email,
        // Federated identities (Google) have a provider-verified email.
        emailVerified: email != null,
        displayName: name,
        avatarUrl: avatarUrl ?? null,
        referralCode: await this.allocateReferralCode(),
        // New account — baseline now so the first earned badge notifies.
        achievementsBaselinedAt: new Date(),
      },
    });
  }

  /**
   * Backfills provider-supplied profile fields onto an existing row, plus any
   * link columns (firebaseUid/phone/email). The real name only overwrites the
   * auto-generated "Trader-XXXX" placeholder, so a name the user set themselves
   * is never clobbered. Skips the write entirely when nothing changed.
   */
  private async applyProviderProfile(
    user: User,
    patch: {
      displayName?: string | null;
      avatarUrl?: string | null;
      firebaseUid?: string;
      phone?: string | null;
      emailAlias?: string | null;
    },
  ): Promise<User> {
    const data: {
      firebaseUid?: string;
      phone?: string;
      emailAlias?: string;
      displayName?: string;
      avatarUrl?: string;
    } = {};
    if (patch.firebaseUid && user.firebaseUid !== patch.firebaseUid) {
      data.firebaseUid = patch.firebaseUid;
    }
    if (patch.phone != null && user.phone !== patch.phone) {
      data.phone = patch.phone;
    }
    if (patch.emailAlias != null && user.emailAlias !== patch.emailAlias) {
      data.emailAlias = patch.emailAlias;
    }
    // Only fill the name if the current one is still the placeholder.
    const newName = patch.displayName?.trim();
    if (newName && !this.isProfileComplete(user)) {
      data.displayName = newName;
    }
    if (patch.avatarUrl && user.avatarUrl !== patch.avatarUrl) {
      data.avatarUrl = patch.avatarUrl;
    }
    if (Object.keys(data).length === 0) return user;
    return this.prisma.user.update({ where: { id: user.id }, data });
  }
}
