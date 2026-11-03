import * as crypto from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { ParseError, parsePhoneNumberWithError } from 'libphonenumber-js';
import { AppConfig } from '../config/configuration';
import { enforceRateLimit } from '../common/rate-limit';
import { hashPassword, verifyPassword } from '../common/password';
import {
  FeatureFlagsService,
  FEATURE_MOBILE_OTP,
} from '../feature-flags/feature-flags.service';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { MailService } from '../mail/mail.service';
import { ConsentService, NoticeAcceptance } from '../privacy/consent.service';
import { RedisService } from '../redis/redis.service';
import { UsersService } from '../users/users.service';

/// Accepted JWT signing algorithm. Pinned on every verify so a token can't be
/// smuggled in under a different alg (e.g. an "alg: none" or RS/HS confusion).
export const JWT_ALG = 'HS256' as const;

/// Email-OTP lifetime for sign-up verification.
const EMAIL_OTP_TTL = 10 * 60; // 10 minutes

/// Constant-time string compare so OTP verification can't be timed to leak
/// how many leading digits matched.
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: number;
  private readonly refreshTtl: number;
  /// HMAC key for emailed codes: Redis holds digests, never the codes.
  private readonly otpKey: string;
  /// New accounts must come with an accepted privacy notice.
  private readonly requireConsent: boolean;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly users: UsersService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly firebase: FirebaseAdminService,
    private readonly mail: MailService,
    private readonly flags: FeatureFlagsService,
    private readonly consent: ConsentService,
  ) {
    const jwtCfg = config.get('jwt', { infer: true });
    this.accessSecret = jwtCfg.accessSecret;
    this.refreshSecret = jwtCfg.refreshSecret;
    this.accessTtl = jwtCfg.accessTtl;
    this.refreshTtl = jwtCfg.refreshTtl;
    this.otpKey = crypto
      .createHmac('sha256', jwtCfg.accessSecret)
      .update('stockvirtue:app:email-code:v1')
      .digest('hex');
    this.requireConsent = config.get('privacy', {
      infer: true,
    }).requireSignupConsent;
  }

  /// The privacy notice has to come with a new account once strict mode is on.
  private consentMissing(): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.PRECONDITION_REQUIRED,
        message:
          'Please read and accept our privacy notice, and confirm you are 18 or older, to create an account. Update the app if you don\u2019t see it.',
        code: 'consent_required',
      },
      HttpStatus.PRECONDITION_REQUIRED,
    );
  }

  /// Digest of an emailed code, bound to the address it was sent to.
  private otpDigest(email: string, code: string): string {
    return crypto
      .createHmac('sha256', this.otpKey)
      .update(`${email}:${code}`)
      .digest('hex');
  }

  /// Per-IP throttle for the auth surface. The existing limits are keyed by
  /// email/account, which protect a single targeted account but let one IP
  /// spray attempts across many accounts under just the global limiter. This
  /// caps a single client IP across ALL accounts. Limits are set well above
  /// real human rates so shared/carrier-NAT users aren't harmed.
  private ipLimit(
    ip: string | undefined,
    action: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const key = `ip:${action}:${ip || 'unknown'}`;
    return enforceRateLimit(this.redis.client, key, limit, windowSeconds);
  }

  /// Revoke every refresh session for a user (e.g. when an admin blocks them,
  /// so a still-valid 30-day refresh token can't keep minting access tokens).
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.revokeAllSessions(userId);
  }

  // ── Server-side email / password auth (no Firebase) ──────────────

  /**
   * Step 1 of sign-up: create (or re-arm) an unverified email/password account
   * and email an OTP. We never reveal whether an unverified email already
   * exists — a re-register just resets the password + resends the code.
   * Verified accounts are rejected so an attacker can't reset a live account's
   * password (they'd still need the OTP, but we fail fast and clearly).
   */
  async registerEmail(
    ip: string | undefined,
    rawEmail: string,
    password: string,
    consent?: NoticeAcceptance,
  ) {
    // Per-IP cap BEFORE the 32MB scrypt + user create + email send, so a single
    // IP can't burn CPU / spam accounts / email-bomb arbitrary addresses.
    await this.ipLimit(ip, 'register', 10, 15 * 60);
    // The notice is accepted before anything is stored (DPDP Act s.6).
    if (consent) this.consent.check(consent);
    else if (this.requireConsent) throw this.consentMissing();
    const email = this.normalizeEmail(rawEmail);
    const existing = await this.users.findByEmail(email);
    if (existing?.emailVerified) {
      throw new ConflictException(
        'An account with this email already exists. Please sign in.',
      );
    }
    // SECURITY: only RESUME an unverified signup that belongs to this email
    // flow. An account that merely carries an unverified alias while holding a
    // different login identity (phone or federated) is a squatter — attaching
    // the registrant's password to it would hand them someone else's account,
    // with the squatter's own login still attached. Release the alias and
    // start a clean account instead.
    const resumable = Boolean(
      existing && !existing.firebaseUid && !existing.phone,
    );
    if (existing && !resumable) {
      await this.users.releaseUnverifiedAlias(email);
    }
    const passwordHash = await hashPassword(password);
    const account =
      resumable && existing
        ? await this.users.setPassword(existing.id, passwordHash)
        : await this.users.createEmailUser({ email, passwordHash });
    if (consent) await this.consent.accept(account.id, consent, 'app.signup');
    await this.sendEmailOtp(email);
    return { email, ttl: EMAIL_OTP_TTL, requiresVerification: true };
  }

  /** Step 2 of sign-up: check the OTP, mark verified, issue app tokens. */
  async verifyEmail(ip: string | undefined, rawEmail: string, code: string) {
    await this.ipLimit(ip, 'verify', 30, 15 * 60);
    const email = this.normalizeEmail(rawEmail);
    await enforceRateLimit(
      this.redis.client,
      `email:verify:${email}`,
      6,
      EMAIL_OTP_TTL,
      'Too many attempts. Request a new code.',
    );
    const stored = await this.redis.client.get(this.emailOtpKey(email));
    if (!stored || !timingSafeEqualStr(stored, this.otpDigest(email, code))) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.redis.client.del(this.emailOtpKey(email));
    await this.redis.client.del(`email:verify:${email}`);
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Account not found');
    const verified = await this.users.markEmailVerified(user.id);
    await this.users.markLoggedIn(verified.id);
    const tokens = await this.issueTokens(verified.id);
    return { user: this.sanitize(verified), ...tokens };
  }

  /**
   * Email + password login. If the account exists but was never verified, we
   * (re)send the OTP and tell the client to route to the verify screen instead
   * of issuing tokens.
   */
  async loginEmail(ip: string | undefined, rawEmail: string, password: string) {
    // Per-IP cap across ALL accounts (blocks single-IP credential stuffing);
    // the per-email cap below still protects a single targeted account.
    await this.ipLimit(ip, 'login', 30, 15 * 60);
    const email = this.normalizeEmail(rawEmail);
    await enforceRateLimit(
      this.redis.client,
      `email:login:${email}`,
      10,
      15 * 60,
      'Too many login attempts. Try again later.',
    );
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'No account is registered with this email. Please sign up first.',
      );
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This email signs in with Google. Use “Continue with Google” instead.',
      );
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Incorrect email or password');
    if (!user.emailVerified) {
      await this.sendEmailOtp(email);
      return { requiresVerification: true, email, ttl: EMAIL_OTP_TTL };
    }
    await this.users.markLoggedIn(user.id);
    const tokens = await this.issueTokens(user.id);
    return { user: this.sanitize(user), ...tokens };
  }

  /** Resend the sign-up OTP (rate-limited). */
  async resendEmailOtp(ip: string | undefined, rawEmail: string) {
    await this.ipLimit(ip, 'resend', 10, 15 * 60);
    const email = this.normalizeEmail(rawEmail);
    const user = await this.users.findByEmail(email);
    // Only resend for accounts that still need verifying; stay vague otherwise
    // so we don't leak which emails are registered.
    if (user && !user.emailVerified) {
      await this.sendEmailOtp(email);
    }
    return { email, ttl: EMAIL_OTP_TTL };
  }

  // ── Password reset (forgot password) ─────────────────────────────

  /**
   * Step 1: email a reset code. Per product requirement, the response tells the
   * user whether the email is actually usable for a password reset — a clear
   * "no account" / "use Google" beats silently dropping them on an OTP screen
   * that never receives a code. (Trade-off: this allows email enumeration; the
   * per-email rate limit below blunts bulk probing.)
   */
  async requestPasswordReset(ip: string | undefined, rawEmail: string) {
    await this.ipLimit(ip, 'forgot', 15, 15 * 60);
    const email = this.normalizeEmail(rawEmail);
    await enforceRateLimit(
      this.redis.client,
      `reset:throttle:${email}`,
      3,
      60,
      'A reset code was just sent. Please wait 60 seconds before requesting another.',
    );
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new NotFoundException(
        'No account is registered with this email. Please create an account first.',
      );
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'This email signs in with Google. Use “Continue with Google” instead of a password.',
      );
    }
    // A reset code proves email ownership, so we send it even to an account
    // that never finished email-OTP verification; resetPassword marks it
    // verified on success.
    const code = this.generateEmailOtp();
    await this.redis.client.set(
      this.resetOtpKey(email),
      this.otpDigest(email, code),
      'EX',
      EMAIL_OTP_TTL,
    );
    await this.mail.sendPasswordResetEmail(email, code, EMAIL_OTP_TTL);
    return { ok: true, ttl: EMAIL_OTP_TTL };
  }

  /**
   * Step 2: verify the reset code, set the new password, revoke ALL existing
   * sessions (so a leaked refresh token can't survive a reset), and issue a
   * fresh token pair (auto sign-in).
   */
  async resetPassword(
    ip: string | undefined,
    rawEmail: string,
    code: string,
    newPassword: string,
  ) {
    await this.ipLimit(ip, 'reset', 30, 15 * 60);
    const email = this.normalizeEmail(rawEmail);
    await enforceRateLimit(
      this.redis.client,
      `reset:verify:${email}`,
      6,
      EMAIL_OTP_TTL,
      'Too many attempts. Request a new reset code.',
    );
    const stored = await this.redis.client.get(this.resetOtpKey(email));
    if (!stored || !timingSafeEqualStr(stored, this.otpDigest(email, code))) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Account not found');
    await this.users.setPassword(user.id, await hashPassword(newPassword));
    // Resetting via the emailed code proves ownership — finish verification if
    // the account never completed sign-up OTP.
    if (!user.emailVerified) await this.users.markEmailVerified(user.id);
    await this.redis.client.del(this.resetOtpKey(email));
    await this.redis.client.del(`reset:verify:${email}`);
    await this.revokeAllSessions(user.id);
    await this.users.markLoggedIn(user.id);
    const tokens = await this.issueTokens(user.id);
    return { user: this.sanitize(user), ...tokens };
  }

  private resetOtpKey(email: string): string {
    return `reset:otp:${email}`;
  }

  /** Deletes every stored refresh token for the user. */
  private async revokeAllSessions(userId: string): Promise<void> {
    const keys = await this.redis.client.keys(`refresh:${userId}:*`);
    if (keys.length) await this.redis.client.del(...keys);
  }

  private async sendEmailOtp(email: string): Promise<void> {
    await enforceRateLimit(
      this.redis.client,
      `email:otp:throttle:${email}`,
      3,
      60,
      'A code was just sent. Please wait 60 seconds before requesting another.',
    );
    const code = this.generateEmailOtp();
    await this.redis.client.set(
      this.emailOtpKey(email),
      this.otpDigest(email, code),
      'EX',
      EMAIL_OTP_TTL,
    );
    await this.mail.sendOtpEmail(email, code, EMAIL_OTP_TTL);
  }

  private normalizeEmail(input: string): string {
    const email = input.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Invalid email address');
    }
    return email;
  }

  private generateEmailOtp(): string {
    return String(crypto.randomInt(100000, 1000000)); // 6 digits
  }

  private emailOtpKey(email: string): string {
    return `email:otp:${email}`;
  }

  async refresh(refreshToken: string) {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.refreshSecret,
        algorithms: [JWT_ALG],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type');
    }
    const key = this.refreshKey(payload.sub, payload.jti);
    const stored = await this.redis.client.get(key);
    if (!stored || stored !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    // A blocked (or deleted) user must not be able to keep minting access
    // tokens from a still-valid 30-day refresh token.
    const user = await this.users.findById(payload.sub);
    if (!user || user.status === 'BLOCKED' || user.status === 'DELETED') {
      await this.redis.client.del(key);
      throw new UnauthorizedException('Account is not active');
    }
    await this.redis.client.del(key);
    // Using the app counts as activity (inactive accounts are erased).
    await this.users.markActive(payload.sub);
    return this.issueTokens(payload.sub);
  }

  /**
   * Verify a Firebase ID token (issued by FirebaseAuth phone verification,
   * email/password, or a federated provider like Google) and issue our own
   * JWT pair. This is the single sign-in entry point for every method enabled
   * in the Firebase console: the client authenticates with Firebase, then
   * exchanges the resulting ID token here for app tokens + a persisted User.
   */
  async loginWithFirebaseIdToken(
    ip: string | undefined,
    idToken: string,
    consent?: NoticeAcceptance,
  ) {
    await this.ipLimit(ip, 'firebase', 30, 60);
    if (consent) this.consent.check(consent);
    if (!this.firebase.configured) {
      throw new UnauthorizedException('Firebase not configured on backend');
    }
    let decoded: DecodedIdToken;
    try {
      decoded = await this.firebase.auth().verifyIdToken(idToken);
    } catch (err) {
      this.logger.warn(`Firebase verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Firebase ID token');
    }
    // Enforce the admin Mobile-OTP kill-switch on the SERVER, not just in the
    // client UI: a paused phone-login must actually reject phone tokens.
    const provider = decoded.firebase?.sign_in_provider;
    if (
      provider === 'phone' &&
      !this.flags.isEnabled(FEATURE_MOBILE_OTP, false)
    ) {
      throw new UnauthorizedException('Phone sign-in is currently disabled.');
    }
    const rawPhone = decoded.phone_number ?? null;
    // Only trust the email claim when Firebase says it's VERIFIED. Otherwise an
    // attacker could assert an arbitrary email (e.g. via an email/password
    // Firebase provider) and get auto-linked into a victim's existing account.
    const email =
      decoded.email && decoded.email_verified === true ? decoded.email : null;
    if (!rawPhone && !email) {
      throw new UnauthorizedException(
        'Firebase token has no phone claim and no verified email',
      );
    }
    const phone = rawPhone ? this.normalizePhone(rawPhone) : null;
    // Google (and some providers) include the user's name in the token —
    // use it as the initial displayName so those users skip the
    // complete-profile step. Phone/email sign-ups have no name and fall
    // back to a placeholder, which the client treats as "profile incomplete".
    const displayName =
      typeof decoded.name === 'string' && decoded.name.trim().length > 0
        ? decoded.name.trim()
        : null;
    const avatarUrl =
      typeof decoded.picture === 'string' && decoded.picture.length > 0
        ? decoded.picture
        : null;
    if (
      !consent &&
      this.requireConsent &&
      !(await this.users.findFirebaseAccount({
        firebaseUid: decoded.uid,
        phone,
        email,
      }))
    ) {
      throw this.consentMissing();
    }
    let user = await this.users.findOrCreateByFirebase({
      firebaseUid: decoded.uid,
      phone,
      email,
      displayName,
      avatarUrl,
    });
    // A new account, or the notice changed since they last accepted it.
    if (consent && this.consent.needsNotice(user)) {
      user = await this.consent.accept(user.id, consent, 'app.signup');
    }
    await this.users.markLoggedIn(user.id);
    const tokens = await this.issueTokens(user.id);
    this.logger.log(
      `Firebase login ok (${decoded.firebase.sign_in_provider}) → user ${user.id}`,
    );
    return { user: this.sanitize(user), ...tokens };
  }

  async logout(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.refreshSecret, algorithms: [JWT_ALG] },
      );
      await this.redis.client.del(this.refreshKey(payload.sub, payload.jti));
    } catch {
      // swallow — already invalid
    }
    return { ok: true };
  }

  private async issueTokens(userId: string, deviceId?: string) {
    const jti = crypto.randomBytes(16).toString('hex');
    const accessPayload: AccessTokenPayload = { sub: userId, type: 'access' };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti,
      type: 'refresh',
    };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTtl,
    });

    await this.redis.client.set(
      this.refreshKey(userId, jti),
      this.hashToken(refreshToken),
      'EX',
      this.refreshTtl,
    );

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessTtl,
      refreshTokenExpiresIn: this.refreshTtl,
      deviceId,
    };
  }

  private normalizePhone(input: string): string {
    try {
      const num = parsePhoneNumberWithError(input, 'IN');
      if (!num.isValid()) throw new Error('not a valid phone number');
      return num.number;
    } catch (err) {
      const msg =
        err instanceof ParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'invalid';
      throw new BadRequestException(`Invalid phone number: ${msg}`);
    }
  }

  private refreshKey(userId: string, jti: string): string {
    return `refresh:${userId}:${jti}`;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Must mirror AuthController.serializeUser — in particular it has to include
  // `profileComplete`, or the client treats every fresh login as an incomplete
  // profile and re-shows the complete-profile screen on each sign-in.
  private sanitize(user: User) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.emailAlias,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tradeEmailsOptIn: user.tradeEmailsOptIn,
      status: user.status,
      profileComplete: this.users.isProfileComplete(user),
      // How this account signs in. Drives which identity field the client locks
      // in profile editing: 'email'/'google' → email is the login (locked),
      // 'phone' → phone is the login (locked). The OTHER field stays editable.
      authProvider:
        user.passwordHash != null
          ? 'email'
          : user.emailVerified
            ? 'google'
            : 'phone',
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      referralCode: user.referralCode,
      referredById: user.referredById,
      privacy: this.consent.view(user),
    };
  }
}
