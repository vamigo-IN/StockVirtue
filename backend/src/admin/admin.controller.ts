import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AchievementsService } from '../achievements/achievements.service';
import { LearnService } from '../learn/learn.service';
import { PortfolioSnapshotService } from '../portfolio/portfolio-snapshot.service';
import {
  FeatureFlagsService,
  FEATURE_MOBILE_OTP,
  FEATURE_TRADING_HALTED,
} from '../feature-flags/feature-flags.service';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin-auth.guard';
import { AdminHealthService } from './admin-health.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminShieldService } from './admin-shield.service';
import {
  ADMIN_COOKIE_NAME,
  ADMIN_PENDING_COOKIE_NAME,
  readCookie,
  signPendingLogin,
  verifyPendingLogin,
} from './admin-session';
import {
  auditBody,
  esc,
  dashboardBody,
  healthBody,
  layout,
  learningBody,
  loginPage,
  verifyPage,
  messageDetailBody,
  messagesBody,
  monitoringActorBody,
  monitoringBody,
  newsroomBody,
  notificationsBody,
  referralsBody,
  roomsBody,
  settingsBody,
  tradingBody,
  userDetailBody,
  usersBody,
} from './admin-views';
import { AbuseStatus, ContactStatus } from '@prisma/client';
import { MonitoringService } from '../monitoring/monitoring.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SiteService } from '../site/site.service';
import {
  ConsoleActor,
  SuperAdminsService,
} from '../staff/super-admins.service';

