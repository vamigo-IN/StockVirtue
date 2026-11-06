import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { has } from '../newsroom/articles/article-access';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { ConsentService } from './consent.service';
import {
  NOTICE_GATE_KEY,
  PrivacyNoticeService,
  type NoticeChange,
} from './privacy-notice.service';
import { NOTICE_MIN_APP_VERSION } from './privacy.constants';

/**
 * What a blocked account's app shows (§5.11.4): every app version from 1.0.2
 * shows a clean server message as written. Words for the lawyer (Owner
 * decisions); one line, no leading brace or bracket, no "Exception", not a
 * bare code, so the app's "looks technical" test passes it.
 */
export const NOTICE_REQUIRED_MESSAGE =
  "To keep using StockVirtue, read and accept our privacy notice: close the app and open it again. If you don't see the notice, update the app from Google Play. To get your data or delete your account instead, go to stockvirtue.com/privacy/requests.";

/** The tick a Super Admin gives to switch the gate on (§5.11.6), kept in the audit row. */
export const PLAY_CONFIRMATION =
  "App 1.4.0 or later is on Google Play's production track at 100% (not a staged rollout or a testing track), and has been for at least 2 days.";

/** How long the portal's "would block" counts are reused. */
const COUNTS_TTL_MS = 60_000;
const DAY_MS = 86_400_000;

export interface WouldBlock {
  active: number;
  /** Of those, signed in (or refreshed a token) in the last 30 days. */
  recent: number;
}

export interface GateView {
  /** The stored switch. */
  enabled: boolean;
  /** PRIVACY_NOTICE_GATE_DISABLED=true: off whatever the switch says. */
  forcedOff: boolean;
  /** Whether accounts are being blocked now (enabled and not forced off). */
  on: boolean;
  changedAt: Date | null;
  changedBy: string | null;
  playConfirmedAt: string | null;
  /** The notice version accounts must have accepted. */
  version: string;
  wouldBlock: WouldBlock;
}

const READ_PERMISSIONS = ['settings.read', 'privacy.manage', 'legal.manage'] as const;

/**
 * The app notice gate (W7 decision 2, addendum §5.11). While it is on, an app
 * account that hasn't accepted the current privacy notice can use only the
 * routes marked `@NoticeGateExempt()`; every other `JwtAuthGuard` route
 * answers 403 `notice_required`, the socket refuses it, and news pushes skip
 * it. It ships switched off: no `site_config` row means off. A Super Admin
 * switches it in Settings → Privacy (`legal.material`), and
 * `PRIVACY_NOTICE_GATE_DISABLED=true` forces it off. The switch is held in
 * memory by PrivacyNoticeService (loaded before the API serves, reloaded on
 * the Redis message), so a check costs no query.
 */
@Injectable()
export class NoticeGateService {
  private readonly forced: boolean;
  private counts: { version: string; at: number; value: WouldBlock } | null =
    null;

  constructor(
    private readonly notice: PrivacyNoticeService,
    private readonly consent: ConsentService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.forced = config.get('privacy', { infer: true }).noticeGateDisabled;
  }

  /** The engineering escape hatch is set (needs an API restart to change). */
  forcedOff(): boolean {
    return this.forced;
  }

  /** Whether the gate is blocking accounts now. */
  on(): boolean {
    return !this.forced && this.notice.gateSwitch().enabled;
  }

  /** Whether this account is refused outside the open routes. */
  blocks(user: Pick<User, 'noticeVersion' | 'adultConfirmedAt'>): boolean {
    return this.on() && this.consent.needsNotice(user);
  }

  /** Throws 403 `notice_required` for a blocked account (§5.11.4). */
  assertOpen(user: Pick<User, 'noticeVersion' | 'adultConfirmedAt'>): void {
    if (this.blocks(user)) throw this.refusal();
  }

  refusal(): ForbiddenException {
    return new ForbiddenException({
      message: NOTICE_REQUIRED_MESSAGE,
      code: 'notice_required',
      currentNoticeVersion: this.notice.current().version,
      minAppVersion: NOTICE_MIN_APP_VERSION,
    });
  }

  /** After a publish or a switch change (the socket gateway's sweep, §5.11.5). */
  onChange(listener: (c: NoticeChange) => void): () => void {
    return this.notice.onChange(listener);
  }

  /**
   * News pushes (§5.11.8): while the gate is on, the audience queries skip
   * accounts that haven't accepted the current version. Users are `u`.
   */
  audienceClause(): Prisma.Sql {
    if (!this.on()) return Prisma.empty;
    return Prisma.sql`AND u."noticeVersion" = ${this.notice.current().version} AND u."adultConfirmedAt" IS NOT NULL`;
  }

