import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Admin, AdminSession } from '@prisma/client';
import { AdminConfig, AppConfig } from '../config/configuration';
import { enforceRateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { hashAdminPassword, verifyAdminPassword } from './admin-password';
import {
  AdminSessionPayload,
  signAdminSession,
  verifyAdminSession,
} from './admin-session';

/// Password rules for the admin credential. Length is the lever that actually
/// matters against offline cracking; composition rules mostly produce
/// predictable substitutions.
function passwordProblem(v: string): string | null {
  if (!v || v.length < 12) return 'Password must be at least 12 characters.';
  if (/^\d+$/.test(v)) return 'Password must not be only digits.';
  return null;
}

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
  fingerprint?: string | null;
  loginSessionId?: string | null;
}

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly cfg: AdminConfig;

  /// Dummy hash used to time-equalise logins for unknown emails. Computed
  /// ONCE at boot: the previous code re-ran scrypt (N=32768, 64 MB) inside
  /// every request for an unknown email, which is an unauthenticated CPU +
  /// memory amplification lever on POST /admin/login.
  private dummyHash = '';

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.cfg = config.get('admin', { infer: true });
  }

  /// The admin ACCOUNT is not managed from env, and there is no provisioning
  /// script. It exists only as a row in `admins`, so the password lives solely
  /// as a scrypt hash in the database — never in a file, a process environment,
  /// or a deploy pipeline. A DB-level unique index (`admins_singleton`) makes a
  /// second admin row impossible even via raw SQL. Rotate the password from
  /// Settings inside the authenticated panel; that is the only supported path.
  async onModuleInit() {
    if (!this.cfg.sessionSecret) {
      this.logger.error(
        'ADMIN_SESSION_SECRET (and the JWT_REFRESH_SECRET dev fallback) are blank — admin login WILL fail',
      );
    }
    // One scrypt run, at boot, off the request path. Used to time-equalise
    // logins for unknown emails.
    this.dummyHash = await hashAdminPassword(
      'placeholder-not-the-real-password',
    );

    const count = await this.prisma.admin.count();
    if (count === 0) {
      this.logger.warn(
        'No admin account exists in the `admins` table — the panel cannot be signed into until one is restored from backup',
      );
    }
  }

  /// Stage 1 of login: email + password only. Returns the Admin on success and
  /// throws UnauthorizedException otherwise. Issuing a session is a SEPARATE
  /// step (see issueSession) because Admin Shield inserts OTP + passcode
  /// verification in between.
  ///
  /// Rate-limited by IP (stops a spray) and by email (stops a slow grind).
  async verifyCredentials(
    emailRaw: string,
    password: string,
    requestIp?: string,
  ): Promise<Admin> {
    const email = emailRaw?.trim().toLowerCase() ?? '';
    if (!email || !password) {
      throw new UnauthorizedException('Email and password are required');
    }
    if (requestIp) {
      await enforceRateLimit(
        this.redis.client,
        `admin:login:ip:${requestIp}`,
        10,
        15 * 60,
        'Too many sign-in attempts from this device. Try again in 15 minutes.',
      );
    }
    await enforceRateLimit(
      this.redis.client,
      `admin:login:email:${email}`,
      5,
      15 * 60,
      'Too many sign-in attempts for this account. Try again in 15 minutes.',
    );
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    // Time-equalised so a missing row can't be detected by response time.
    const reference = admin?.passwordHash ?? this.dummyHash;
    const valid = await verifyAdminPassword(password, reference);
    if (!admin || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return admin;
  }

  /// Clears the login throttle counters. Called only once BOTH factors have
  /// passed — clearing at the password stage would let an attacker who knows
  /// the password reset the budget indefinitely, and not clearing at all would
  /// burn a legitimate operator's 5-attempt budget across one multi-stage
  /// login and self-lock them for 15 minutes.
  async clearLoginThrottles(email: string, requestIp?: string): Promise<void> {
    await Promise.all([
      this.redis.client.del(`admin:login:email:${email.toLowerCase()}`),
      requestIp
        ? this.redis.client.del(`admin:login:ip:${requestIp}`)
        : Promise.resolve(0),
    ]);
  }

  /// Creates the ACTIVE session row and signs the cookie. Enforces "one active
  /// session only" (spec §15) by revoking every other live session for this
  /// admin first; the caller emails the operator about the displacement.
  async issueSession(
    admin: Admin,
    ctx: SessionContext = {},
  ): Promise<{
    token: string;
    ttlSeconds: number;
    session: AdminSession;
    displaced: number;
  }> {
    const displaced = await this.revokeAllSessions(
      admin.id,
      'superseded by a new login',
    );
    const now = new Date();
    const session = await this.prisma.adminSession.create({
      data: {
        adminId: admin.id,
        loginSessionId: ctx.loginSessionId ?? null,
        fingerprint: ctx.fingerprint ?? null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        expiresAt: new Date(now.getTime() + this.cfg.sessionTtl * 1000),
      },
    });
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: now },
    });
    const { token } = signAdminSession(
      admin.id,
      session.id,
      this.cfg.sessionTtl,
      this.cfg.sessionSecret,
    );
    return { token, ttlSeconds: this.cfg.sessionTtl, session, displaced };
  }

  /// Exposed so the controller can sign/verify the short-lived pending-login
  /// cookie with the same key, without a second secret to rotate.
  get sessionSecret(): string {
    return this.cfg.sessionSecret;
  }

  /// Rotates the admin password from inside the authenticated panel.
  ///
  /// This is the ONLY rotation path: there is no provisioning script and no
  /// env seeding. That is deliberately stronger than a CLI — rotating now
  /// requires a live session, which means the password AND the emailed code
  /// AND the passcode, whereas a script only ever required shell access.
  ///
  /// Proving knowledge of the CURRENT password matters even though the caller
  /// is authenticated: it stops someone who walked up to an unlocked browser
  /// (or rode a stolen cookie) from silently taking ownership of the account.
  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId?: string,
  ): Promise<{ ok: boolean; message: string }> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!admin) return { ok: false, message: 'Account not found.' };

    if (!(await verifyAdminPassword(currentPassword, admin.passwordHash))) {
      return { ok: false, message: 'Current password is incorrect.' };
    }
    const problem = passwordProblem(newPassword);
    if (problem) return { ok: false, message: problem };
    if (currentPassword === newPassword) {
      return {
        ok: false,
        message: 'New password must differ from the current one.',
      };
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: await hashAdminPassword(newPassword) },
    });
    // Every other session was authorised by the OLD credential — end them.
    const revoked = await this.revokeAllSessions(
      adminId,
      'admin password changed',
      keepSessionId,
    );
    this.logger.log(
      `admin password rotated; ${revoked} other session(s) signed out`,
    );
    return {
      ok: true,
      message:
        revoked > 0
          ? `Password updated. ${revoked} other session(s) were signed out.`
          : 'Password updated.',
    };
  }

  verifySessionCookie(token: string | null): AdminSessionPayload | null {
    return verifyAdminSession(token, this.cfg.sessionSecret);
  }

  async findAdmin(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  async findSession(id: string): Promise<AdminSession | null> {
    return this.prisma.adminSession.findUnique({ where: { id } });
  }

  /// Marks a session as seen now — drives the idle timeout.
  async touchSession(id: string): Promise<void> {
    await this.prisma.adminSession
      .update({ where: { id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  async revokeSession(id: string, reason: string): Promise<void> {
    await this.prisma.adminSession
      .updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: reason },
      })
      .catch(() => undefined);
  }

  /// Revokes every live session for an admin. Returns how many were killed.
  async revokeAllSessions(
    adminId: string,
    reason: string,
    exceptId?: string,
  ): Promise<number> {
    const res = await this.prisma.adminSession.updateMany({
      where: {
        adminId,
        revokedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return res.count;
  }

  /// Idle + absolute expiry check (spec §16). Returns a reason string when the
  /// session is no longer usable, or null when it is still good.
  sessionExpiryReason(session: AdminSession, now = new Date()): string | null {
    if (session.revokedAt) return session.revokedReason || 'session revoked';
    if (session.expiresAt.getTime() <= now.getTime()) {
      return 'session lifetime elapsed';
    }
    const idleMs = this.cfg.shield.idleTimeout * 1000;
    if (now.getTime() - session.lastSeenAt.getTime() > idleMs) {
      return 'signed out after inactivity';
    }
    return null;
  }
}
