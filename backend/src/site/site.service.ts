import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ContactStatus, MediaStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, escapeHtml } from '../mail/mail.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { StorageService } from '../storage/storage.service';
import {
  badAdsTxtLine,
  badRobotsLine,
  readConfig,
  SiteConfig,
  SiteConfigGroup,
  tidyLines,
} from './site-config';
import { ContactDto, UpdateSiteSettingsDto } from './site.dto';

const SINGLETON = 'singleton';

// A type alias (not an interface) so it is assignable to Prisma JSON input.
type Social = {
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  facebook?: string;
};

export interface PublicSiteSettings {
  siteTitle: string;
  siteDescription: string;
  contactEmail: string;
  playStoreUrl: string;
  social: Social;
  headCode: string;
  bodyStartCode: string;
  bodyEndCode: string;
}

/** Raw HTML injected into every public page: needs its own permission. */
export const CODE_FIELDS = [
  'headCode',
  'bodyStartCode',
  'bodyEndCode',
] as const;

/** Which settings a save would change, compared field by field. */
export function changedSettings(
  current: PublicSiteSettings,
  next: PublicSiteSettings,
): (keyof PublicSiteSettings)[] {
  return (Object.keys(next) as (keyof PublicSiteSettings)[]).filter(
    (k) =>
      JSON.stringify(current[k] ?? null) !== JSON.stringify(next[k] ?? null),
  );
}

/** A branding image as the website and the portal use it. */
export interface SiteImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

/** What the website reads: the basics plus the config, images resolved. */
export interface PublicSite extends PublicSiteSettings {
  config: Omit<SiteConfig, 'branding'> & {
    branding: {
      logo: SiteImage | null;
      favicon: SiteImage | null;
      shareImage: SiteImage | null;
      themeColor: string;
    };
  };
}

const DEFAULTS: PublicSiteSettings = {
  siteTitle: '',
  siteDescription: '',
  contactEmail: '',
  playStoreUrl: '',
  social: {},
  headCode: '',
  bodyStartCode: '',
  bodyEndCode: '',
};

@Injectable()
export class SiteService {
  private readonly logger = new Logger(SiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly storage: StorageService,
  ) {}

