import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Admin,
  AdminEmailStatus,
  AdminLoginSession,
  AdminLoginStatus,
} from '@prisma/client';
import { AdminConfig, AppConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import {
  MAX_OTP_ATTEMPTS,
  MAX_OTP_RESENDS,
  MAX_PASSCODE_ATTEMPTS,
  MAX_PASSCODE_RESENDS,
  MAX_PASSWORD_ATTEMPTS,
  EMERGENCY_FAIL_THRESHOLD,
  EMERGENCY_LOCK_SEC,
  EMERGENCY_WINDOW_SEC,
  PASSWORD_DELAYS_MS,
  RK,
  derivePasscode,
  generateOtp,
  hashCode,
  passcodeCandidates,
  transformOtp,
  verifyCode,
} from './admin-shield.crypto';

/// Device + network context for one request, derived entirely server-side.
export interface ShieldContext {
  ip: string;
  userAgent: string;
  browser: string;
  os: string;
  device: string;
  fingerprint: string;
  timezone: string | null;
  /// Populated only when an IP-geolocation provider is configured. None is
  /// today, so these stay null rather than inventing a location.
  country: string | null;
  city: string | null;
  isp: string | null;
}

export interface FactorResult {
  ok: boolean;
  /// Operator-facing message. Deliberately uniform on failure so it never
  /// discloses which factor or how close a guess was.
  message: string;
  /// True when the whole login session was killed by this failure.
  terminated: boolean;
  remaining: number;
}

const GENERIC_FAIL = 'That code is not correct.';

@Injectable()
export class AdminShieldService {
  private readonly logger = new Logger(AdminShieldService.name);
  private readonly cfg: AdminConfig;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly audit: AdminAuditService,
    private readonly auth: AdminAuthService,
  ) {
    this.cfg = config.get('admin', { infer: true });
  }

  get enabled(): boolean {
    return this.cfg.shield.enabled;
  }

  get otpTtlSeconds(): number {
    return this.cfg.shield.otpTtl;
  }

  // ── Request context ───────────────────────────────────────────────────

  /// Derives browser / OS / device from the User-Agent and folds the client
  /// signals (screen, timezone, language, platform) into a stable fingerprint.
  /// Hand-rolled: there is no ua-parser-js in this project and adding a
  /// dependency for six regexes isn't worth it.
  buildContext(
    ip: string | undefined,
    userAgent: string | undefined,
    clientSignals?: string | null,
  ): ShieldContext {
    const ua = (userAgent ?? '').slice(0, 400);
    const browser = matchFirst(ua, [
      [/Edg\//, 'Edge'],
      [/OPR\/|Opera/, 'Opera'],
      [/Chrome\//, 'Chrome'],
      [/Firefox\//, 'Firefox'],
      [/Safari\//, 'Safari'],
    ]);
    const os = matchFirst(ua, [
      [/Windows NT 10|Windows NT 11/, 'Windows'],
      [/Windows/, 'Windows'],
      [/Android/, 'Android'],
      [/iPhone|iPad|iOS/, 'iOS'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/Linux/, 'Linux'],
    ]);
    const device = /Mobile|iPhone|Android/.test(ua)
      ? 'Mobile'
      : /iPad|Tablet/.test(ua)
        ? 'Tablet'
        : 'Desktop';

    // Client signals arrive as an opaque string from a hidden field. It is
    // never trusted for authorisation — only hashed into the fingerprint —
    // so its contents can't be used to impersonate a device, only to make a
    // device look NEW (which triggers MORE verification, never less).
    const signals = (clientSignals ?? '').slice(0, 500);
    const tz = /tz=([A-Za-z0-9_+\-/]{1,64})/.exec(signals)?.[1] ?? null;
    const fingerprint = createHash('sha256')
      .update(`${ua}|${signals}`)
      .digest('hex')
      .slice(0, 32);

    return {
      ip: ip ?? 'unknown',
      userAgent: ua,
      browser,
      os,
      device,
      fingerprint,
      timezone: tz,
      country: null,
      city: null,
      isp: null,
    };
  }

  // ── Device blocking (spec §13) ────────────────────────────────────────

  /// The admin ACCOUNT is never locked (that would be a trivial self-DoS);
  /// the offending device fingerprint is blocked instead.
  async deviceBlockedUntil(fingerprint: string): Promise<Date | null> {
    const row = await this.prisma.adminDevice.findUnique({
      where: { fingerprint },
    });
    if (!row?.blockedUntil) return null;
    if (row.blockedUntil.getTime() <= Date.now()) return null;
    return row.blockedUntil;
  }

  /// Records a failed login session against the device and blocks it once the
  /// threshold is crossed. Deliberately does NOT call MonitoringService
  /// blockIp(): those blocks are effectively permanent (nothing ever removes
  /// the IP from the `mon:block:ips` set — only the marker key expires), so
  /// auto-blocking there could lock the operator out with no in-app recovery.
  private async recordDeviceFailure(
    ctx: ShieldContext,
    reason: string,
  ): Promise<void> {
    const threshold = this.cfg.shield.deviceFailThreshold;
    const device = await this.prisma.adminDevice.upsert({
      where: { fingerprint: ctx.fingerprint },
      create: {
        fingerprint: ctx.fingerprint,
        lastIp: ctx.ip,
        lastUserAgent: ctx.userAgent,
        failedSessions: 1,
      },
      update: {
        failedSessions: { increment: 1 },
        lastIp: ctx.ip,
        lastUserAgent: ctx.userAgent,
        lastSeenAt: new Date(),
      },
    });
    if (device.trusted || device.failedSessions < threshold) return;

    const until = new Date(
      Date.now() + this.cfg.shield.deviceBlockMinutes * 60_000,
    );
    await this.prisma.adminDevice.update({
      where: { fingerprint: ctx.fingerprint },
      data: { blockedUntil: until, blockReason: reason, failedSessions: 0 },
    });
    await this.log(null, 'shield.device.blocked', ctx, reason);
    await this.alert(
      '🚫 Admin device blocked',
      'Device temporarily blocked',
      `${device.failedSessions} failed login sessions from this device. It is blocked until ${until.toISOString()}.`,
      ctx,
    );
  }

  // ── Progressive password back-off (spec §10) ──────────────────────────

  /// Delay (ms) to apply after the Nth consecutive wrong password from this
  /// IP. The account is never locked; the attempt just gets slower, and the
  /// login session is terminated after the last step.
  async passwordFailureDelayMs(ctx: ShieldContext): Promise<number> {
    const key = RK.loginIp(ctx.ip);
    const n = await this.redis.client.incr(key).catch(() => 1);
    if (n === 1) {
      await this.redis.client.expire(key, 15 * 60).catch(() => 0);
    }
    if (n >= MAX_PASSWORD_ATTEMPTS) {
      await this.recordDeviceFailure(ctx, 'repeated wrong password');
      return PASSWORD_DELAYS_MS[PASSWORD_DELAYS_MS.length - 1];
    }
    return PASSWORD_DELAYS_MS[Math.min(n - 1, PASSWORD_DELAYS_MS.length - 1)];
  }

  // ── Emergency protection (spec §25) ───────────────────────────────────

  /// True while the circuit breaker is open. Checked before NEW logins only —
  /// already-authenticated sessions keep working, because locking the operator
  /// out during an attack is exactly what the attacker wants.
  async emergencyActive(): Promise<boolean> {
    const v = await this.redis.client.get(RK.emergency).catch(() => null);
    return v !== null;
  }

  /// Counts failed admin logins GLOBALLY (across every IP) and trips the
  /// breaker past the threshold. Per-IP throttles cannot see a distributed
  /// attempt by construction — each source stays under its own limit — so this
  /// window is deliberately not keyed by IP.
  async noteGlobalAuthFailure(ctx: ShieldContext): Promise<void> {
    let n = 0;
    try {
      n = await this.redis.client.incr(RK.failWindow);
      if (n === 1) {
        await this.redis.client.expire(RK.failWindow, EMERGENCY_WINDOW_SEC);
      }
    } catch {
      return; // Redis down: fail open rather than block the operator.
    }
    if (n < EMERGENCY_FAIL_THRESHOLD) return;
    // Set only if absent, so a sustained attack doesn't keep extending the
    // window forever (which would hand the attacker a permanent lockout).
    const fresh = await this.redis.client
      .set(RK.emergency, String(Date.now()), 'EX', EMERGENCY_LOCK_SEC, 'NX')
      .catch(() => null);
    if (!fresh) return;
    await this.redis.client.del(RK.failWindow).catch(() => 0);
    await this.log(null, 'shield.emergency.tripped', ctx, `${n} failures`);
    await this.alert(
      '🚨 StockVirtue admin under coordinated attack',
      'Emergency protection engaged',
      `${n} failed admin sign-ins in under ${Math.round(EMERGENCY_WINDOW_SEC / 60)} minutes, across multiple sources. New sign-ins are refused for ${Math.round(EMERGENCY_LOCK_SEC / 60)} minutes. Any session you already have open is unaffected.`,
      ctx,
    );
  }

  async clearPasswordFailures(ip: string): Promise<void> {
    await this.redis.client.del(RK.loginIp(ip)).catch(() => 0);
  }

  // ── Login session lifecycle ───────────────────────────────────────────

  /// Stage 2: the password was correct. Creates the login-session record,
  /// mints the OTP + passcode, and emails the TRANSFORMED OTP.
  ///
  /// Any earlier in-flight attempt for this admin is terminated first, so a
  /// previously-issued OTP can never be replayed (spec §6).
  async beginLoginSession(
    admin: Admin,
    ctx: ShieldContext,
  ): Promise<AdminLoginSession> {
    await this.prisma.adminLoginSession.updateMany({
      where: {
        email: admin.email,
        status: { in: [AdminLoginStatus.PENDING, AdminLoginStatus.OTP_SENT] },
      },
      data: {
        status: AdminLoginStatus.TERMINATED,
        terminatedReason: 'superseded by a newer login attempt',
      },
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.otpTtlSeconds * 1000);
    const otp = generateOtp();
    const passcode = derivePasscode(now);

    const session = await this.prisma.adminLoginSession.create({
      data: {
        adminId: admin.id,
        email: admin.email,
        otpHash: hashCode(otp, this.secret),
        otpExpiresAt: expiresAt,
        passcodeHash: hashCode(passcode, this.secret),
        passcodeExpiresAt: expiresAt,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        browser: ctx.browser,
        os: ctx.os,
        device: ctx.device,
        fingerprint: ctx.fingerprint,
        timezone: ctx.timezone,
        country: ctx.country,
        city: ctx.city,
        isp: ctx.isp,
        status: AdminLoginStatus.OTP_SENT,
        expiresAt,
      },
    });

    // Dispatched in the BACKGROUND. Awaiting SMTP here held the operator on a
    // spinning login page for as long as the mail provider took to accept the
    // message. The verification screen polls `otpEmailStatus` instead, so the
    // wait is visible and interruptible rather than a frozen form.
    this.dispatchOtpEmail(session, otp, ctx);
    await this.log(
      admin.id,
      'shield.login.started',
      ctx,
      `session ${session.id}`,
    );
    return session;
  }

  /// Fire-and-forget wrapper around [sendOtpEmail] that records the delivery
  /// outcome on the login session. Never rejects: an unhandled rejection here
  /// would be an unhandled promise rejection on the auth path.
  private dispatchOtpEmail(
    session: AdminLoginSession,
    realOtp: string,
    ctx: ShieldContext,
  ): void {
    void (async () => {
      const started = Date.now();
      try {
        await this.sendOtpEmail(session, realOtp, ctx);
        await this.markEmail(session.id, 'SENT');
        this.logger.log(
          `admin OTP email sent for ${session.id} in ${Date.now() - started}ms`,
        );
      } catch (err) {
        await this.markEmail(session.id, 'FAILED');
        this.logger.error(
          `admin OTP email FAILED for ${session.id}: ${(err as Error).message}`,
        );
      }
    })();
  }

  private async markEmail(id: string, status: AdminEmailStatus): Promise<void> {
    await this.prisma.adminLoginSession
      .update({
        where: { id },
        data: { otpEmailStatus: status, otpEmailAt: new Date() },
      })
      .catch(() => undefined);
  }

  /// Emails the transformed OTP. The REAL otp never leaves the server.
  private async sendOtpEmail(
    session: AdminLoginSession,
    realOtp: string,
    ctx: ShieldContext,
  ): Promise<void> {
    const emailed = transformOtp(realOtp);
    const body = [
      this.mail.para(
        'Someone is attempting to sign in to the <b>StockVirtue Admin Panel</b>.',
      ),
      this.mail.heroCard({
        eyebrow: 'Verification code',
        value: emailed,
        caption: `Expires in ${Math.max(1, Math.round(this.otpTtlSeconds / 60))} minute(s)`,
        tone: 'neutral',
      }),
      this.mail.detailTable([
        { label: 'Time (IST)', value: istStamp(session.createdAt) },
        { label: 'Browser', value: ctx.browser },
        { label: 'Operating system', value: ctx.os },
        { label: 'Device', value: ctx.device },
        { label: 'IP address', value: ctx.ip },
        { label: 'Timezone', value: ctx.timezone ?? '—' },
        { label: 'Login session', value: session.id },
      ]),
      this.mail.para(
        '<b>If this wasn’t you, do not continue with this login.</b> No one can complete sign-in without this code and your passcode.',
      ),
    ].join('');

    await this.mail.notify(
      await this.alertRecipient(),
      '⚠️ StockVirtue Admin Login Verification',
      'Admin login verification',
      body,
      `Admin login attempt. Verification code: ${emailed}. IP ${ctx.ip}, ${ctx.browser} on ${ctx.os}. Session ${session.id}. If this wasn't you, do not continue.`,
    );

    // Local-development affordance: with no SMTP transport the email is
    // discarded, which would make the admin panel impossible to sign into on a
    // dev machine. Mirrors MailService's own [DEV-EMAIL] fallback. Gated on
    // `!configured`, and MailService THROWS rather than falling back when
    // NODE_ENV=production, so this can never disclose a code in production.
    if (!this.mail.configured) {
      this.logger.warn(
        `[DEV-OTP] session ${session.id} — emailed code ${emailed}`,
      );
    }
  }

  /// Re-issues the OTP for an in-flight session and re-sends the email.
  async resendOtp(session: AdminLoginSession, ctx: ShieldContext) {
    if (session.otpVerifiedAt) {
      return { ok: false, message: 'That code is already verified.' };
    }
    if (session.otpResends >= MAX_OTP_RESENDS) {
      return { ok: false, message: 'Too many resends for this login.' };
    }
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);
    const updated = await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: {
        otpHash: hashCode(otp, this.secret),
        otpExpiresAt: expiresAt,
        otpAttempts: 0,
        otpResends: { increment: 1 },
        expiresAt: laterOf(expiresAt, session.passcodeExpiresAt),
        // Back to PENDING so the screen shows this send in flight, not the
        // outcome of the previous one.
        otpEmailStatus: 'PENDING',
        otpEmailAt: null,
      },
    });
    this.dispatchOtpEmail(updated, otp, ctx);
    return { ok: true, message: 'Sending a new code…' };
  }

  /// Delivery state of the verification email for an in-flight login, polled
  /// by the verification screen.
  async emailStatus(id: string): Promise<AdminEmailStatus> {
    const s = await this.prisma.adminLoginSession
      .findUnique({ where: { id }, select: { otpEmailStatus: true } })
      .catch(() => null);
    return s?.otpEmailStatus ?? 'PENDING';
  }

  /// Re-derives the passcode from the CURRENT time (spec: the passcode is set
  /// when the session starts; resending re-sets it to "now", which is what the
  /// operator reads off their clock).
  async resendPasscode(session: AdminLoginSession) {
    if (session.passcodeVerifiedAt) {
      return { ok: false, message: 'The passcode is already verified.' };
    }
    if (session.passcodeResends >= MAX_PASSCODE_RESENDS) {
      return { ok: false, message: 'Too many resets for this login.' };
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.otpTtlSeconds * 1000);
    await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: {
        passcodeHash: hashCode(derivePasscode(now), this.secret),
        passcodeExpiresAt: expiresAt,
        passcodeAttempts: 0,
        passcodeResends: { increment: 1 },
        expiresAt: laterOf(expiresAt, session.otpExpiresAt),
      },
    });
    return {
      ok: true,
      message: 'Passcode reset.',
    };
  }

  // ── Factor verification (independent, spec: two fields, two buttons) ──

  async verifyOtp(
    session: AdminLoginSession,
    code: string,
    ctx: ShieldContext,
  ): Promise<FactorResult> {
    if (session.otpVerifiedAt) {
      return {
        ok: true,
        message: 'Code already verified.',
        terminated: false,
        remaining: 0,
      };
    }
    if (isExpired(session.otpExpiresAt)) {
      await this.terminate(session, 'otp expired', ctx);
      return {
        ok: false,
        message: 'That code has expired. Start again.',
        terminated: true,
        remaining: 0,
      };
    }
    const attempts = session.otpAttempts + 1;
    const ok = verifyCode(code, session.otpHash, this.secret);
    if (ok) {
      await this.prisma.adminLoginSession.update({
        where: { id: session.id },
        data: { otpVerifiedAt: new Date(), otpAttempts: attempts },
      });
      await this.log(session.adminId, 'shield.otp.verified', ctx);
      return {
        ok: true,
        message: 'Code verified.',
        terminated: false,
        remaining: 0,
      };
    }
    await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: { otpAttempts: attempts },
    });
    await this.log(
      session.adminId,
      'shield.otp.failed',
      ctx,
      `attempt ${attempts}`,
    );
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await this.terminate(session, 'too many wrong OTP attempts', ctx);
      return {
        ok: false,
        message: 'Too many incorrect codes. Start again.',
        terminated: true,
        remaining: 0,
      };
    }
    return {
      ok: false,
      message: GENERIC_FAIL,
      terminated: false,
      remaining: MAX_OTP_ATTEMPTS - attempts,
    };
  }

  async verifyPasscode(
    session: AdminLoginSession,
    code: string,
    ctx: ShieldContext,
  ): Promise<FactorResult> {
    if (session.passcodeVerifiedAt) {
      return {
        ok: true,
        message: 'Passcode already verified.',
        terminated: false,
        remaining: 0,
      };
    }
    if (isExpired(session.passcodeExpiresAt)) {
      await this.terminate(session, 'passcode expired', ctx);
      return {
        ok: false,
        message: 'The passcode has expired. Start again.',
        terminated: true,
        remaining: 0,
      };
    }
    const attempts = session.passcodeAttempts + 1;
    // The passcode is a pure function of the clock, so it is verified by
    // recomputation over a ±1 minute window anchored at the moment it was
    // issued (expiry minus the TTL). The stored hash keeps the plaintext out
    // of the database but cannot itself cover the tolerance window.
    const base = session.passcodeExpiresAt
      ? new Date(
          session.passcodeExpiresAt.getTime() - this.otpTtlSeconds * 1000,
        )
      : session.createdAt;
    const ok = passcodeCandidates(base).some((c) => timingEq(c, code));
    if (ok) {
      await this.prisma.adminLoginSession.update({
        where: { id: session.id },
        data: { passcodeVerifiedAt: new Date(), passcodeAttempts: attempts },
      });
      await this.log(session.adminId, 'shield.passcode.verified', ctx);
      return {
        ok: true,
        message: 'Passcode verified.',
        terminated: false,
        remaining: 0,
      };
    }
    await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: { passcodeAttempts: attempts },
    });
    await this.log(
      session.adminId,
      'shield.passcode.failed',
      ctx,
      `attempt ${attempts}`,
    );
    if (attempts >= MAX_PASSCODE_ATTEMPTS) {
      await this.terminate(session, 'too many wrong passcode attempts', ctx);
      return {
        ok: false,
        message: 'Too many incorrect passcodes. Start again.',
        terminated: true,
        remaining: 0,
      };
    }
    return {
      ok: false,
      message: GENERIC_FAIL,
      terminated: false,
      remaining: MAX_PASSCODE_ATTEMPTS - attempts,
    };
  }

  // ── Completion ────────────────────────────────────────────────────────

  /// Issues the real session once BOTH factors are verified. Terminates every
  /// other active session and emails the success notice.
  async completeLogin(
    session: AdminLoginSession,
    ctx: ShieldContext,
  ): Promise<{ token: string; ttlSeconds: number } | null> {
    if (!session.otpVerifiedAt || !session.passcodeVerifiedAt) return null;
    if (!session.adminId) return null;
    const admin = await this.auth.findAdmin(session.adminId);
    if (!admin) return null;

    const issued = await this.auth.issueSession(admin, {
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      fingerprint: ctx.fingerprint,
      loginSessionId: session.id,
    });

    await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: { status: AdminLoginStatus.SUCCESS, succeededAt: new Date() },
    });
    // Both factors passed — only now is it safe to clear the throttles.
    await this.auth.clearLoginThrottles(admin.email, ctx.ip);
    await this.clearPasswordFailures(ctx.ip);
    // A clean login resets the device's failure streak.
    await this.prisma.adminDevice
      .updateMany({
        where: { fingerprint: ctx.fingerprint },
        data: { failedSessions: 0, lastSeenAt: new Date() },
      })
      .catch(() => undefined);

    await this.log(
      admin.id,
      'shield.login.success',
      ctx,
      `session ${session.id}`,
    );
    await this.sendSuccessEmail(session, ctx, issued.displaced);
    return { token: issued.token, ttlSeconds: issued.ttlSeconds };
  }

  private async sendSuccessEmail(
    session: AdminLoginSession,
    ctx: ShieldContext,
    displaced: number,
  ): Promise<void> {
    const body = [
      this.mail.para(
        'Your <b>StockVirtue Admin Panel</b> session has started.',
      ),
      this.mail.detailTable([
        { label: 'Time (IST)', value: istStamp(new Date()) },
        { label: 'Browser', value: ctx.browser },
        { label: 'Operating system', value: ctx.os },
        { label: 'Device', value: ctx.device },
        { label: 'IP address', value: ctx.ip },
        { label: 'Login session', value: session.id },
      ]),
      displaced > 0
        ? this.mail.para(
            `<b>${displaced}</b> other active session(s) were signed out, because only one admin session may be active at a time.`,
          )
        : '',
      this.mail.para('<b>If this wasn’t you, investigate immediately.</b>'),
    ].join('');
    await this.safeMail(
      '✅ Admin Login Successful',
      'Admin login successful',
      body,
      `Admin login successful at ${istStamp(new Date())} IST from ${ctx.ip} (${ctx.browser} on ${ctx.os}). If this wasn't you, investigate immediately.`,
    );
  }

  // ── Termination + notifications ───────────────────────────────────────

  async terminate(
    session: AdminLoginSession,
    reason: string,
    ctx: ShieldContext,
  ): Promise<void> {
    await this.prisma.adminLoginSession.update({
      where: { id: session.id },
      data: {
        status: AdminLoginStatus.TERMINATED,
        terminatedReason: reason,
        // Burn both factors so nothing survives the termination.
        otpHash: null,
        passcodeHash: null,
      },
    });
    await this.recordDeviceFailure(ctx, reason);
    await this.log(session.adminId, 'shield.login.terminated', ctx, reason);
    await this.alert(
      '⚠️ StockVirtue admin login blocked',
      'Login attempt blocked',
      `A login attempt was terminated: ${reason}.`,
      ctx,
    );
  }

  async loadLoginSession(id: string): Promise<AdminLoginSession | null> {
    const s = await this.prisma.adminLoginSession.findUnique({ where: { id } });
    if (!s) return null;
    if (
      s.status !== AdminLoginStatus.OTP_SENT &&
      s.status !== AdminLoginStatus.PENDING &&
      s.status !== AdminLoginStatus.VERIFIED
    ) {
      return null;
    }
    if (isExpired(s.expiresAt)) return null;
    return s;
  }

  /// Security notification (spec §19). Best-effort: a mail failure must never
  /// block or leak into the auth decision.
  private async alert(
    subject: string,
    heading: string,
    what: string,
    ctx: ShieldContext,
  ): Promise<void> {
    const body = [
      this.mail.para(what),
      this.mail.detailTable([
        { label: 'Time (IST)', value: istStamp(new Date()) },
        { label: 'IP address', value: ctx.ip },
        { label: 'Browser', value: ctx.browser },
        { label: 'Operating system', value: ctx.os },
        { label: 'Device', value: ctx.device },
        { label: 'Fingerprint', value: ctx.fingerprint.slice(0, 16) },
      ]),
    ].join('');
    await this.safeMail(subject, heading, body, `${what} IP ${ctx.ip}.`);
  }

  private async safeMail(
    subject: string,
    heading: string,
    html: string,
    text: string,
  ): Promise<void> {
    try {
      await this.mail.notify(
        await this.alertRecipient(),
        subject,
        heading,
        html,
        text,
      );
    } catch (err) {
      this.logger.warn(`admin security mail failed: ${(err as Error).message}`);
    }
  }

  private async log(
    adminId: string | null,
    action: string,
    ctx: ShieldContext,
    detail?: string,
  ): Promise<void> {
    await this.audit.log({
      adminId,
      // Never write an attacker-supplied email into the audit table.
      adminEmail: await this.adminEmail(),
      action,
      target: ctx.fingerprint.slice(0, 16),
      detail: [detail, `${ctx.browser}/${ctx.os}/${ctx.device}`]
        .filter(Boolean)
        .join(' · '),
      ip: ctx.ip,
    });
  }

  private get secret(): string {
    return this.cfg.sessionSecret;
  }

  /// The admin account now lives only in the database, so the real address is
  /// read from there rather than from env. Cached — it changes only when the
  /// account is re-provisioned, which requires a restart-free script run but
  /// is rare enough that a process-lifetime cache is fine.
  private cachedAdminEmail: string | null = null;
  private async adminEmail(): Promise<string> {
    if (this.cachedAdminEmail) return this.cachedAdminEmail;
    const admin = await this.prisma.admin
      .findFirst({ orderBy: { createdAt: 'asc' } })
      .catch(() => null);
    this.cachedAdminEmail = admin?.email ?? this.cfg.email;
    return this.cachedAdminEmail;
  }

  /// Where security notifications go: an explicit override if configured,
  /// otherwise the admin's own address from the database.
  private async alertRecipient(): Promise<string> {
    return this.cfg.shield.alertEmail || (await this.adminEmail());
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function matchFirst(s: string, table: Array<[RegExp, string]>): string {
  for (const [re, label] of table) if (re.test(s)) return label;
  return 'Unknown';
}

function isExpired(d: Date | null | undefined): boolean {
  return !d || d.getTime() <= Date.now();
}

function laterOf(a: Date, b: Date | null | undefined): Date {
  return !b || a.getTime() > b.getTime() ? a : b;
}

/// Length-safe constant-time-ish string compare for short numeric codes.
function timingEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
function istStamp(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}
