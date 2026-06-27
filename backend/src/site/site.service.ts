import { Injectable, Logger } from '@nestjs/common';
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

  /** Forward a contact-form submission to the configured inbox. */
  async contact(dto: ContactDto): Promise<void> {
    const to = this.config.get('site', { infer: true }).contactTo;
    const subject = `[Website] ${dto.subject?.trim() || 'New message'}`;
    const html = `
      <p style="margin:0 0 6px"><strong>From:</strong> ${escapeHtml(dto.name)} &lt;${escapeHtml(dto.email)}&gt;</p>
      <p style="margin:0 0 16px;color:#71717a"><strong>Subject:</strong> ${escapeHtml(dto.subject || '—')}</p>
      <div style="white-space:pre-wrap">${escapeHtml(dto.message)}</div>`;
    const text = `From: ${dto.name} <${dto.email}>\nSubject: ${dto.subject || '—'}\n\n${dto.message}`;
    await this.mail.notify(to, subject, 'New website message', html, text);
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