  /** Read the singleton settings; returns defaults when none saved yet. */
  async get(): Promise<PublicSite> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    const config = readConfig(row?.config);
    const images = await this.images(config);
    const pick = (id: string | null) => (id && images.get(id)) || null;
    return {
      ...(row ? this.shape(row) : DEFAULTS),
      config: {
        ...config,
        branding: {
          logo: pick(config.branding.logoMediaId),
          favicon: pick(config.branding.faviconMediaId),
          shareImage: pick(config.branding.shareImageMediaId),
          themeColor: config.branding.themeColor,
        },
      },
    };
  }

  /** The config for the portal: ids as saved, plus their images. */
  async getConfigForStaff() {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    const config = readConfig(row?.config);
    const images = await this.images(config);
    return {
      config,
      images: Object.fromEntries(images),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /**
   * Saves one group of the config. The route checks the group's permission
   * (branding and analytics: settings.update, search: seo.update, ads:
   * ads.manage); old and new values land in the audit log.
   */
  async updateConfig<G extends SiteConfigGroup>(
    actor: StaffPrincipal,
    group: G,
    input: SiteConfig[G],
    client: ClientInfo,
  ) {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    const current = readConfig(row?.config);
    const next = await this.checkGroup(group, input);
    if (JSON.stringify(current[group]) !== JSON.stringify(next)) {
      const config = { ...current, [group]: next };
      await this.prisma.$transaction(async (tx) => {
        await tx.siteSetting.upsert({
          where: { id: SINGLETON },
          create: {
            id: SINGLETON,
            config: config as unknown as Prisma.InputJsonValue,
          },
          update: { config: config as unknown as Prisma.InputJsonValue },
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: `site.config.${group}`,
            entityType: 'SiteSetting',
            entityId: SINGLETON,
            before: current[group] as unknown as Prisma.InputJsonValue,
            after: next as unknown as Prisma.InputJsonValue,
            ...client,
          },
          tx,
        );
      });
    }
    return this.getConfigForStaff();
  }

  /** Validates and tidies one group beyond what its DTO checks. */
  private async checkGroup<G extends SiteConfigGroup>(
    group: G,
    input: SiteConfig[G],
  ): Promise<SiteConfig[G]> {
    if (group === 'branding') {
      const b = input as SiteConfig['branding'];
      const next: SiteConfig['branding'] = {
        logoMediaId: b.logoMediaId ?? null,
        faviconMediaId: b.faviconMediaId ?? null,
        shareImageMediaId: b.shareImageMediaId ?? null,
        themeColor: b.themeColor.toLowerCase(),
      };
      const ids = [
        next.logoMediaId,
        next.faviconMediaId,
        next.shareImageMediaId,
      ].filter((id): id is string => !!id);
      const ready = await this.prisma.mediaAsset.count({
        where: { id: { in: ids }, status: MediaStatus.READY },
      });
      if (ready !== new Set(ids).size) {
        throw new BadRequestException(
          'Pick the logo, favicon and share image from the media library.',
        );
      }
      return next as SiteConfig[G];
    }
    if (group === 'search') {
      const s = input as SiteConfig['search'];
      const bad = badRobotsLine(s.robotsExtra);
      if (bad) {
        throw new BadRequestException(
          `robots.txt only takes User-agent, Allow, Disallow, Crawl-delay, Sitemap and # comment lines. Fix: "${bad.slice(0, 80)}"`,
        );
      }
      const handle = s.twitterHandle.replace(/^@/, '');
      return {
        ...s,
        twitterHandle: handle ? `@${handle}` : '',
        keywords: s.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
          .join(', '),
        robotsExtra: tidyLines(s.robotsExtra),
      } as SiteConfig[G];
    }
    if (group === 'ads') {
      const a = input as SiteConfig['ads'];
      const bad = badAdsTxtLine(a.adsTxt);
      if (bad) {
        throw new BadRequestException(
          `This ads.txt line isn't a valid record: "${bad.slice(0, 80)}". Use "domain, account id, DIRECT or RESELLER[, certification id]".`,
        );
      }
      return { ...a, adsTxt: tidyLines(a.adsTxt) } as SiteConfig[G];
    }
    return { ...input };
  }

  /** READY media library images the config points at, by id. */
  private async images(config: SiteConfig): Promise<Map<string, SiteImage>> {
    const ids = [
      config.branding.logoMediaId,
      config.branding.faviconMediaId,
      config.branding.shareImageMediaId,
    ].filter((id): id is string => !!id);
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.mediaAsset.findMany({
      where: { id: { in: ids }, status: MediaStatus.READY },
      select: { id: true, storageKey: true, width: true, height: true },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          url: this.storage.publicUrl(r.storageKey),
          width: r.width,
          height: r.height,
        },
      ]),
    );
  }

  /** Settings plus when they last changed, for the staff portal. */
  async getForStaff() {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    return {
      settings: row ? this.shape(row) : DEFAULTS,
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /**
   * Saves the singleton settings from the staff portal. Changing any injected
   * code block also needs settings.code_injection, since that HTML runs on
   * every public page. Old and new values land in the audit log.
   */
  async updateByStaff(
    actor: StaffPrincipal,
    dto: UpdateSiteSettingsDto,
    client: ClientInfo,
  ) {
    const next: PublicSiteSettings = {
      siteTitle: dto.siteTitle?.trim() ?? '',
      siteDescription: dto.siteDescription?.trim() ?? '',
      contactEmail: dto.contactEmail?.trim() ?? '',
      playStoreUrl: dto.playStoreUrl?.trim() ?? '',
      social: Object.fromEntries(
        Object.entries(dto.social ?? {})
          .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : ''])
          .filter(([, v]) => v),
      ) as Social,
      headCode: dto.headCode ?? '',
      bodyStartCode: dto.bodyStartCode ?? '',
      bodyEndCode: dto.bodyEndCode ?? '',
    };
    const current = await this.get();
    const changed = changedSettings(current, next);
    const codeChanged = changed.filter((k) =>
      (CODE_FIELDS as readonly string[]).includes(k),
    );
    if (
      codeChanged.length > 0 &&
      !actor.roles.includes(SUPER_ADMIN) &&
      !actor.permissions.has('settings.code_injection')
    ) {
      throw new ForbiddenException(
        'Changing injected code needs the "settings.code_injection" permission. Your other changes were not saved either.',
      );
    }
    if (changed.length > 0) {
      const data = { ...next, social: next.social as object };
      await this.prisma.$transaction(async (tx) => {
        await tx.siteSetting.upsert({
          where: { id: SINGLETON },
          create: { id: SINGLETON, ...data },
          update: data,
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action:
              codeChanged.length > 0
                ? 'site.settings.code_injection'
                : 'site.settings.update',
            entityType: 'SiteSetting',
            entityId: SINGLETON,
            before: Object.fromEntries(changed.map((k) => [k, current[k]])),
            after: Object.fromEntries(changed.map((k) => [k, next[k]])),
            meta: { changed },
            ...client,
          },
          tx,
        );
      });
      this.logger.log(
        `Site settings updated by ${actor.email}: ${changed.join(', ')}`,
      );
    }
    return { ...(await this.getForStaff()), changed };
  }

  /**
   * Handle a contact-form submission: persist it first (so it's never lost and
   * always shows in the admin panel), then send the admin notification and an
   * auto-acknowledgement to the sender. Email is best-effort — a mail failure
   * never fails the request, because the message is already saved.
   */
  async contact(dto: ContactDto): Promise<void> {
    const saved = await this.prisma.contactMessage.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim(),
        subject: dto.subject?.trim() || null,
        message: dto.message,
      },
    });

    // 1) Notify the team.
    const to = this.config.get('site', { infer: true }).contactTo;
    const subject = `[Website] ${saved.subject || 'New message'}`;
    const html = `
      <p style="margin:0 0 6px"><strong>From:</strong> ${escapeHtml(saved.name)} &lt;${escapeHtml(saved.email)}&gt;</p>
      <p style="margin:0 0 16px;color:#71717a"><strong>Subject:</strong> ${escapeHtml(saved.subject || '—')}</p>
      <div style="white-space:pre-wrap">${escapeHtml(saved.message)}</div>`;
    const text = `From: ${saved.name} <${saved.email}>\nSubject: ${saved.subject || '—'}\n\n${saved.message}`;
    await this.safeMail(
      () => this.mail.notify(to, subject, 'New website message', html, text),
      `contact notify (id ${saved.id})`,
    );

    // 2) Auto-acknowledge the sender.
    const ackHtml = `
      <p style="margin:0 0 14px">Hi ${escapeHtml(saved.name)},</p>
      <p style="margin:0 0 14px">Thanks for reaching out to StockVirtue — we've received your message and our team will get back to you soon.</p>
      <p style="margin:0 0 6px;color:#71717a"><strong>Your message:</strong></p>
      <div style="white-space:pre-wrap;color:#52525b">${escapeHtml(saved.message)}</div>`;
    const ackText = `Hi ${saved.name},\n\nThanks for reaching out to StockVirtue — we've received your message and will get back to you soon.\n\nYour message:\n${saved.message}`;
    await this.safeMail(
      () =>
        this.mail.notify(
          saved.email,
          'We received your message — StockVirtue',
          'Thanks for contacting us',
          ackHtml,
          ackText,
        ),
      `contact ack (id ${saved.id})`,
    );
  }

  // ─── Admin panel: contact messages ───────────────────────────────

  /** Paginated list of contact messages, newest first, optional status filter. */
  async listMessages(opts: {
    page?: number;
    status?: ContactStatus | 'ALL';
    pageSize?: number;
  }) {
    const pageSize = opts.pageSize ?? 25;
    const page = Math.max(1, opts.page ?? 1);
    const where =
      opts.status && opts.status !== 'ALL' ? { status: opts.status } : {};
    const [rows, total, newCount] = await Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contactMessage.count({ where }),
      this.prisma.contactMessage.count({ where: { status: 'NEW' } }),
    ]);
    return {
      rows,
      total,
      newCount,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      status: opts.status ?? 'ALL',
    };
  }

  async getMessage(id: string) {
    return this.prisma.contactMessage.findUnique({ where: { id } });
  }

  /** Mark a message read when opened (NEW → READ); leaves other statuses. */
  async markReadIfNew(id: string): Promise<void> {
    await this.prisma.contactMessage.updateMany({
      where: { id, status: 'NEW' },
      data: { status: 'READ' },
    });
  }

  async setMessageStatus(id: string, status: ContactStatus): Promise<void> {
    await this.prisma.contactMessage.update({
      where: { id },
      data: { status },
    });
  }

  /** Email a reply to the sender and mark the message REPLIED. */
  async replyToMessage(id: string, replyText: string): Promise<void> {
    const msg = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!msg) return;
    const html = `
      <p style="margin:0 0 14px">Hi ${escapeHtml(msg.name)},</p>
      <div style="white-space:pre-wrap;margin:0 0 18px">${escapeHtml(replyText)}</div>
      <hr style="border:none;border-top:1px solid #eee;margin:18px 0" />
      <p style="margin:0;color:#a1a1aa;font-size:12px">In reply to your message:</p>
      <div style="white-space:pre-wrap;color:#a1a1aa;font-size:12px">${escapeHtml(msg.message)}</div>`;
    const text = `Hi ${msg.name},\n\n${replyText}\n\n— In reply to your message:\n${msg.message}`;
    await this.mail.notify(
      msg.email,
      `Re: ${msg.subject || 'Your message to StockVirtue'}`,
      'A reply from StockVirtue',
      html,
      text,
    );
    await this.prisma.contactMessage.update({
      where: { id },
      data: { status: 'REPLIED', reply: replyText, repliedAt: new Date() },
    });
  }

  /** Run a mail send without letting a failure bubble up to the caller. */
  private async safeMail(
    fn: () => Promise<void>,
    label: string,
  ): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`${label} email failed: ${(err as Error).message}`);
    }
  }

  private shape(row: {
    siteTitle: string;
    siteDescription: string;
    contactEmail: string;
    playStoreUrl: string;
    social: unknown;
    headCode: string;
    bodyStartCode: string;
    bodyEndCode: string;
  }): PublicSiteSettings {
    return {
      siteTitle: row.siteTitle,
      siteDescription: row.siteDescription,
      contactEmail: row.contactEmail,
      playStoreUrl: row.playStoreUrl,
      social: (row.social as Social) ?? {},
      headCode: row.headCode,
      bodyStartCode: row.bodyStartCode,
      bodyEndCode: row.bodyEndCode,
    };
  }
}
