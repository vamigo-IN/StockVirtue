import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SiteContentRevision, StaffStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { escapeHtml, MailService } from '../mail/mail.service';
import { has } from '../newsroom/articles/article-access';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeGateService } from '../privacy/notice-gate.service';
import { PrivacyNoticeService, type NoticeVersion } from '../privacy/privacy-notice.service';
import { DELETED_RETENTION_MS, RECIPIENTS, RETENTION } from '../privacy/privacy.constants';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { readConfig } from '../site/site-config';
import type { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { contentHash } from './canonical';
import { CookieConsentService } from './cookie-consent.service';
import { lockCookieVersions, lockItem } from './db';
import { cmsUnavailable, invalidContent, isMissingTable, SiteContentError, staleDraft } from './errors';
import { LegalRecordService } from './legal-record.service';
import { optionalServices } from './live-values';
import { PRIVACY_KEYS, SITE_CHROME_TAG } from './registry';
import { hookProblems, type DocInfo } from './rich/legal-doc';
import { profileFor, SCHEMA_VERSION, schemaFor, upgradeContent } from './schemas';
import { newContext, validateContent } from './schemas/fields';
import type { PrivacyNoticePublishDto } from './site-content.dto';
import { SiteContentCache } from './site-content.cache';
import { SiteContentService } from './site-content.service';
import { headTexts, smallFix, smallFixReasons, type NoticeShape, type SmallFixResult } from './small-fix';
import { istDay } from './terms-notice';

type PrivacyKey = (typeof PRIVACY_KEYS)[number];

/** Summaries of a material change are shown to app users and on /privacy (§5.1). */
const MATERIAL_SUMMARY_MIN = 20;
const SUMMARY_MAX = 280;
const DAY_MS = 86_400_000;
/** The tag every page's settings fetch carries (the cookie banner's version, §7.5). */
const SITE_SETTINGS_TAG = 'site-settings';

/**
 * The cookie names the website sets, by purpose, as `clearOptionalCookies`
 * knows them (web/src/lib/consent.ts): what the "What the system does" panel
 * shows beside the notice's Cookies section (§4.7). Editing the notice's
 * words doesn't change them.
 */
export const COOKIE_NAMES = {
  necessary: ['sv_consent'],
  analytics: ['_ga', '_ga_*', '_gid', '_gat*', '_clck', '_clsk', 'CLID', 'MUID', 'ANONCHK', 'SM'],
  advertising: ['_fbp', '_fbc', '__gads', '__gpi', '__eoi', '_gcl_*'],
} as const;

const needsBoth = () =>
  new SiteContentError(
    HttpStatus.BAD_REQUEST,
    'material_needs_both_languages',
    'A material change publishes the English and Hindi notices together. Update the Hindi notice and its summary first.',
  );
const nothingToPublish = (message = 'There are no changes to publish.') =>
  new SiteContentError(HttpStatus.BAD_REQUEST, 'nothing_to_publish', message);
const forbidden = (message: string) => new SiteContentError(HttpStatus.FORBIDDEN, 'not_allowed', message);

interface Prepared {
  key: PrivacyKey;
  rowId: string;
  value: Record<string, unknown>;
  hash: string;
  prev: SiteContentRevision | null;
  restoredFromId: string | null;
  smallFix: SmallFixResult | null;
}

function versionView(v: NoticeVersion & { publishedByEmail?: string; createdAt?: Date }) {
  return {
    version: v.version,
    seq: v.seq,
    materialAt: v.materialAt,
    summaryEn: v.summaryEn,
    summaryHi: v.summaryHi,
    announce: v.announce,
    affectsAnalytics: v.affectsAnalytics,
    affectsCookies: v.affectsCookies,
    ...(v.publishedByEmail !== undefined ? { publishedByEmail: v.publishedByEmail } : {}),
    ...(v.createdAt ? { createdAt: v.createdAt } : {}),
  };
}

const oneLine = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The privacy notice's own publish (W7 addendum §5.1–§5.3), for `privacy`
 * and `privacy-hi` only (the generic publish refuses them):
 * - MATERIAL (`legal.material`, Super Admin only): a new version id, both
 *   languages in one transaction, the two questions stored on the version,
 *   a new cookie choice version when the change affects cookies, and every
 *   app account asked again (the reload and the Redis message, §5.4).
 * - MINOR: new revision(s) under the current version. Admins
 *   (`legal.manage`) may publish only a small fix (§5.1); a restored older
 *   notice needs MATERIAL (409 `material_required`) for everyone; every
 *   minor publish emails the Super Admins.
 * Lock order (§5.3 step 1): `privacy-notice`, then `site-content:privacy`,
 * `site-content:privacy-hi`, then `cookie-consent` last.
 */
@Injectable()
export class PrivacyNoticePublishService {
  private readonly logger = new Logger(PrivacyNoticePublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly content: SiteContentService,
    private readonly legal: LegalRecordService,
    private readonly cookies: CookieConsentService,
    private readonly cache: SiteContentCache,
    private readonly notice: PrivacyNoticeService,
    private readonly gate: NoticeGateService,
    private readonly mail: MailService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private assertLegal(actor: StaffPrincipal) {
    if (has(actor, 'legal.manage')) return;
    throw forbidden('You don’t have permission to publish the privacy notice (needs "legal.manage"). Ask an admin.');
  }

  /* ── GET staff/site/privacy-notice (§7.2) ────────────────────────────── */

  async overview(actor: StaffPrincipal) {
    this.assertLegal(actor);
    let rows: { id: string; seq: number; materialAt: Date; summaryEn: string; summaryHi: string; announce: boolean; affectsAnalytics: boolean; affectsCookies: boolean; publishedByEmail: string; createdAt: Date }[];
    try {
      rows = await this.prisma.privacyNoticeVersion.findMany({ orderBy: { seq: 'desc' } });
    } catch (err) {
      if (isMissingTable(err)) throw cmsUnavailable();
      throw err;
    }
    const versions = rows.map((r) => versionView({ ...r, version: r.id }));
    const cookie = await this.cookies.current();
    const days = (ms: number) => Math.round(ms / DAY_MS);
    return {
      current: versions[0] ?? versionView(this.notice.current()),
      versions,
      nextId: await this.notice.nextId(new Date()),
      codeFacts: {
        retention: {
          ...Object.fromEntries(Object.entries(RETENTION).map(([k, ms]) => [k, days(ms)])),
          deletedAccounts: days(DELETED_RETENTION_MS),
        },
        inactiveYears: this.config.get('privacy', { infer: true }).inactiveYears,
        recipients: RECIPIENTS.map((r) => r.name),
        cookieNames: COOKIE_NAMES,
      },
      cookie: cookie
        ? { version: cookie.version, services: cookie.services, reason: cookie.reason, since: cookie.since }
        : { version: 1, services: { analytics: [], advertising: [] }, reason: 'seed', since: null },
      gate: { enabled: this.gate.on(), forcedOff: this.gate.forcedOff() },
    };
  }

  /* ── POST staff/site/privacy-notice/publish (§5.3) ───────────────────── */

  async publish(actor: StaffPrincipal, dto: PrivacyNoticePublishDto, client: ClientInfo) {
    this.assertLegal(actor);
    const material = dto.change === 'MATERIAL';
    const superAdmin = has(actor, 'legal.material');
    if (material && !superAdmin) {
      throw forbidden(
        'Only a Super Admin can publish a material change to the privacy notice: it asks every app user to accept it again.',
      );
    }
    const keys: PrivacyKey[] = [];
    if (dto.en) keys.push('privacy');
    if (dto.hi) keys.push('privacy-hi');
    if (material && keys.length < 2) throw needsBoth();
    if (!keys.length) throw nothingToPublish('Choose the language(s) to publish.');

    const summaryEn = oneLine(dto.summaryEn);
    const summaryHi = oneLine(dto.summaryHi);
    if (material) {
      const errors = [
        ...(summaryEn.length < MATERIAL_SUMMARY_MIN || summaryEn.length > SUMMARY_MAX
          ? [{ path: 'summaryEn', message: `Write the English summary in ${MATERIAL_SUMMARY_MIN}–${SUMMARY_MAX} characters (app users see it).` }]
          : []),
        ...(summaryHi.length < MATERIAL_SUMMARY_MIN || summaryHi.length > SUMMARY_MAX
          ? [{ path: 'summaryHi', message: `Write the Hindi summary in ${MATERIAL_SUMMARY_MIN}–${SUMMARY_MAX} characters (app users see it).` }]
          : []),
      ];
      if (errors.length) throw invalidContent(errors);
      if (typeof dto.affectsAnalytics !== 'boolean' || typeof dto.affectsCookies !== 'boolean') {
        throw new SiteContentError(
          HttpStatus.BAD_REQUEST,
          'material_questions_required',
          'Answer both questions: whether the change affects app analytics, and whether it affects the website’s cookies or the services in use.',
        );
      }
    } else {
      if (!summaryEn && !superAdmin) {
        throw invalidContent([{ path: 'summaryEn', message: 'Say what changed, in a sentence (Super Admins are emailed it).' }]);
      }
      if (summaryEn.length > SUMMARY_MAX || summaryHi.length > SUMMARY_MAX) {
        throw invalidContent([
          { path: summaryEn.length > SUMMARY_MAX ? 'summaryEn' : 'summaryHi', message: `Keep the summary to at most ${SUMMARY_MAX} characters.` },
        ]);
      }
    }

    const now = new Date();
    const result = await this.prisma.$transaction(
      async (tx) => {
        // 1. The lock order of every W7 writer.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('privacy-notice'))`;
        for (const key of keys) await lockItem(tx, key);
        const current = await this.notice.currentFromDb(tx);

        // 2. Both drafts: fresh, valid, with their hooks, changed.
        const prepared: Prepared[] = [];
        for (const key of keys) {
          const want = key === 'privacy' ? dto.en : dto.hi;
          const row = await tx.siteContent.findUnique({ where: { key }, include: { publishedRevision: true } });
          if (!row) throw nothingToPublish('Save a draft of this notice first.');
          if (!want || row.draftVersion !== want.draftVersion) throw staleDraft();
          if (!row.draft) throw material ? needsBoth() : nothingToPublish();
          const { value, ctx } = await this.content.check('LEGAL', key, upgradeContent('LEGAL', row.schemaVersion, row.draft), {
            actor,
            row,
            renameIds: true, // the draft's ids were checked when it was saved
            forPublish: true,
            db: tx,
          });
          const profile = profileFor('LEGAL', key);
          const info = ctx.docs.get('body');
          const problems = profile && info ? hookProblems(profile, info) : ['The document is missing.'];
          if (problems.length) {
            throw new SiteContentError(HttpStatus.BAD_REQUEST, 'missing_hook', problems[0], { problems, key });
          }
          const hash = contentHash(value);
          const prev = row.publishedRevision;
          if (prev && prev.contentHash === hash && row.status === 'LIVE') {
            throw material ? needsBoth() : nothingToPublish();
          }
          // A restored older notice is material, for everyone (§5.1).
          if (!material && row.draftRestoredFromId) {
            const source = await tx.siteContentRevision.findUnique({
              where: { id: row.draftRestoredFromId },
              select: { noticeVersion: true },
            });
            if (source && source.noticeVersion !== current.version) {
              throw new SiteContentError(
                HttpStatus.CONFLICT,
                'material_required',
                `This draft restores the notice of version ${source.noticeVersion ?? 'unknown'}. Publishing an older notice again is a material change: a Super Admin must publish it as one.`,
                { restoredVersion: source.noticeVersion },
              );
            }
          }
          const fix = prev && info ? smallFix(this.shapeOf(key, prev), { info, head: headTexts(value) }) : null;
          prepared.push({ key, rowId: row.id, value, hash, prev, restoredFromId: row.draftRestoredFromId, smallFix: fix });
        }

        // The small-fix guard: Admins may publish only a small minor fix.
        if (!material && !superAdmin) {
          const big = prepared.find((p) => !p.smallFix || !p.smallFix.ok);
          if (big) {
            const reasons = big.smallFix ? smallFixReasons(big.smallFix) : 'nothing published to compare with';
            throw new SiteContentError(
              HttpStatus.FORBIDDEN,
              'minor_needs_super_admin',
              `This is more than a small fix (${reasons}). A Super Admin must publish it, as a minor or a material change.`,
              {
                key: big.key,
                wordsChanged: big.smallFix?.words ?? null,
                structure: big.smallFix?.structure ?? [],
              },
            );
          }
        }

        // 3. The new version (material), and 3b. a cookie choice version.
        let version = current.version;
        let cookieVersion: number | undefined;
        if (material) {
          const id = await this.notice.nextId(now, tx);
          if (oneLine(dto.confirmVersion) !== id) {
            throw new SiteContentError(
              HttpStatus.BAD_REQUEST,
              'version_confirmation_mismatch',
              `Type the new version id, ${id}, to confirm.`,
              { nextId: id },
            );
          }
          await tx.privacyNoticeVersion.create({
            data: {
              id,
              materialAt: now,
              summaryEn,
              summaryHi,
              announce: true,
              affectsAnalytics: dto.affectsAnalytics === true,
              affectsCookies: dto.affectsCookies === true,
              publishedById: actor.staffId,
              publishedByEmail: actor.email ?? '',
            },
          });
          version = id;
          if (dto.affectsCookies === true) {
            await lockCookieVersions(tx); // the last lock (§5.3 step 1)
            const fresh = await tx.siteSetting.findUnique({ where: { id: 'singleton' }, select: { config: true } });
            cookieVersion = await this.cookies.startVersion(
              tx,
              'notice',
              optionalServices(readConfig(fresh?.config)),
              id,
              { staffId: actor.staffId, userId: actor.userId, email: actor.email },
              client,
              await this.cookies.currentVersion(tx),
            );
          }
        }

        // 4. One revision per language.
        const settings = await tx.siteSetting.findUnique({
          where: { id: 'singleton' },
          select: { contactEmail: true, config: true },
        });
        const change = material ? 'MATERIAL' : 'MINOR';
        const revisions: SiteContentRevision[] = [];
        for (const p of prepared) {
          const keepDate = !material && !!dto.keepDate && !!p.prev;
          const last = await tx.siteContentRevision.aggregate({ where: { contentId: p.rowId }, _max: { number: true } });
          const number = (last._max.number ?? 0) + 1;
          const rev = await tx.siteContentRevision.create({
            data: {
              contentId: p.rowId,
              number,
              schemaVersion: SCHEMA_VERSION,
              content: p.value as Prisma.InputJsonValue,
              contentHash: p.hash,
              change,
              summary: summaryEn,
              summaryHi,
              noticeVersion: version,
              dateShown: keepDate && p.prev ? p.prev.dateShown : now,
              dateLabel: keepDate && p.prev ? p.prev.dateLabel : null,
              liveValues: this.legal.valuesFor(p.value, settings, version) as Prisma.InputJsonValue,
              factsSnapshot: Prisma.DbNull,
              restoredFromId: p.restoredFromId,
              publishedById: actor.staffId,
              publishedByEmail: actor.email ?? '',
            },
          });
          await tx.siteContent.update({
            where: { id: p.rowId },
            data: {
              publishedRevisionId: rev.id,
              status: 'LIVE',
              draft: Prisma.DbNull,
              draftRestoredFromId: null,
              draftVersion: { increment: 1 },
              schemaVersion: SCHEMA_VERSION,
            },
          });
          await this.audit.record(
            {
              actor: { userId: actor.userId, email: actor.email },
              action: 'site.legal.publish',
              entityType: 'SiteContent',
              entityId: p.rowId,
              ...(p.prev ? { before: { revision: p.prev.number, hash: p.prev.contentHash } } : {}),
              after: { revision: number, hash: p.hash },
              meta: { key: p.key, number, keepDate, change, version },
              ...client,
            },
            tx,
          );
          revisions.push(rev);
        }

        // 5. The notice's own audit row.
        const wordsChanged = Object.fromEntries(prepared.map((p) => [p.key, p.smallFix?.words ?? null]));
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'privacy.notice.publish',
            entityType: 'PrivacyNoticeVersion',
            entityId: version,
            meta: {
              version,
              change,
              revisions: revisions.map((r, k) => ({ key: prepared[k].key, number: r.number })),
              wordsChanged,
              affectsAnalytics: material ? dto.affectsAnalytics === true : null,
              affectsCookies: material ? dto.affectsCookies === true : null,
            },
            ...client,
          },
          tx,
        );
        return { version, revisions, keys: prepared.map((p) => p.key), cookieVersion };
      },
      { timeout: 30_000 },
    );

    // After the commit: this process, then every other one (§5.4), then the website.
    if (material) {
      await this.notice.reload('publish');
      await this.notice.broadcast();
    }
    const tags = [
      ...result.keys.map((k) => `content:${k}`),
      ...(material ? [SITE_CHROME_TAG] : []),
      ...(result.cookieVersion ? [SITE_SETTINGS_TAG] : []),
    ];
    await this.cache.invalidate(`privacy notice ${material ? 'material' : 'minor'} ${result.version}`, tags);
    if (!material) void this.emailSuperAdmins(actor, summaryEn, result.revisions[0], result.keys);

    return {
      version: result.version,
      revisions: result.revisions.map((r, k) => ({
        id: r.id,
        key: result.keys[k],
        number: r.number,
        change: r.change,
        noticeVersion: r.noticeVersion,
        summary: r.summary,
        summaryHi: r.summaryHi,
        dateShown: r.dateShown,
        publishedAt: r.publishedAt,
        publishedByEmail: r.publishedByEmail,
      })),
      ...(result.cookieVersion ? { cookieVersion: result.cookieVersion } : {}),
    };
  }

  /** A live revision as the small-fix guard compares it. */
  private shapeOf(key: PrivacyKey, rev: SiteContentRevision): NoticeShape {
    const schema = schemaFor('LEGAL', key);
    const ctx = newContext(this.legal.siteUrl(), istDay(new Date()), true);
    const value = schema ? validateContent(schema, upgradeContent('LEGAL', rev.schemaVersion, rev.content), ctx) : {};
    const info: DocInfo | undefined = ctx.docs.get('body');
    return {
      info: info ?? { tokens: [], anchors: [], h2: 0, h3: 0, tables: 0, tableRows: [], listItems: 0, links: [], mediaIds: [], requestForms: 0, cookieSettings: 0, blocks: [] },
      head: headTexts((value ?? {}) as Record<string, unknown>),
    };
  }

  /**
   * Every minor publish emails every active Super Admin (W7 decision 1),
   * best effort, after the commit. The audit row is the record.
   */
  async emailSuperAdmins(
    actor: StaffPrincipal,
    summary: string,
    rev: SiteContentRevision | undefined,
    keys: readonly string[],
  ): Promise<number> {
    try {
      const admins = await this.prisma.staffProfile.findMany({
        where: {
          status: StaffStatus.ACTIVE,
          user: { roles: { some: { role: { key: SUPER_ADMIN } } } },
        },
        select: { user: { select: { emailAlias: true } } },
        take: 50,
      });
      const to = [...new Set(admins.map((a) => a.user.emailAlias).filter((e): e is string => !!e))];
      if (!to.length) return 0;
      const by = actor.email ?? actor.displayName;
      const what = summary || '(no summary given)';
      const langs = keys.map((k) => (k === 'privacy' ? 'English' : 'Hindi')).join(' and ');
      const portal = this.config.get('newsroom', { infer: true }).portalUrl.replace(/\/+$/, '');
      const link = `${portal}/pages/${keys[0] ?? 'privacy'}/history${rev ? `?revision=${rev.id}` : ''}`;
      const subject = 'Minor change to the privacy notice';
      const line = `Minor change to the privacy notice by ${by}: ${what}`;
      const html = [
        this.mail.para(escapeHtml(line)),
        this.mail.para(escapeHtml(`Published: ${langs}, as a minor change under version ${rev?.noticeVersion ?? ''}. Nobody is asked to accept it again.`)),
        this.mail.button('Compare in the history', link),
      ].join('');
      const text = `${line}\n\nPublished: ${langs}, as a minor change under version ${rev?.noticeVersion ?? ''}.\n\nCompare: ${link}`;
      let sent = 0;
      for (const addr of to) {
        try {
          await this.mail.notify(addr, subject, subject, html, text);
          sent++;
        } catch (err) {
          this.logger.warn(`Couldn't email ${addr} about the minor privacy change: ${(err as Error).message}`);
        }
      }
      return sent;
    } catch (err) {
      this.logger.warn(`Couldn't email the Super Admins about the minor privacy change: ${(err as Error).message}`);
      return 0;
    }
  }
}