/// Deliberate, blocking delay used for the progressive wrong-password back-off
/// (spec §10). Bounded by PASSWORD_DELAYS_MS, so it cannot be used to pin
/// request handlers indefinitely.
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly auth: AdminAuthService,
    private readonly stats: AdminStatsService,
    private readonly health: AdminHealthService,
    private readonly snapshots: PortfolioSnapshotService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AdminAuditService,
    private readonly learn: LearnService,
    private readonly achievements: AchievementsService,
    private readonly site: SiteService,
    private readonly notifications: NotificationsService,
    private readonly monitoringSvc: MonitoringService,
    private readonly shield: AdminShieldService,
    private readonly superAdmins: SuperAdminsService,
  ) {}

  // ─── Login / logout ──────────────────────────────────────────────

  /// Cookie options shared by the auth + pending-login cookies. `path:'/admin'`
  /// is load-bearing — a cookie set on any other path is silently never sent
  /// back, and a clearCookie with a mismatched path leaves a valid cookie live.
  private cookieOpts(maxAgeMs: number) {
    return {
      httpOnly: true,
      // 'strict' (not 'lax'): the admin panel never needs cross-site
      // navigation, and this is a primary CSRF defence — a cross-site POST
      // won't carry the cookie at all. Synchroniser tokens back it up.
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production',
      maxAge: maxAgeMs,
      path: '/admin',
    };
  }

  /// Admin HTML must never be cached: these pages carry session state and the
  /// OTP challenge, and a back-button replay from a shared proxy would be a
  /// disclosure. AllExceptionsFilter renders JSON, so every handler below
  /// try/catches rather than letting an exception escape.
  private sendHtml(res: Response, body: string, status = HttpStatus.OK) {
    res.status(status).type('html');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(body);
  }

  private shieldCtx(req: Request, fp?: string) {
    return this.shield.buildContext(
      req.ip,
      req.headers['user-agent'],
      fp ?? null,
    );
  }

  @Get('login')
  loginPage(@Query('back') back: string | undefined, @Res() res: Response) {
    this.sendHtml(res, loginPage({ back: back ?? '/admin' }));
  }

  @Post('login')
  async login(
    @Body()
    body: { email?: string; password?: string; back?: string; fp?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = (body.back ?? '/admin').startsWith('/admin')
      ? (body.back ?? '/admin')
      : '/admin';
    const ctx = this.shieldCtx(req, body.fp);
    try {
      // Device blocking precedes credential work: a blocked fingerprint must
      // not be able to spend scrypt cycles or probe which emails exist.
      const blockedUntil = await this.shield.deviceBlockedUntil(
        ctx.fingerprint,
      );
      if (blockedUntil) {
        this.sendHtml(
          res,
          loginPage({
            error:
              'This device is temporarily blocked after repeated failed sign-ins. Try again later.',
            back,
          }),
          HttpStatus.TOO_MANY_REQUESTS,
        );
        return;
      }

      // Emergency protection (spec §25): during a coordinated attack we refuse
      // NEW sign-ins for a short window. Existing sessions are untouched — the
      // breaker must never become the attacker's way of locking you out.
      if (await this.shield.emergencyActive()) {
        this.sendHtml(
          res,
          loginPage({
            error:
              'Sign-in is temporarily paused after unusual activity. Please try again shortly.',
            back,
          }),
          HttpStatus.SERVICE_UNAVAILABLE,
        );
        return;
      }

      const admin = await this.auth.verifyCredentials(
        body.email ?? '',
        body.password ?? '',
        req.ip,
      );

      // Break-glass: with ADMIN_SHIELD=false the panel falls back to
      // password-only login so an SMTP outage can't strand the operator.
      if (!this.shield.enabled) {
        const issued = await this.auth.issueSession(admin, {
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          fingerprint: ctx.fingerprint,
        });
        res.cookie(
          ADMIN_COOKIE_NAME,
          issued.token,
          this.cookieOpts(issued.ttlSeconds * 1000),
        );
        await this.auth.clearLoginThrottles(admin.email, ctx.ip);
        await this.audit.log({
          adminId: admin.id,
          adminEmail: admin.email,
          action: 'login',
          detail: 'shield disabled',
          ip: req.ip ?? null,
        });
        res.redirect(back);
        return;
      }

      const session = await this.shield.beginLoginSession(admin, ctx);
      res.cookie(
        ADMIN_PENDING_COOKIE_NAME,
        signPendingLogin(session.id, 15 * 60, this.auth.sessionSecret),
        this.cookieOpts(15 * 60 * 1000),
      );
      await this.shield.clearPasswordFailures(ctx.ip);
      res.redirect(`/admin/login/verify?back=${encodeURIComponent(back)}`);
    } catch (err) {
      // Progressive back-off (spec §10): the account is NEVER locked, the
      // attempt just gets slower, and the 5th terminates the login session.
      await this.shield.noteGlobalAuthFailure(ctx);
      const delay = await this.shield.passwordFailureDelayMs(ctx);
      await sleep(delay);
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as Error).message)
          : 'Sign-in failed';
      this.sendHtml(
        res,
        loginPage({ error: msg, back }),
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  // ─── Second factor: OTP + passcode, verified independently ───────────
  //
  // These routes must NOT carry AdminGuard: no auth cookie exists yet, so the
  // guard would redirect to /admin/login and loop forever. They authorise off
  // the short-lived pending-login cookie instead, which grants nothing except
  // the right to submit factors for one login session.

  private async pendingSession(req: Request) {
    const token = readCookie(req.headers.cookie, ADMIN_PENDING_COOKIE_NAME);
    const payload = verifyPendingLogin(token, this.auth.sessionSecret);
    if (!payload) return null;
    return this.shield.loadLoginSession(payload.lsid);
  }

  private async renderVerify(
    req: Request,
    res: Response,
    back: string,
    msg: { otp?: string; passcode?: string; error?: string } = {},
    status = HttpStatus.OK,
  ) {
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    this.sendHtml(
      res,
      verifyPage({
        back,
        otpVerified: Boolean(session.otpVerifiedAt),
        passcodeVerified: Boolean(session.passcodeVerifiedAt),
        sessionId: session.id,
        otpMessage: msg.otp,
        passcodeMessage: msg.passcode,
        error: msg.error,
      }),
      status,
    );
  }

  @Get('login/verify')
  async loginVerifyPage(
    @Query('back') back: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.renderVerify(req, res, back ?? '/admin');
  }

  /// Delivery state of the verification email, polled by the verify screen so
  /// the operator can see the send land (or fail) instead of guessing. Returns
  /// only a coarse status — no code, no address, nothing sensitive.
  @Get('login/verify/status')
  async loginVerifyStatus(@Req() req: Request, @Res() res: Response) {
    const session = await this.pendingSession(req);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    if (!session) {
      res.status(HttpStatus.OK).json({ status: 'EXPIRED' });
      return;
    }
    res.status(HttpStatus.OK).json({
      status: await this.shield.emailStatus(session.id),
    });
  }

  @Post('login/verify/otp')
  async verifyOtp(
    @Body() body: { code?: string; back?: string; fp?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = body.back ?? '/admin';
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    const result = await this.shield.verifyOtp(
      session,
      (body.code ?? '').trim(),
      this.shieldCtx(req, body.fp),
    );
    if (result.terminated) {
      res.clearCookie(ADMIN_PENDING_COOKIE_NAME, { path: '/admin' });
      this.sendHtml(
        res,
        loginPage({ error: result.message, back }),
        HttpStatus.UNAUTHORIZED,
      );
      return;
    }
    await this.renderVerify(req, res, back, { otp: result.message });
  }

  @Post('login/verify/passcode')
  async verifyPasscode(
    @Body() body: { code?: string; back?: string; fp?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = body.back ?? '/admin';
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    const result = await this.shield.verifyPasscode(
      session,
      (body.code ?? '').trim(),
      this.shieldCtx(req, body.fp),
    );
    if (result.terminated) {
      res.clearCookie(ADMIN_PENDING_COOKIE_NAME, { path: '/admin' });
      this.sendHtml(
        res,
        loginPage({ error: result.message, back }),
        HttpStatus.UNAUTHORIZED,
      );
      return;
    }
    await this.renderVerify(req, res, back, { passcode: result.message });
  }

  @Post('login/verify/resend-otp')
  async resendOtp(
    @Body() body: { back?: string; fp?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = body.back ?? '/admin';
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    const r = await this.shield.resendOtp(
      session,
      this.shieldCtx(req, body.fp),
    );
    await this.renderVerify(req, res, back, { otp: r.message });
  }

  @Post('login/verify/resend-passcode')
  async resendPasscode(
    @Body() body: { back?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = body.back ?? '/admin';
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    const r = await this.shield.resendPasscode(session);
    await this.renderVerify(req, res, back, { passcode: r.message });
  }

  /// Final step — succeeds only when BOTH factors are verified.
  @Post('login/verify/complete')
  async completeLogin(
    @Body() body: { back?: string; fp?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const back = (body.back ?? '/admin').startsWith('/admin')
      ? (body.back ?? '/admin')
      : '/admin';
    const session = await this.pendingSession(req);
    if (!session) {
      res.redirect('/admin/login');
      return;
    }
    const issued = await this.shield.completeLogin(
      session,
      this.shieldCtx(req, body.fp),
    );
    if (!issued) {
      await this.renderVerify(
        req,
        res,
        back,
        { error: 'Verify both the code and the passcode first.' },
        HttpStatus.BAD_REQUEST,
      );
      return;
    }
    res.clearCookie(ADMIN_PENDING_COOKIE_NAME, { path: '/admin' });
    res.cookie(
      ADMIN_COOKIE_NAME,
      issued.token,
      this.cookieOpts(issued.ttlSeconds * 1000),
    );
    res.redirect(back);
  }

  @Post('logout')
  @UseGuards(AdminGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    const sid = (req as Request & { adminSessionId?: string }).adminSessionId;
    if (sid) await this.auth.revokeSession(sid, 'signed out');
    await this.audit.log({
      adminId: (req as Request & { adminId?: string }).adminId ?? null,
      adminEmail: await this.currentAdminEmail(req),
      action: 'logout',
      ip: req.ip ?? null,
    });
    res.clearCookie(ADMIN_COOKIE_NAME, { path: '/admin' });
    res.redirect('/admin/login');
  }

  // ─── Protected pages ─────────────────────────────────────────────

  @Get()
  @UseGuards(AdminGuard)
  async dashboard(@Req() req: Request, @Res() res: Response) {
    const overview = await this.stats.getOverview();
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Overview',
        current: 'dashboard',
        adminEmail,
        body: dashboardBody(overview),
      }),
    );
  }

  @Get('users')
  @UseGuards(AdminGuard)
  async users(
    @Req() req: Request,
    @Res() res: Response,
    @Query('q') q?: string,
    @Query('page') pageRaw?: string,
  ) {
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10)) : 1;
    const list = await this.stats.listUsers({ page, q });
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Users',
        current: 'users',
        adminEmail,
        body: usersBody(list),
      }),
    );
  }

  @Get('users/:id')
  @UseGuards(AdminGuard)
  async userDetail(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const detail = await this.stats.getUserDetail(id);
    const adminEmail = await this.currentAdminEmail(req);
    if (!detail) {
      res
        .status(HttpStatus.NOT_FOUND)
        .type('html')
        .send(
          layout({
            title: 'User not found',
            current: 'users',
            adminEmail,
            body: `<div class="text-zinc-400">No user with id <code>${esc(id)}</code>.</div>`,
          }),
        );
      return;
    }
    res.type('html').send(
      layout({
        title: detail.displayName ?? 'User',
        current: 'users',
        adminEmail,
        body: userDetailBody(detail),
      }),
    );
  }

  @Get('trading')
  @UseGuards(AdminGuard)
  async trading(
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') statusRaw?: string,
  ) {
    const status = (statusRaw ?? 'ALL').toUpperCase();
    const rows = await this.stats.listRecentOrders({ status, limit: 200 });
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Trading activity',
        current: 'trading',
        adminEmail,
        body: tradingBody({ status, rows }),
      }),
    );
  }

  @Get('rooms')
  @UseGuards(AdminGuard)
  async rooms(@Req() req: Request, @Res() res: Response) {
    const rows = await this.stats.listRooms();
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Trading rooms',
        current: 'rooms',
        adminEmail,
        body: roomsBody(rows),
      }),
    );
  }

  @Get('referrals')
  @UseGuards(AdminGuard)
  async referrals(@Req() req: Request, @Res() res: Response) {
    const rows = await this.stats.topReferrers(100);
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Referrals',
        current: 'referrals',
        adminEmail,
        body: referralsBody(rows),
      }),
    );
  }

  @Get('learning')
  @UseGuards(AdminGuard)
  async learningPage(@Req() req: Request, @Res() res: Response) {
    const [learn, achievements] = await Promise.all([
      this.learn.adminStats(),
      this.achievements.adminStats(),
    ]);
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Learning & achievements',
        current: 'learning',
        adminEmail,
        body: learningBody({ learn, achievements }),
      }),
    );
  }

  // ─── Contact messages ────────────────────────────────────────────

  @Get('messages')
  @UseGuards(AdminGuard)
  async messages(
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') statusRaw?: string,
    @Query('page') pageRaw?: string,
  ) {
    const status = (statusRaw ?? 'ALL').toUpperCase();
    const page = pageRaw ? Math.max(1, parseInt(pageRaw, 10)) : 1;
    const list = await this.site.listMessages({
      page,
      status: status as ContactStatus | 'ALL',
    });
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Messages',
        current: 'messages',
        adminEmail,
        body: messagesBody({
          rows: list.rows.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email,
            subject: m.subject,
            message: m.message,
            status: m.status,
            createdAt: m.createdAt.toISOString(),
            repliedAt: m.repliedAt?.toISOString() ?? null,
          })),
          total: list.total,
          newCount: list.newCount,
          page: list.page,
          pages: list.pages,
          status: String(list.status),
        }),
      }),
    );
  }

  @Get('messages/:id')
  @UseGuards(AdminGuard)
  async messageDetail(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const m = await this.site.getMessage(id);
    const adminEmail = await this.currentAdminEmail(req);
    if (!m) {
      res
        .status(HttpStatus.NOT_FOUND)
        .type('html')
        .send(
          layout({
            title: 'Message not found',
            current: 'messages',
            adminEmail,
            body: `<a href="/admin/messages" class="text-indigo-300">← Back</a><div class="text-zinc-400 mt-4">No message with id <code>${esc(id)}</code>.</div>`,
          }),
        );
      return;
    }
    // Opening a NEW message marks it read.
    await this.site.markReadIfNew(id);
    res.type('html').send(
      layout({
        title: m.subject || 'Message',
        current: 'messages',
        adminEmail,
        body: messageDetailBody({
          id: m.id,
          name: m.name,
          email: m.email,
          subject: m.subject,
          message: m.message,
          status: m.status === 'NEW' ? 'READ' : m.status,
          reply: m.reply,
          createdAt: m.createdAt.toISOString(),
          repliedAt: m.repliedAt?.toISOString() ?? null,
        }),
      }),
    );
  }

  @Post('messages/:id/status')
  @UseGuards(AdminGuard)
  async setMessageStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { status?: string },
    @Res() res: Response,
  ) {
    const allowed: ContactStatus[] = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'];
    const status = (body.status ?? '').toUpperCase() as ContactStatus;
    if (allowed.includes(status)) {
      await this.site.setMessageStatus(id, status);
      await this.auditAction(req, 'message.status', id, status);
    }
    res.redirect(`/admin/messages/${encodeURIComponent(id)}`);
  }

  @Post('messages/:id/reply')
  @UseGuards(AdminGuard)
  async replyMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { reply?: string },
    @Res() res: Response,
  ) {
    const reply = (body.reply ?? '').trim();
    if (reply) {
      await this.site.replyToMessage(id, reply);
      await this.auditAction(req, 'message.reply', id);
    }
    res.redirect(`/admin/messages/${encodeURIComponent(id)}`);
  }

  @Get('health')
  @UseGuards(AdminGuard)
  async healthPage(@Req() req: Request, @Res() res: Response) {
    const blocks = await this.health.snapshot();
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'System health',
        current: 'health',
        adminEmail,
        body: healthBody(blocks),
      }),
    );
  }

  @Get('settings')
  @UseGuards(AdminGuard)
  async settings(
    @Req() req: Request,
    @Res() res: Response,
    @Query('pw') pw?: string,
    @Query('ok') ok?: string,
  ) {
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Settings',
        current: 'settings',
        adminEmail,
        body: settingsBody({
          // Echoed from the password-change redirect. esc()'d in the view.
          passwordNotice: pw ? { ok: ok === '1', message: pw } : null,
          mobileOtp: {
            key: FEATURE_MOBILE_OTP,
            enabled: this.flags.isEnabled(FEATURE_MOBILE_OTP, false),
          },
          tradingHalted: {
            key: FEATURE_TRADING_HALTED,
            enabled: this.flags.isEnabled(FEATURE_TRADING_HALTED, false),
          },
        }),
      }),
    );
  }

  /// Toggle an auth-method feature flag. Only known keys are accepted so the
  /// form can't be used to write arbitrary flags. Bounces back to /settings.
  /// The ONLY admin password-rotation path (the provisioning script is gone).
  /// Guarded, CSRF-checked, and requires the CURRENT password even though the
  /// caller is already authenticated — so an unlocked browser or a stolen
  /// cookie cannot silently take ownership of the account.
  @Post('settings/password')
  @UseGuards(AdminGuard)
  async changeAdminPassword(
    @Req() req: Request,
    @Body() body: { current?: string; next?: string; confirm?: string },
    @Res() res: Response,
  ) {
    const r = req as Request & { adminId?: string; adminSessionId?: string };
    if (!r.adminId) {
      res.redirect('/admin/login');
      return;
    }
    let outcome: { ok: boolean; message: string };
    if (!body.next || body.next !== body.confirm) {
      outcome = { ok: false, message: 'New passwords do not match.' };
    } else {
      outcome = await this.auth.changePassword(
        r.adminId,
        body.current ?? '',
        body.next,
        r.adminSessionId,
      );
    }
    await this.auditAction(
      req,
      'admin.password.change',
      undefined,
      outcome.ok ? 'success' : `rejected: ${outcome.message}`,
    );
    res.redirect(
      `/admin/settings?pw=${encodeURIComponent(outcome.message)}&ok=${outcome.ok ? '1' : '0'}`,
    );
  }

  @Post('settings/feature-flag')
  @UseGuards(AdminGuard)
  async setFeatureFlag(
    @Req() req: Request,
    @Body() body: { key?: string; enabled?: string },
    @Res() res: Response,
  ) {
    const allowed: string[] = [FEATURE_MOBILE_OTP, FEATURE_TRADING_HALTED];
    if (body.key && allowed.includes(body.key)) {
      const enabled = body.enabled === 'true';
      await this.flags.setEnabled(body.key, enabled);
      await this.auditAction(req, 'flag.set', body.key, `enabled=${enabled}`);
    }
    res.redirect('/admin/settings');
  }

  /// Manual snapshot trigger — wired to the Run-snapshot button on the
  /// overview page. Runs sequentially across all ACTIVE users via the
  /// same code path the daily cron uses.
  @Post('snapshot/run')
  @UseGuards(AdminGuard)
  async runSnapshot(@Req() req: Request, @Res() res: Response) {
    await this.snapshots.runForAllUsers();
    await this.auditAction(req, 'snapshot.run');
    res.redirect('/admin');
  }

  // ─── Notifications: send a custom push ───────────────────────────

  @Get('notifications')
  @UseGuards(AdminGuard)
  async notificationsPage(
    @Req() req: Request,
    @Res() res: Response,
    @Query('sent') sentRaw?: string,
  ) {
    const adminEmail = await this.currentAdminEmail(req);
    const sent =
      sentRaw !== undefined ? { recipients: Number(sentRaw) || 0 } : null;
    res.type('html').send(
      layout({
        title: 'Notifications',
        current: 'notifications',
        adminEmail,
        body: notificationsBody({ sent }),
      }),
    );
  }

  /// Send a custom notification — to a single user or broadcast to all.
  /// Lands in the recipient's inbox, pushes in real time + via FCM.
  @Post('notifications/send')
  @UseGuards(AdminGuard)
  async sendNotification(
    @Req() req: Request,
    @Body()
    body: { audience?: string; userId?: string; title?: string; body?: string },
    @Res() res: Response,
  ) {
    const title = (body.title ?? '').trim();
    const message = (body.body ?? '').trim();
    if (!title || !message) {
      res.redirect('/admin/notifications');
      return;
    }
    if (body.audience === 'user' && body.userId?.trim()) {
      const userId = body.userId.trim();
      await this.notifications.create(userId, {
        kind: 'admin',
        title,
        body: message,
      });
      await this.auditAction(req, 'notification.send', userId, title);
      res.redirect('/admin/notifications?sent=1');
      return;
    }
    const { recipients } = await this.notifications.broadcast({
      kind: 'admin',
      title,
      body: message,
    });
    await this.auditAction(
      req,
      'notification.broadcast',
      'all',
      `${recipients} · ${title}`,
    );
    res.redirect(`/admin/notifications?sent=${recipients}`);
  }

  // ─── Monitoring / Traffic ────────────────────────────────────────

  @Get('monitoring')
  @UseGuards(AdminGuard)
  async monitoring(@Req() req: Request, @Res() res: Response) {
    const adminEmail = await this.currentAdminEmail(req);
    const [overview, topEndpoints, topIps, topUsers, flags, recentRaw] =
      await Promise.all([
        this.monitoringSvc.overview(),
        this.monitoringSvc.topEndpoints(),
        this.monitoringSvc.topActors('ip'),
        this.monitoringSvc.topActors('user'),
        this.monitoringSvc.recentFlags(),
        this.monitoringSvc.recentRequests(60),
      ]);
    const recent = recentRaw
      .map((s) => {
        try {
          const o = JSON.parse(s) as Record<string, unknown>;
          return {
            ts: new Date(o.t as number),
            method: String(o.method),
            route: String(o.route),
            status: Number(o.status),
            latencyMs: Number(o.ms),
            userId: (o.userId as string) ?? null,
            ip: (o.ip as string) ?? null,
          };
        } catch {
          return null;
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    res.type('html').send(
      layout({
        title: 'Traffic',
        current: 'monitoring',
        adminEmail,
        body: monitoringBody({
          overview,
          topEndpoints,
          topIps,
          topUsers,
          flags,
          recent,
        }),
      }),
    );
  }

  @Get('monitoring/:kind/:subject')
  @UseGuards(AdminGuard)
  async monitoringActor(
    @Req() req: Request,
    @Res() res: Response,
    @Param('kind') kind: string,
    @Param('subject') subject: string,
  ) {
    const adminEmail = await this.currentAdminEmail(req);
    const k = kind === 'user' ? 'user' : 'ip';
    const detail = await this.monitoringSvc.actorDetail(k, subject);
    res.type('html').send(
      layout({
        title: 'Traffic',
        current: 'monitoring',
        adminEmail,
        body: monitoringActorBody({
          kind: k,
          subject,
          blocked: detail.blocked,
          flags: detail.flags,
          logs: detail.logs,
        }),
      }),
    );
  }

  @Post('monitoring/block-ip')
  @UseGuards(AdminGuard)
  async blockIp(
    @Req() req: Request,
    @Body() body: { ip?: string },
    @Res() res: Response,
  ) {
    const ip = (body.ip ?? '').trim();
    if (ip) {
      await this.monitoringSvc.blockIp(ip);
      await this.auditAction(req, 'monitoring.block-ip', ip);
    }
    res.redirect('/admin/monitoring');
  }

  @Post('monitoring/unblock-ip')
  @UseGuards(AdminGuard)
  async unblockIp(
    @Req() req: Request,
    @Body() body: { ip?: string },
    @Res() res: Response,
  ) {
    const ip = (body.ip ?? '').trim();
    if (ip) {
      await this.monitoringSvc.unblockIp(ip);
      await this.auditAction(req, 'monitoring.unblock-ip', ip);
    }
    res.redirect('/admin/monitoring');
  }

  @Post('monitoring/flag/:id/:action')
  @UseGuards(AdminGuard)
  async flagAction(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('action') action: string,
    @Res() res: Response,
  ) {
    const status =
      action === 'ignore' ? AbuseStatus.IGNORED : AbuseStatus.ACKNOWLEDGED;
    await this.monitoringSvc.setFlagStatus(id, status);
    await this.auditAction(req, `monitoring.flag.${action}`, id);
    res.redirect('/admin/monitoring');
  }

  /// Toggle a user's blocked state. Wired to the Block / Unblock
  /// buttons on the user-detail page; bounces back to /admin/users/:id
  /// so the operator sees the new status immediately.
  @Post('users/:id/block')
  @UseGuards(AdminGuard)
  async blockUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.stats.setUserBlocked(id, true);
    await this.auditAction(req, 'user.block', id);
    res.redirect(`/admin/users/${encodeURIComponent(id)}`);
  }

  @Post('users/:id/unblock')
  @UseGuards(AdminGuard)
  async unblockUser(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.stats.setUserBlocked(id, false);
    await this.auditAction(req, 'user.unblock', id);
    res.redirect(`/admin/users/${encodeURIComponent(id)}`);
  }

  @Get('audit')
  @UseGuards(AdminGuard)
  async auditPage(@Req() req: Request, @Res() res: Response) {
    const rows = await this.audit.list(200);
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Audit log',
        current: 'audit',
        adminEmail,
        body: auditBody(rows),
      }),
    );
  }

  // ─── Newsroom: Super Admins of stockvirtue.com/admin ─────────────

  @Get('newsroom')
  @UseGuards(AdminGuard)
  async newsroomPage(
    @Req() req: Request,
    @Res() res: Response,
    @Query('msg') msg?: string,
    @Query('ok') ok?: string,
  ) {
    const [overview, adminEmail] = await Promise.all([
      this.superAdmins.overview(),
      this.currentAdminEmail(req),
    ]);
    this.sendHtml(
      res,
      layout({
        title: 'Newsroom',
        current: 'newsroom',
        adminEmail,
        body: newsroomBody({
          ...overview,
          // Echoed from the action redirect; esc()'d in the view.
          notice: msg ? { ok: ok === '1', message: msg.slice(0, 300) } : null,
        }),
      }),
    );
  }

  @Post('newsroom/super-admins')
  @UseGuards(AdminGuard)
  async addSuperAdmin(
    @Req() req: Request,
    @Body() body: { email?: string },
    @Res() res: Response,
  ) {
    const email = (body.email ?? '').trim();
    await this.newsroomAction(req, res, 'newsroom.superadmin.add', email, {
      run: async (by) => {
        const outcome = await this.superAdmins.add(email, by);
        if (outcome === 'invited') {
          return `Invitation sent to ${email}. They become a Super Admin once they accept it.`;
        }
        return outcome === 'granted'
          ? `${email} is now a Super Admin.`
          : `${email} is already a Super Admin.`;
      },
    });
  }

  @Post('newsroom/super-admins/:id/:action')
  @UseGuards(AdminGuard)
  async changeSuperAdmin(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('action') action: string,
    @Res() res: Response,
  ) {
    const actions: Record<
      string,
      { run: (by: ConsoleActor) => Promise<unknown>; done: string }
    > = {
      remove: {
        run: (by) => this.superAdmins.remove(id, by),
        done: 'Super Admin role removed.',
      },
      suspend: {
        run: (by) => this.superAdmins.suspend(id, by),
        done: 'Suspended. Their portal sessions have ended.',
      },
      reactivate: {
        run: (by) => this.superAdmins.reactivate(id, by),
        done: 'Access restored.',
      },
    };
    const chosen = actions[action];
    if (!chosen) {
      res.redirect('/admin/newsroom');
      return;
    }
    await this.newsroomAction(req, res, `newsroom.superadmin.${action}`, id, {
      run: async (by) => {
        await chosen.run(by);
        return chosen.done;
      },
    });
  }

  @Post('newsroom/invitations/:id/revoke')
  @UseGuards(AdminGuard)
  async revokeSuperAdminInvitation(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.newsroomAction(req, res, 'newsroom.invite.revoke', id, {
      run: async (by) => {
        await this.superAdmins.revokeInvitation(id, by);
        return 'Invitation cancelled.';
      },
    });
  }

  /// Runs a Super Admin change, records it in both audit logs, and bounces
  /// back to /admin/newsroom with the outcome.
  private async newsroomAction(
    req: Request,
    res: Response,
    action: string,
    target: string,
    step: { run: (by: ConsoleActor) => Promise<string> },
  ) {
    const by: ConsoleActor = {
      adminEmail: await this.currentAdminEmail(req),
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    };
    let ok = true;
    let message: string;
    try {
      message = await step.run(by);
    } catch (err) {
      ok = false;
      if (err instanceof HttpException) {
        message = err.message;
      } else {
        this.logger.error(`${action} failed: ${(err as Error).message}`);
        message = 'Something went wrong. Try again.';
      }
    }
    await this.auditAction(
      req,
      action,
      target,
      ok ? 'success' : `rejected: ${message}`,
    );
    res.redirect(
      `/admin/newsroom?msg=${encodeURIComponent(message)}&ok=${ok ? '1' : '0'}`,
    );
  }

  // ─── helpers ─────────────────────────────────────────────────────

  private async currentAdminEmail(req: Request): Promise<string> {
    const token = readCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    const payload = this.auth.verifySessionCookie(token);
    if (!payload) return 'unknown';
    const admin = await this.auth.findAdmin(payload.aid);
    return admin?.email ?? 'unknown';
  }

  /// Writes an audit-log row for a guarded action, resolving the acting admin
  /// (id from the guard, email from the session) and request IP.
  private async auditAction(
    req: Request,
    action: string,
    target?: string,
    detail?: string,
  ): Promise<void> {
    const adminId = (req as Request & { adminId?: string }).adminId ?? null;
    const adminEmail = await this.currentAdminEmail(req);
    await this.audit.log({
      adminId,
      adminEmail,
      action,
      target,
      detail,
      ip: req.ip ?? null,
    });
  }
}
