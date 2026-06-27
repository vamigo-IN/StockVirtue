import { Injectable, Logger } from '@nestjs/common';
import { ContactStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, escapeHtml } from '../mail/mail.service';
import { ContactDto, UpdateSiteSettingsDto } from './site.dto';

const SINGLETON = 'singleton';

interface Social {
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
  facebook?: string;
}

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
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Read the singleton settings; returns defaults when none saved yet. */
  async get(): Promise<PublicSiteSettings> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { id: SINGLETON },
    });
    return row ? this.shape(row) : DEFAULTS;
  }

  /** Upsert the singleton settings (called by the website admin, key-guarded). */
  async update(dto: UpdateSiteSettingsDto): Promise<PublicSiteSettings> {
    const data = {
      siteTitle: dto.siteTitle ?? '',
      siteDescription: dto.siteDescription ?? '',
      contactEmail: dto.contactEmail ?? '',
      playStoreUrl: dto.playStoreUrl ?? '',
      social: (dto.social ?? {}) as object,
      headCode: dto.headCode ?? '',
      bodyStartCode: dto.bodyStartCode ?? '',
      bodyEndCode: dto.bodyEndCode ?? '',
    };
    const row = await this.prisma.siteSetting.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    });
    this.logger.log('Site settings updated');
    return this.shape(row);
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
    await this.safeMail(() =>
      this.mail.notify(to, subject, 'New website message', html, text),
      `contact notify (id ${saved.id})`,
    );

    // 2) Auto-acknowledge the sender.
    const ackHtml = `
      <p style="margin:0 0 14px">Hi ${escapeHtml(saved.name)},</p>
      <p style="margin:0 0 14px">Thanks for reaching out to StockVirtue — we've received your message and our team will get back to you soon.</p>
      <p style="margin:0 0 6px;color:#71717a"><strong>Your message:</strong></p>
      <div style="white-space:pre-wrap;color:#52525b">${escapeHtml(saved.message)}</div>`;
    const ackText = `Hi ${saved.name},\n\nThanks for reaching out to StockVirtue — we've received your message and will get back to you soon.\n\nYour message:\n${saved.message}`;
    await this.safeMail(() =>
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
  private async safeMail(fn: () => Promise<void>, label: string): Promise<void> {
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
