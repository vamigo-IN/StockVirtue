import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
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
import { CookieConsentService } from '../site-content/cookie-consent.service';
import { LegalRecordService } from '../site-content/legal-record.service';
import { SiteContentCache } from '../site-content/site-content.cache';
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
  /**
   * The website's cookie choice version (W7 decision 4): the newest
   * cookie_consent_versions row, 1 when there is none. Top level, not inside
   * `config`, which the portal saves group by group.
   */
  cookieConsent: { version: number };
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
    // The W7 Settings hooks (SETTINGS revisions of legal pages, cookie choice
    // versions). Optional so the settings keep working without them.
    @Optional() private readonly legalRecord?: LegalRecordService,
    @Optional() private readonly cookies?: CookieConsentService,
    @Optional() private readonly siteCache?: SiteContentCache,
  ) {}

  /** Read the singleton settings; returns defaults when none saved yet. */
  async get(): Promise<PublicSite> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    const config = readConfig(row?.config);
    const images = await this.images(config);
    const pick = (id: string | null) => (id && images.get(id)) || null;
    const cookieVersion = this.cookies
      ? await this.cookies.currentVersion()
      : 1;
    return {
      ...(row ? this.shape(row) : DEFAULTS),
      cookieConsent: { version: cookieVersion },
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
    const next = await this.checkGroup(group, input, current);
    if (JSON.stringify(current[group]) !== JSON.stringify(next)) {
      const legalKeys = await this.prisma.$transaction(async (tx) => {
        // W7 (§4.2): the row is locked first and the write is built from it,
        // so two saves at once queue instead of undoing each other, and the
        // records below compare with the row this save replaces.
        const locked = await this.lockedRow(tx);
        const base = readConfig(locked?.config);
        if (JSON.stringify(base[group]) === JSON.stringify(next)) return [];
        const config = { ...base, [group]: next };
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
            before: base[group] as unknown as Prisma.InputJsonValue,
            after: next as unknown as Prisma.InputJsonValue,
            ...client,
          },
          tx,
        );
        // W7: a value a live legal page shows changed → a SETTINGS revision
        // of that page; then a service visitors weren't asked about switched
        // on → a new cookie choice version (the last lock, §5.3 step 1).
        const recorder = {
          staffId: actor.staffId,
          userId: actor.userId,
          email: actor.email,
        };
        const keys =
          (await this.legalRecord?.recordSettingsChange(
            tx,
            { contactEmail: locked?.contactEmail ?? '', config },
            recorder,
            client,
          )) ?? [];
        await this.cookies?.recordSettingsChange(
          tx,
          locked?.config ?? {},
          config,
          recorder,
          client,
        );
        return keys;
      });
      // Before the response, so the portal proxy's own refresh (after it)
      // reads the new values.
      if (legalKeys.length) {
        await this.siteCache?.invalidate(
          'settings',
          legalKeys.map((k) => `content:${k}`),
        );
      }
    }
    return this.getConfigForStaff();
  }

  /** Validates and tidies one group beyond what its DTO checks. */
  private async checkGroup<G extends SiteConfigGroup>(
    group: G,
    input: SiteConfig[G],
    current: SiteConfig,
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
      return {
        ...a,
        adsTxt: tidyLines(a.adsTxt),
        withoutConsent: a.withoutConsent ?? current.ads.withoutConsent,
      } as SiteConfig[G];
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
    let saved: (keyof PublicSiteSettings)[] = [];
    if (changed.length > 0) {
      const data = { ...next, social: next.social as object };
      const legalKeys = await this.prisma.$transaction(async (tx) => {
        // W7 (§4.2): the row is locked first; what changed is decided from
        // the row this save replaces, so a save made meanwhile isn't undone
        // unnoticed and the records below compare with the right values.
        const locked = await this.lockedRow(tx);
        const before = locked ? this.shape(locked) : DEFAULTS;
        saved = changedSettings(before, next);
        if (saved.length === 0) return [] as string[];
        const code = saved.filter((k) =>
          (CODE_FIELDS as readonly string[]).includes(k),
        );
        if (
          code.length > 0 &&
          !actor.roles.includes(SUPER_ADMIN) &&
          !actor.permissions.has('settings.code_injection')
        ) {
          throw new ForbiddenException(
            'Changing injected code needs the "settings.code_injection" permission. Your other changes were not saved either.',
          );
        }
        await tx.siteSetting.upsert({
          where: { id: SINGLETON },
          create: { id: SINGLETON, ...data },
          update: data,
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action:
              code.length > 0
                ? 'site.settings.code_injection'
                : 'site.settings.update',
            entityType: 'SiteSetting',
            entityId: SINGLETON,
            before: Object.fromEntries(saved.map((k) => [k, before[k]])),
            after: Object.fromEntries(saved.map((k) => [k, next[k]])),
            meta: { changed: saved },
            ...client,
          },
          tx,
        );
        // W7: the contact email is a live value on legal pages (§4.2).
        if (!this.legalRecord) return [] as string[];
        return this.legalRecord.recordSettingsChange(
          tx,
          { contactEmail: data.contactEmail, config: locked?.config ?? {} },
          { staffId: actor.staffId, userId: actor.userId, email: actor.email },
          client,
        );
      });
      if (legalKeys.length) {
        await this.siteCache?.invalidate(
          'settings',
          legalKeys.map((k) => `content:${k}`),
        );
      }
      if (saved.length > 0) {
        this.logger.log(
          `Site settings updated by ${actor.email}: ${saved.join(', ')}`,
        );
      }
    }
    return { ...(await this.getForStaff()), changed: saved };
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
    const html =
      this.mail.detailTable([
        { label: 'From', value: `${saved.name} <${saved.email}>` },
        { label: 'Subject', value: saved.subject || '—' },
      ]) + this.mail.quote(saved.message);
    const text = `From: ${saved.name} <${saved.email}>\nSubject: ${saved.subject || '—'}\n\n${saved.message}`;
    await this.safeMail(
      () => this.mail.notify(to, subject, 'New website message', html, text),
      `contact notify (id ${saved.id})`,
    );

    // 2) Auto-acknowledge the sender.
    const ackHtml = [
      this.mail.para(`Hi ${escapeHtml(saved.name)},`),
      this.mail.para(
        "Thanks for reaching out to StockVirtue — we've received your message and our team will get back to you soon. Here's what you sent:",
      ),
      this.mail.quote(saved.message),
    ].join('');
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
    const html = [
      this.mail.para(`Hi ${escapeHtml(msg.name)},`),
      this.mail.para(escapeHtml(replyText).replace(/\r?\n/g, '<br>')),
      this.mail.para('<b>In reply to your message:</b>'),
      this.mail.quote(msg.message),
    ].join('');
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

  /**
   * W7 (§4.2, §5.3 step 1): the settings row, locked for the rest of this
   * transaction (its first statement), then read. Null before the first save.
   */
  private async lockedRow(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT 1 FROM site_settings WHERE id = ${SINGLETON} FOR UPDATE`;
    return tx.siteSetting.findUnique({ where: { id: SINGLETON } });
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
