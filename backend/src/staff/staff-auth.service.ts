import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StaffChallengeStatus,
  StaffProfile,
  StaffStatus,
  User,
  UserStatus,
} from '@prisma/client';
import {
  generateOtp,
  hashCode,
  verifyCode,
} from '../admin/admin-shield.crypto';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyPassword } from '../common/password';
import { enforceRateLimit } from '../common/rate-limit';
import { AppConfig, NewsroomConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { RbacService, UserAccess } from '../rbac/rbac.service';
import { RedisService } from '../redis/redis.service';
import {
  maskEmail,
  newOpaqueToken,
  normalizeEmail,
  sha256Hex,
  staffCodeSecret,
} from './staff-crypto';
import { ClientInfo, StaffPrincipal } from './staff-request';

const MAX_CODE_ATTEMPTS = 5;
const MAX_CODE_RESENDS = 3;
/// Older sessions beyond this are signed out when a new one starts.
const MAX_ACTIVE_SESSIONS = 5;
/// lastSeenAt is written at most this often, not on every request.
const TOUCH_EVERY_MS = 60_000;

const INVALID_LOGIN = 'Incorrect email or password.';
const NO_ACCESS = "This account doesn't have access to the newsroom.";
const SUSPENDED =
  'Your newsroom access is suspended. Ask a newsroom admin to restore it.';
const RESTART = 'This sign-in attempt is no longer valid. Sign in again.';
const SIGN_IN = 'Sign in to the newsroom to continue.';
const IDLE = 'You were signed out after a period of inactivity. Sign in again.';
const EXPIRED = 'Your newsroom session has ended. Sign in again.';

/**
 * Why a staff session can't be used. Sent as `code` beside the message so the
 * portal can sign the browser out and say why, while an ordinary 403 (a
 * missing permission) leaves the session alone.
 */
export type StaffSessionEnd =
  | 'staff_session_required'
  | 'staff_session_expired'
  | 'staff_session_idle'
  | 'staff_session_revoked'
  | 'staff_suspended'
  | 'staff_blocked'
  | 'staff_no_access';

function sessionEnded(
  code: StaffSessionEnd,
  message: string,
  forbidden = false,
): UnauthorizedException | ForbiddenException {
  const body = { message, code };
  return forbidden
    ? new ForbiddenException(body)
    : new UnauthorizedException(body);
}

export interface StaffProfileView {
  id: string;
  userId: string;
  email: string | null;
  displayName: string;
  title: string | null;
  status: StaffStatus;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  lastPortalLoginAt: Date | null;
}

@Injectable()
export class StaffAuthService {
  private readonly logger = new Logger(StaffAuthService.name);
  private readonly cfg: NewsroomConfig;
  private readonly codeSecret: string;
  /// Hash checked when the email is unknown, so "no such account" takes as
  /// long as "wrong password" and response time can't reveal which.
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cfg = config.get('newsroom', { infer: true });
    this.codeSecret = staffCodeSecret(
      this.cfg.staffAuthSecret,
      config.get('jwt', { infer: true }).accessSecret,
    );
  }

  get idleTimeoutMinutes(): number {
    return this.cfg.sessionIdleMinutes;
  }

  // ── Step 1: password ────────────────────────────────────────────────

  async login(rawEmail: string, password: string, client: ClientInfo) {
    const email = normalizeEmail(rawEmail);
    await enforceRateLimit(
      this.redis.client,
      `staff:login:ip:${client.ip ?? 'unknown'}`,
      20,
      15 * 60,
      'Too many sign-in attempts. Try again in a few minutes.',
    );
    await enforceRateLimit(
      this.redis.client,
      `staff:login:email:${email}`,
      8,
      15 * 60,
      'Too many sign-in attempts for this account. Try again in a few minutes.',
    );

    const user = await this.prisma.user.findUnique({
      where: { emailAlias: email },
      include: { staffProfile: true },
    });
    const passwordOk = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : await this.burnPasswordCheck(password);
    if (!user || !passwordOk) {
      await this.audit.recordSafely({
        actor: { userId: user?.id ?? null, email },
        action: 'staff.login.failed',
        meta: { reason: 'credentials' },
        ...client,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const staff = await this.assertCanUsePortal(user, user.staffProfile);

    // One live challenge at a time: a new sign-in voids any earlier code.
    await this.prisma.staffLoginChallenge.updateMany({
      where: { staffId: staff.id, status: StaffChallengeStatus.PENDING },
      data: { status: StaffChallengeStatus.EXPIRED },
    });
    const code = generateOtp();
    const challenge = await this.prisma.staffLoginChallenge.create({
      data: {
        staffId: staff.id,
        codeHash: hashCode(code, this.codeSecret),
        expiresAt: this.codeExpiry(),
        ip: client.ip,
        userAgent: client.userAgent,
      },
    });
    await this.sendCode(challenge.id, email, code);
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      sentTo: maskEmail(email),
    };
  }

  async resend(challengeId: string, client: ClientInfo) {
    await enforceRateLimit(
      this.redis.client,
      `staff:resend:ip:${client.ip ?? 'unknown'}`,
      10,
      15 * 60,
      'Too many codes requested. Try again in a few minutes.',
    );
    const challenge = await this.prisma.staffLoginChallenge.findUnique({
      where: { id: challengeId },
      include: { staff: { include: { user: true } } },
    });
    if (!challenge || challenge.status !== StaffChallengeStatus.PENDING) {
      throw new BadRequestException(RESTART);
    }
    if (challenge.resends >= MAX_CODE_RESENDS) {
      throw new BadRequestException(
        'Too many codes requested for this sign-in. Sign in again.',
      );
    }
    const email = challenge.staff.user.emailAlias;
    if (!email) throw new BadRequestException(RESTART);
    const code = generateOtp();
    const updated = await this.prisma.staffLoginChallenge.update({
      where: { id: challenge.id },
      data: {
        codeHash: hashCode(code, this.codeSecret),
        attempts: 0,
        resends: { increment: 1 },
        expiresAt: this.codeExpiry(),
      },
    });
    await this.sendCode(challenge.id, email, code);
    return { expiresAt: updated.expiresAt, sentTo: maskEmail(email) };
  }

  // ── Step 2: emailed code → session ──────────────────────────────────

  async verify(challengeId: string, code: string, client: ClientInfo) {
    await enforceRateLimit(
      this.redis.client,
      `staff:verify:ip:${client.ip ?? 'unknown'}`,
      30,
      15 * 60,
      'Too many attempts. Try again in a few minutes.',
    );
    const challenge = await this.prisma.staffLoginChallenge.findUnique({
      where: { id: challengeId },
      include: { staff: { include: { user: true } } },
    });
    if (!challenge || challenge.status !== StaffChallengeStatus.PENDING) {
      throw new BadRequestException(RESTART);
    }
    if (challenge.expiresAt.getTime() <= Date.now()) {
      await this.prisma.staffLoginChallenge.update({
        where: { id: challenge.id },
        data: { status: StaffChallengeStatus.EXPIRED },
      });
      throw new BadRequestException(
        'This code has expired. Sign in again to get a new one.',
      );
    }
    const { staff } = challenge;
    const actor = { userId: staff.userId, email: staff.user.emailAlias };

    if (!verifyCode(code, challenge.codeHash, this.codeSecret)) {
      const attempts = challenge.attempts + 1;
      const failed = attempts >= MAX_CODE_ATTEMPTS;
      await this.prisma.staffLoginChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts,
          status: failed
            ? StaffChallengeStatus.FAILED
            : StaffChallengeStatus.PENDING,
        },
      });
      await this.audit.recordSafely({
        actor,
        action: 'staff.login.code_failed',
        meta: { attempts, locked: failed },
        ...client,
      });
      if (failed) {
        throw new BadRequestException(
          'Too many wrong codes. Sign in again to get a new one.',
        );
      }
      const left = MAX_CODE_ATTEMPTS - attempts;
      throw new BadRequestException(
        `That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`,
      );
    }

    // Re-check: access may have been suspended between the two steps.
    await this.assertCanUsePortal(staff.user, staff);

    const token = newOpaqueToken();
    const now = new Date();
    const session = await this.prisma.$transaction(async (tx) => {
      // Claim the challenge atomically so one code can open one session only,
      // even if two requests race with it.
      const claimed = await tx.staffLoginChallenge.updateMany({
        where: { id: challenge.id, status: StaffChallengeStatus.PENDING },
        data: { status: StaffChallengeStatus.VERIFIED, verifiedAt: now },
      });
      if (claimed.count !== 1) throw new BadRequestException(RESTART);
      const created = await tx.staffSession.create({
        data: {
          staffId: staff.id,
          tokenHash: sha256Hex(token),
          ip: client.ip,
          userAgent: client.userAgent,
          expiresAt: new Date(
            now.getTime() + this.cfg.sessionMaxHours * 3_600_000,
          ),
        },
      });
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: { lastPortalLoginAt: now },
      });
      await this.audit.record(
        {
          actor,
          action: 'staff.login',
          entityType: 'StaffSession',
          entityId: created.id,
          ...client,
        },
        tx,
      );
      return created;
    });
    await this.trimSessions(staff.id);

    const access = await this.rbac.accessFor(staff.userId);
    return {
      token,
      expiresAt: session.expiresAt,
      idleTimeoutMinutes: this.cfg.sessionIdleMinutes,
      staff: this.profileView(staff, staff.user, access),
    };
  }

  // ── Session checks (StaffAuthGuard) ─────────────────────────────────

  async authenticate(
    token: string,
    client: ClientInfo,
  ): Promise<StaffPrincipal> {
    if (!token || token.length > 200) {
      throw sessionEnded('staff_session_required', SIGN_IN);
    }
    const session = await this.prisma.staffSession.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: {
        staff: {
          include: {
            user: { select: { id: true, emailAlias: true, status: true } },
          },
        },
      },
    });
    if (!session) throw sessionEnded('staff_session_required', SIGN_IN);
    if (session.revokedAt) throw this.revokedError(session.revokedReason);
    const now = Date.now();
    if (session.expiresAt.getTime() <= now) {
      await this.revoke(session.id, 'expired');
      throw sessionEnded('staff_session_expired', EXPIRED);
    }
    if (
      session.lastSeenAt.getTime() + this.cfg.sessionIdleMinutes * 60_000 <=
      now
    ) {
      await this.revoke(session.id, 'idle');
      throw sessionEnded('staff_session_idle', IDLE);
    }
    const { staff } = session;
    if (staff.status !== StaffStatus.ACTIVE) {
      await this.revoke(session.id, 'suspended');
      throw sessionEnded('staff_suspended', SUSPENDED, true);
    }
    if (staff.user.status === UserStatus.BLOCKED) {
      await this.revoke(session.id, 'blocked');
      throw sessionEnded('staff_blocked', 'This account is blocked.');
    }
    const access = await this.rbac.accessFor(staff.userId);
    if (access.roles.length === 0) {
      throw sessionEnded('staff_no_access', NO_ACCESS, true);
    }

    if (now - session.lastSeenAt.getTime() >= TOUCH_EVERY_MS) {
      await this.prisma.staffSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      });
    }
    return {
      sessionId: session.id,
      staffId: staff.id,
      userId: staff.userId,
      email: staff.user.emailAlias,
      displayName: staff.displayName,
      roles: access.roles,
      permissions: access.permissions,
      ip: client.ip,
      userAgent: client.userAgent,
    };
  }

  // ── Signed-in actions ───────────────────────────────────────────────

  async me(principal: StaffPrincipal): Promise<StaffProfileView> {
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: principal.staffId },
      include: { user: true },
    });
    if (!staff) throw sessionEnded('staff_session_required', SIGN_IN);
    return this.profileView(staff, staff.user, {
      roles: principal.roles,
      permissions: principal.permissions,
    });
  }

  /** The signed-in person's own portal name and job title. */
  async updateProfile(
    principal: StaffPrincipal,
    patch: { displayName?: string; title?: string },
  ): Promise<StaffProfileView> {
    const data: { displayName?: string; title?: string | null } = {};
    if (patch.displayName !== undefined) {
      const name = patch.displayName.trim();
      if (name.length < 2) {
        throw new BadRequestException(
          'Use at least 2 characters for your name.',
        );
      }
      data.displayName = name;
    }
    if (patch.title !== undefined) data.title = patch.title.trim() || null;
    if (Object.keys(data).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const before = await tx.staffProfile.findUniqueOrThrow({
          where: { id: principal.staffId },
          select: { displayName: true, title: true },
        });
        const after = await tx.staffProfile.update({
          where: { id: principal.staffId },
          data,
          select: { displayName: true, title: true },
        });
        await this.audit.record(
          {
            actor: { userId: principal.userId, email: principal.email },
            action: 'staff.profile.update',
            entityType: 'StaffProfile',
            entityId: principal.staffId,
            before,
            after,
            ip: principal.ip,
            userAgent: principal.userAgent,
          },
          tx,
        );
      });
    }
    return this.me(principal);
  }

  async logout(principal: StaffPrincipal): Promise<void> {
    await this.revoke(principal.sessionId, 'logout');
    await this.audit.recordSafely({
      actor: { userId: principal.userId, email: principal.email },
      action: 'staff.logout',
      entityType: 'StaffSession',
      entityId: principal.sessionId,
      ip: principal.ip,
      userAgent: principal.userAgent,
    });
  }

  async listSessions(principal: StaffPrincipal) {
    const rows = await this.prisma.staffSession.findMany({
      where: {
        staffId: principal.staffId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastSeenAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      current: s.id === principal.sessionId,
    }));
  }

  async revokeOwnSession(principal: StaffPrincipal, sessionId: string) {
    const result = await this.prisma.staffSession.updateMany({
      where: { id: sessionId, staffId: principal.staffId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'signed_out_by_user' },
    });
    if (result.count === 0) throw new NotFoundException('Session not found.');
    await this.audit.recordSafely({
      actor: { userId: principal.userId, email: principal.email },
      action: 'staff.session.revoke',
      entityType: 'StaffSession',
      entityId: sessionId,
      ip: principal.ip,
      userAgent: principal.userAgent,
    });
  }

  /** Signs this person out everywhere except the browser asking. */
  async revokeOtherSessions(principal: StaffPrincipal) {
    const result = await this.prisma.staffSession.updateMany({
      where: {
        staffId: principal.staffId,
        revokedAt: null,
        id: { not: principal.sessionId },
      },
      data: { revokedAt: new Date(), revokedReason: 'signed_out_by_user' },
    });
    if (result.count > 0) {
      await this.audit.recordSafely({
        actor: { userId: principal.userId, email: principal.email },
        action: 'staff.session.revoke_others',
        entityType: 'StaffProfile',
        entityId: principal.staffId,
        meta: { sessions: result.count },
        ip: principal.ip,
        userAgent: principal.userAgent,
      });
    }
    return { signedOut: result.count };
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async assertCanUsePortal(
    user: Pick<User, 'id' | 'status' | 'emailVerified'>,
    staff: StaffProfile | null,
  ): Promise<StaffProfile> {
    if (user.status === UserStatus.BLOCKED) {
      throw new ForbiddenException('This account is blocked.');
    }
    const access = await this.rbac.accessFor(user.id);
    if (!staff || access.roles.length === 0) {
      throw new ForbiddenException(NO_ACCESS);
    }
    if (staff.status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException(SUSPENDED);
    }
    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Verify your email address in the StockVirtue app before signing in to the newsroom.',
      );
    }
    return staff;
  }

  /**
   * A session that was ended explicitly says why, so a suspended or blocked
   * person learns it on their next click instead of at the next sign-in.
   */
  private revokedError(reason: string | null) {
    switch (reason) {
      case 'suspended':
        return sessionEnded('staff_suspended', SUSPENDED);
      case 'blocked':
        return sessionEnded('staff_blocked', 'This account is blocked.');
      case 'idle':
        return sessionEnded('staff_session_idle', IDLE);
      case 'expired':
        return sessionEnded('staff_session_expired', EXPIRED);
      case 'signed_out_by_admin':
        return sessionEnded(
          'staff_session_revoked',
          'A newsroom admin ended this session. Sign in again.',
        );
      case 'signed_out_by_user':
      case 'session_limit':
        return sessionEnded(
          'staff_session_revoked',
          'This session was signed out from another device. Sign in again.',
        );
      default:
        return sessionEnded('staff_session_required', SIGN_IN);
    }
  }

  private async sendCode(challengeId: string, email: string, code: string) {
    try {
      await this.mail.sendStaffLoginCode(
        email,
        code,
        this.cfg.loginCodeTtlSeconds,
      );
    } catch (err) {
      this.logger.error(`Sign-in code email failed: ${(err as Error).message}`);
      await this.prisma.staffLoginChallenge.update({
        where: { id: challengeId },
        data: { status: StaffChallengeStatus.EXPIRED },
      });
      throw new ServiceUnavailableException(
        "We couldn't email your sign-in code. Try again in a minute.",
      );
    }
  }

  private codeExpiry(): Date {
    return new Date(Date.now() + this.cfg.loginCodeTtlSeconds * 1000);
  }

  private async revoke(sessionId: string, reason: string): Promise<void> {
    await this.prisma.staffSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Keeps only the newest MAX_ACTIVE_SESSIONS sessions signed in. */
  private async trimSessions(staffId: string): Promise<void> {
    const extra = await this.prisma.staffSession.findMany({
      where: { staffId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      skip: MAX_ACTIVE_SESSIONS,
      select: { id: true },
    });
    if (extra.length === 0) return;
    await this.prisma.staffSession.updateMany({
      where: { id: { in: extra.map((s) => s.id) } },
      data: { revokedAt: new Date(), revokedReason: 'session_limit' },
    });
  }

  private burnPasswordCheck(password: string): Promise<boolean> {
    this.dummyHash ??= hashPassword('stockvirtue-timing-equaliser');
    return this.dummyHash
      .then((h) => verifyPassword(password, h))
      .then(() => false);
  }

  profileView(
    staff: StaffProfile,
    user: Pick<User, 'emailAlias'>,
    access: UserAccess,
  ): StaffProfileView {
    return {
      id: staff.id,
      userId: staff.userId,
      email: user.emailAlias,
      displayName: staff.displayName,
      title: staff.title,
      status: staff.status,
      roles: access.roles,
      permissions: [...access.permissions].sort(),
      isSuperAdmin: access.roles.includes(SUPER_ADMIN),
      lastPortalLoginAt: staff.lastPortalLoginAt,
    };
  }
}