  /* ── Settings → Privacy (the portal's gate card) ───────────────────── */

  assertRead(actor: StaffPrincipal): void {
    if (READ_PERMISSIONS.some((p) => has(actor, p))) return;
    throw new ForbiddenException({
      message: 'You don’t have permission to see the privacy settings.',
      code: 'not_allowed',
    });
  }

  /** GET staff/site/privacy-notice/gate (§7.2). */
  async view(actor: StaffPrincipal): Promise<GateView> {
    this.assertRead(actor);
    return this.state();
  }

  private async state(fresh = false): Promise<GateView> {
    const sw = this.notice.gateSwitch();
    const changedBy = sw.updatedById
      ? ((
          await this.prisma.staffProfile.findUnique({
            where: { id: sw.updatedById },
            select: { displayName: true },
          })
        )?.displayName ?? null)
      : null;
    return {
      enabled: sw.enabled,
      forcedOff: this.forced,
      on: this.on(),
      changedAt: sw.updatedAt,
      changedBy,
      playConfirmedAt: sw.playConfirmedAt,
      version: this.notice.current().version,
      wouldBlock: await this.wouldBlock(fresh),
    };
  }

  /**
   * Active accounts that would be (or are) blocked, and of those the ones
   * used in the last 30 days (§5.11.6). Two counts, cached 60 s.
   */
  async wouldBlock(fresh = false): Promise<WouldBlock> {
    const version = this.notice.current().version;
    const c = this.counts;
    if (!fresh && c && c.version === version && Date.now() - c.at < COUNTS_TTL_MS) {
      return c.value;
    }
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      OR: [
        { noticeVersion: null },
        { noticeVersion: { not: version } },
        { adultConfirmedAt: null },
      ],
    };
    const [active, recent] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({
        where: { ...where, lastLoginAt: { gte: new Date(Date.now() - 30 * DAY_MS) } },
      }),
    ]);
    const value = { active, recent };
    this.counts = { version, at: Date.now(), value };
    return value;
  }

  /**
   * PUT staff/site/privacy-notice/gate (§5.11.6): Super Admins only
   * (`legal.material`). On needs the Play tick (400
   * `gate_confirmation_required`); off is always allowed and applies to the
   * next request in this process, and within moments everywhere (the Redis
   * message; the 5 s generation poll at worst). The row and its audit row
   * are written in one transaction.
   */
  async set(
    actor: StaffPrincipal,
    dto: { enabled: boolean; playConfirmed?: boolean },
    client: ClientInfo,
  ): Promise<{ gate: GateView }> {
    if (!has(actor, 'legal.material')) {
      throw new ForbiddenException({
        message: 'Only a Super Admin can switch the app notice gate on or off.',
        code: 'not_allowed',
      });
    }
    const enabled = dto.enabled === true;
    if (enabled && this.forced) {
      throw new ConflictException({
        message:
          'The app notice gate is switched off by the server configuration (PRIVACY_NOTICE_GATE_DISABLED). Ask engineering to remove it first.',
        code: 'gate_forced_off',
      });
    }
    if (enabled && dto.playConfirmed !== true) {
      throw new BadRequestException({
        message:
          'Confirm that app 1.4.0 or later has been on Google Play’s production track at 100% for at least 2 days.',
        code: 'gate_confirmation_required',
      });
    }
    const before = this.notice.gateSwitch();
    const version = this.notice.current().version;
    const wouldBlock = await this.wouldBlock(true);
    const now = new Date();
    const playConfirmedAt = enabled ? now.toISOString() : null;
    const value = { enabled, playConfirmedAt } as Prisma.InputJsonValue;
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.siteConfig.upsert({
        where: { key: NOTICE_GATE_KEY },
        create: { key: NOTICE_GATE_KEY, value, version: 1, updatedById: actor.staffId },
        update: { value, version: { increment: 1 }, updatedById: actor.staffId },
        select: { updatedAt: true },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: enabled ? 'privacy.gate.on' : 'privacy.gate.off',
          entityType: 'SiteConfig',
          entityId: NOTICE_GATE_KEY,
          before: { enabled: before.enabled },
          after: { enabled },
          meta: {
            version,
            wouldBlock: { active: wouldBlock.active, recent: wouldBlock.recent },
            ...(enabled ? { playConfirmed: PLAY_CONFIRMATION } : {}),
          },
          ...client,
        },
        tx,
      );
      return saved;
    });
    // This process first (the next request here sees it), then the others.
    this.notice.applyGate({
      enabled,
      playConfirmedAt,
      updatedById: actor.staffId,
      updatedAt: row.updatedAt,
    });
    await this.notice.broadcast();
    return { gate: await this.state() };
  }
}
