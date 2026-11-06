import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SEED_NOTICE_VERSION } from '../privacy/privacy.constants';
import { contentHash } from './canonical';
import { CookieConsentService } from './cookie-consent.service';
import { readJsonData } from './data-files';
import { tableExists, W7_TABLES } from './db';
import { isMissingTable } from './errors';
import { LegalRecordService } from './legal-record.service';
import { FIXED_ITEMS, LEGAL_KEYS, type LegalKey } from './registry';
import { SCHEMA_VERSION, schemaFor } from './schemas';
import { newContext, validateContent } from './schemas/fields';
import { SiteContentCache } from './site-content.cache';
import { istDay } from './terms-notice';

/** The notice version the migration seeds; every consent before W7 names it. */
export { SEED_NOTICE_VERSION };
const SEED_NOTICE_AT = new Date('2026-11-03T00:00:00+05:30');

/** One seed/legal/<key>.json file (made from today's page.tsx, Appendix C). */
interface SeedFile {
  format: 1;
  key: LegalKey;
  lang: 'en' | 'hi';
  schemaVersion: number;
  revision: { dateShown: string; dateLabel: string | null; noticeVersion: string | null };
  content: Record<string, unknown>;
}

export interface SeedResult {
  skipped?: 'migration';
  created: string[];
  cookieVersion: boolean;
  settings: string[];
}

/**
 * Puts today's legal text in as revision 1 (W7 addendum §2.5): at API boot,
 * create-if-missing and never update, under a Postgres advisory lock, in the
 * API process only (the worker doesn't load this module). Also cookie choice
 * version 1 with the services in use (§5.13), then the Settings comparison
 * once (§4.2). A missing W7 table is logged once and skipped (§2.4): boot
 * never fails on it.
 */
@Injectable()
export class SiteContentSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(SiteContentSeeder.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly legal: LegalRecordService,
    private readonly cookies: CookieConsentService,
    private readonly cache: SiteContentCache,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const r = await this.run();
      if (r.skipped) return;
      if (r.created.length || r.cookieVersion || r.settings.length) {
        this.logger.log(
          `Site content seeded: ${r.created.length ? r.created.join(', ') : 'no new legal pages'}${r.cookieVersion ? '; cookie choice version 1' : ''}${r.settings.length ? `; settings recorded on ${r.settings.join(', ')}` : ''}.`,
        );
      }
    } catch (err) {
      if (isMissingTable(err)) {
        this.logger.error('site_cms migration not applied: site content not seeded.');
        return;
      }
      this.logger.error(`Site content seeding failed: ${(err as Error).message}`);
    }
  }

  async run(): Promise<SeedResult> {
    for (const t of W7_TABLES) {
      if (!(await tableExists(this.prisma, t))) {
        this.logger.error('site_cms migration not applied: site content not seeded.');
        return { skipped: 'migration', created: [], cookieVersion: false, settings: [] };
      }
    }
    const seeds = LEGAL_KEYS.map((k) => ({ key: k, file: readJsonData<SeedFile>(`seed/legal/${k}.json`) }));
    const created: string[] = [];
    let cookieVersion = false;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('site-content:seed'))`;
        const settings = await tx.siteSetting.findUnique({
          where: { id: 'singleton' },
          select: { contactEmail: true, config: true },
        });
        // The migration seeds it; a database restored without it still boots.
        await tx.privacyNoticeVersion.createMany({
          data: [
            {
              id: SEED_NOTICE_VERSION,
              materialAt: SEED_NOTICE_AT,
              announce: false,
              affectsAnalytics: false,
              affectsCookies: false,
              publishedByEmail: 'seed',
            },
          ],
          skipDuplicates: true,
        });
        const existing = new Set(
          (await tx.siteContent.findMany({ where: { key: { in: [...LEGAL_KEYS] } }, select: { key: true } })).map(
            (r) => r.key,
          ),
        );
        for (const { key, file } of seeds) {
          if (existing.has(key)) continue;
          if (!file || file.key !== key) {
            this.logger.error(`The seed for ${key} is missing or malformed: not seeded.`);
            continue;
          }
          const schema = schemaFor('LEGAL', key);
          const ctx = newContext(this.legal.siteUrl(), istDay(new Date()));
          const value = schema ? validateContent(schema, file.content, ctx) : null;
          if (!value || ctx.errors.length) {
            this.logger.error(
              `The seed for ${key} doesn't pass its profile (${ctx.errors.length} problems, first: ${ctx.errors[0]?.path} ${ctx.errors[0]?.message}): not seeded.`,
            );
            continue;
          }
          const item = FIXED_ITEMS[key];
          const noticeVersion = file.revision.noticeVersion;
          const row = await tx.siteContent.create({
            data: {
              key,
              kind: 'LEGAL',
              status: 'LIVE',
              lang: item.lang,
              title: item.title,
              schemaVersion: SCHEMA_VERSION,
            },
          });
          const rev = await tx.siteContentRevision.create({
            data: {
              contentId: row.id,
              number: 1,
              schemaVersion: SCHEMA_VERSION,
              content: value as Prisma.InputJsonValue,
              contentHash: contentHash(value),
              change: 'SEED',
              summary: 'The text as published before the pages became editable.',
              noticeVersion,
              dateShown: new Date(file.revision.dateShown),
              dateLabel: file.revision.dateLabel,
              liveValues: this.legal.valuesFor(value, settings, noticeVersion) as Prisma.InputJsonValue,
              publishedByEmail: 'seed',
            },
          });
          await tx.siteContent.update({ where: { id: row.id }, data: { publishedRevisionId: rev.id } });
          created.push(key);
        }
        cookieVersion = await this.cookies.seed(tx, settings?.config);
      },
      { timeout: 30_000 },
    );
    const settings = await this.legal.bootCheck();
    const tags = [...new Set([...created, ...settings])].map((k) => `content:${k}`);
    if (tags.length) await this.cache.invalidate('site content seed', tags);
    return { created, cookieVersion, settings };
  }
}
