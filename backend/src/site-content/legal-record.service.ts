import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import type { ClientInfo } from '../staff/staff-request';
import type { VersionActor } from './cookie-consent.service';
import { lockItem, tableExists } from './db';
import {
  changedTokens,
  isTokenName,
  pickValues,
  publicSiteUrl,
  resolveAll,
  TOKEN_SOURCES,
  type LiveValues,
  type SettingsRow,
  type TokenName,
} from './live-values';

const SINGLETON = 'singleton';

/** Every token a stored content names (heads, document, anywhere in it). */
export function tokensOf(content: unknown): TokenName[] {
  const out = new Set<TokenName>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o.type === 'token' && o.attrs && typeof o.attrs === 'object') {
      const name = (o.attrs as Record<string, unknown>).name;
      if (isTokenName(name)) out.add(name);
    }
    for (const k of Object.keys(o)) if (k !== 'attrs') walk(o[k]);
  };
  walk(content);
  return [...out].sort();
}

/** "Settings changed: grievance officer, address" (§4.2). */
export function settingsSummary(fields: readonly TokenName[]): string {
  const labels = [...new Set(fields.map((f) => TOKEN_SOURCES[f]))];
  return `Settings changed: ${labels.join(', ')}`;
}

/**
 * The legal record (W7 addendum §4.2): legal documents render from the live
 * values their revision recorded, so a Settings save that changes a value a
 * live legal document shows appends a SETTINGS revision to it, in the same
 * transaction as the settings row. Content + liveValues of the live revision
 * is then always exactly the text readers saw, without the audit log.
 */
@Injectable()
export class LegalRecordService {
  private readonly logger = new Logger(LegalRecordService.name);
  private warned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** `site.url`: PUBLIC_SITE_URL or the web's default, never the portal's origin. */
  siteUrl(): string {
    return publicSiteUrl(this.config.get('site', { infer: true }).publicUrl);
  }

  /** The values a document shows, from these settings (only the tokens it uses). */
  valuesFor(content: unknown, row: SettingsRow | null | undefined, noticeVersion: string | null): LiveValues {
    return pickValues(resolveAll(row, this.siteUrl(), noticeVersion), tokensOf(content));
  }

  /**
   * The Settings hook. Called by SiteService.updateConfig and updateByStaff
   * inside their transaction (which locked the settings row first), after
   * the row is written, with the row as it now is. Each live legal document
   * compares the values its revision recorded with these. Returns the keys
   * that got a SETTINGS revision (their `content:<key>` tags are refreshed
   * after the commit, before the response).
   */
  async recordSettingsChange(
    tx: Prisma.TransactionClient,
    after: SettingsRow,
    actor: VersionActor | null,
    client?: ClientInfo,
  ): Promise<string[]> {
    if (!(await tableExists(tx, 'site_content'))) {
      this.warnMissing();
      return [];
    }
    const items = await tx.siteContent.findMany({
      where: { kind: 'LEGAL', status: 'LIVE', publishedRevisionId: { not: null } },
      select: { id: true, key: true },
    });
    // Key order by code unit, whatever the database's collation (§5.3 step 1).
    items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const changed: string[] = [];
    for (const item of items) {
      // The same lock as a publish, taken in key order (§5.3).
      await lockItem(tx, item.key);
      const fresh = await tx.siteContent.findUnique({
        where: { id: item.id },
        include: { publishedRevision: true },
      });
      const rev = fresh?.publishedRevision;
      if (!fresh || !rev) continue;
      const next = this.valuesFor(rev.content, after, rev.noticeVersion);
      const prev = (rev.liveValues ?? {}) as LiveValues;
      const fields = changedTokens(prev, next);
      if (fields.length === 0) continue;
      const last = await tx.siteContentRevision.aggregate({
        where: { contentId: fresh.id },
        _max: { number: true },
      });
      const number = (last._max.number ?? 0) + 1;
      const created = await tx.siteContentRevision.create({
        data: {
          contentId: fresh.id,
          number,
          schemaVersion: rev.schemaVersion,
          content: rev.content as Prisma.InputJsonValue,
          contentHash: rev.contentHash,
          change: 'SETTINGS',
          summary: settingsSummary(fields),
          noticeVersion: rev.noticeVersion,
          dateShown: rev.dateShown,
          dateLabel: rev.dateLabel,
          liveValues: next as Prisma.InputJsonValue,
          factsSnapshot: rev.factsSnapshot ?? Prisma.DbNull,
          publishedById: actor?.staffId ?? null,
          publishedByEmail: actor?.email ?? 'system',
        },
      });
      await tx.siteContent.update({
        where: { id: fresh.id },
        data: { publishedRevisionId: created.id },
      });
      await this.audit.record(
        {
          actor: actor ? { userId: actor.userId, email: actor.email } : { userId: null, email: 'system' },
          action: 'site.legal.settings',
          entityType: 'SiteContent',
          entityId: fresh.id,
          before: { revision: rev.number, hash: rev.contentHash },
          after: { revision: number, hash: rev.contentHash },
          meta: { key: fresh.key, number, fields },
          ...(client ?? {}),
        },
        tx,
      );
      changed.push(fresh.key);
    }
    if (changed.length) {
      this.logger.log(`Settings change recorded on ${changed.join(', ')} (SETTINGS revisions).`);
    }
    return changed;
  }

  /**
   * At API boot, after the seeder: the same comparison against the settings
   * and config as they are, so a deploy that changes PUBLIC_SITE_URL (or a
   * settings row written while the API was down) is recorded too.
   */
  async bootCheck(): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.siteSetting.findUnique({
        where: { id: SINGLETON },
        select: { contactEmail: true, config: true },
      });
      return this.recordSettingsChange(tx, row ?? {}, null);
    });
  }

  private warnMissing() {
    if (this.warned) return;
    this.warned = true;
    this.logger.error('site_cms migration not applied: Settings changes are not recorded on legal pages.');
  }
}
