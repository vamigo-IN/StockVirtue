import {
  Body,
  Controller,
  Get,
  HttpStatus,
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
import { ADMIN_COOKIE_NAME, readCookie } from './admin-session';
import {
  auditBody,
  dashboardBody,
  healthBody,
  layout,
  learningBody,
  loginPage,
  messageDetailBody,
  messagesBody,
  monitoringActorBody,
  monitoringBody,
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

@Controller('admin')
export class AdminController {
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
  ) {}

  // ─── Login / logout ──────────────────────────────────────────────

  @Get('login')
  loginPage(@Query('back') back: string | undefined, @Res() res: Response) {
    res.type('html').send(loginPage({ back: back ?? '/admin' }));
  }

  @Post('login')
  async login(
    @Body() body: { email?: string; password?: string; back?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    try {
      const { admin, token, ttlSeconds } = await this.auth.login(
        body.email ?? '',
        body.password ?? '',
        req.ip,
      );
      res.cookie(ADMIN_COOKIE_NAME, token, {
        httpOnly: true,
        // 'strict' (not 'lax'): the admin panel never needs cross-site
        // navigation, and this is a primary CSRF defence — a cross-site POST
        // won't carry the cookie at all.
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ttlSeconds * 1000,
        path: '/admin',
      });
      await this.audit.log({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'login',
        ip: req.ip ?? null,
      });
      const back = (body.back ?? '/admin').startsWith('/admin')
        ? (body.back ?? '/admin')
        : '/admin';
      res.redirect(back);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as Error).message)
          : 'Sign-in failed';
      res
        .status(HttpStatus.UNAUTHORIZED)
        .type('html')
        .send(loginPage({ error: msg, back: body.back ?? '/admin' }));
    }
  }

  @Post('logout')
  logout(@Res() res: Response) {
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
            body: `<div class="text-zinc-400">No user with id <code>${id}</code>.</div>`,
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
            body: `<a href="/admin/messages" class="text-indigo-300">← Back</a><div class="text-zinc-400 mt-4">No message with id <code>${id}</code>.</div>`,
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
  async settings(@Req() req: Request, @Res() res: Response) {
    const adminEmail = await this.currentAdminEmail(req);
    res.type('html').send(
      layout({
        title: 'Settings',
        current: 'settings',
        adminEmail,
        body: settingsBody({
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
