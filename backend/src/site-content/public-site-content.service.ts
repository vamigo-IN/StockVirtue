import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { serveChrome, type StoredChrome } from './chrome-links';
import { tableExists } from './db';
import { cmsUnavailable, isMissingTable, notFound, SiteContentError } from './errors';
import { LegalRecordService } from './legal-record.service';
import { MediaResolver } from './media-resolve';
import { FIXED_ITEMS, FIXED_KEYS, isFixedKey, isPrivacyKey } from './registry';
import { upgradeContent } from './schemas';
import { ID_PATTERN } from './schemas/reserved-ids';
import { SiteContentCache } from './site-content.cache';
import { HttpStatus } from '@nestjs/common';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The dated "We updated our privacy notice" line: in the footer for 30 days (§5.6). */
export const NOTICE_LINE_DAYS = 30;
/** …and with the change summary on /privacy and /privacy/hi for 90 days. */
export const NOTICE_SUMMARY_DAYS = 90;

const NOT_PUBLISHED = { __notPublished: true } as const;
type Missing = typeof NOT_PUBLISHED;
const isMissing = (v: unknown): v is Missing => !!v && typeof v === 'object' && '__notPublished' in v;

const notPublished = () =>
  new SiteContentError(HttpStatus.NOT_FOUND, 'not_published', 'This page uses its built-in text.');

export const revisionInfo = (r: {
  number: number;
  publishedAt: Date;
  dateShown: Date;
  dateLabel: string | null;
  noticeVersion: string | null;
  change: string;
}) => ({
  number: r.number,
  publishedAt: r.publishedAt,
  dateShown: r.dateShown,
  dateLabel: r.dateLabel,
  noticeVersion: r.noticeVersion,
  change: r.change,
});

/**
 * The public reads of the admin-managed site (W7 addendum §7.1), for the
 * website's server: published revisions only, media resolved, cached in
 * Redis for 30 s under the `site:pub:gen` generation. A built-in item (no
 * row, or never published) is 404 `not_published`; with the W7 tables
 * missing every read is 503, which the web treats like any outage (§2.4).
 */
@Injectable()
export class PublicSiteContentService {
  private readonly logger = new Logger(PublicSiteContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SiteContentCache,
    private readonly media: MediaResolver,
    private readonly legal: LegalRecordService,
  ) {}

  /** GET /api/v1/site/content/:key (every fixed key but `chrome`). */
  async content(key: string) {
    if (!isFixedKey(key) || key === 'chrome') throw notFound('That page');
    const body = await this.guard(() => this.cache.get(`content:${key}`, () => this.loadContent(key)));
    if (isMissing(body)) throw notPublished();
    return body;
  }

  private async loadContent(key: string) {
    const row = await this.prisma.siteContent.findUnique({
      where: { key },
      include: { publishedRevision: true },
    });
    const rev = row?.publishedRevision;
    if (!row || !rev || row.status !== 'LIVE') return NOT_PUBLISHED;
    const content = await this.media.resolve(upgradeContent(row.kind, rev.schemaVersion, rev.content));
    const out: Record<string, unknown> = {
      key,
      kind: row.kind,
      lang: row.lang,
      content,
      revision: revisionInfo(rev),
    };
    if (row.kind === 'LEGAL') out.liveValues = rev.liveValues ?? {};
    if (isPrivacyKey(key)) out.notice = await this.noticeInfo();
    return out;
  }

  /** GET /api/v1/site/chrome: each part null while built-in; the notice line always. */
  async chrome() {
    return this.guard(() =>
      this.cache.get('chrome', async () => {
        const row = await this.prisma.siteContent.findUnique({
          where: { key: 'chrome' },
          include: { publishedRevision: true },
        });
        const rev = row?.publishedRevision;
        const served =
          row && rev && row.status === 'LIVE'
            ? await serveChrome(this.prisma, upgradeContent('CHROME', rev.schemaVersion, rev.content) as StoredChrome)
            : { menus: null, footer: null, notFound: null };
        return { ...served, noticeLine: await this.noticeLine() };
      }),
    );
  }

  /** GET /api/v1/site/pages/:slug: a LIVE custom page, or `{ movedTo }` for an old slug. */
  async page(slug: string) {
    if (!(typeof slug === 'string' && slug.length >= 2 && slug.length <= 60 && ID_PATTERN.test(slug))) {
      throw notFound('That page');
    }
    const body = await this.guard(() =>
      this.cache.get(`page:${slug}`, async () => {
        const row = await this.prisma.siteContent.findUnique({
          where: { slug },
          include: { publishedRevision: true },
        });
        const rev = row?.publishedRevision;
        if (row && rev && row.kind === 'CUSTOM' && row.status === 'LIVE') {
          const c = (await this.media.resolve(upgradeContent('CUSTOM', rev.schemaVersion, rev.content))) as Record<
            string,
            unknown
          >;
          const settings = await this.prisma.siteSetting.findUnique({
            where: { id: 'singleton' },
            select: { contactEmail: true, config: true },
          });
          return {
            slug,
            title: c.title ?? '',
            intro: c.intro ?? '',
            body: c.body ?? { type: 'doc', content: [] },
            seo: c.seo ?? { title: '', description: '', noindex: false },
            showUpdated: c.showUpdated !== false,
            revision: revisionInfo(rev),
            liveValues: this.legal.valuesFor(rev.content, settings, null),
          };
        }
        const moved = await this.prisma.siteContent.findFirst({
          where: { kind: 'CUSTOM', status: 'LIVE', previousSlugs: { has: slug } },
          select: { slug: true },
        });
        if (moved?.slug) return { movedTo: moved.slug };
        return NOT_PUBLISHED;
      }),
    );
    if (isMissing(body)) throw notFound('That page');
    return body;
  }

  /** GET /api/v1/site/content-index: the sitemap and generateStaticParams. */
  async contentIndex() {
    return this.guard(() =>
      this.cache.get('content-index', async () => {
        const rows = await this.prisma.siteContent.findMany({
          where: { status: 'LIVE', publishedRevisionId: { not: null } },
          include: { publishedRevision: { select: { publishedAt: true, content: true } } },
        });
        const byKey = new Map(rows.map((r) => [r.key, r]));
        const fixed = FIXED_KEYS.filter((k) => FIXED_ITEMS[k].path).map((k) => ({
          key: k,
          path: FIXED_ITEMS[k].path as string,
          updatedAt: byKey.get(k)?.publishedRevision?.publishedAt ?? null,
        }));
        const custom = rows
          .filter((r) => r.kind === 'CUSTOM' && r.slug)
          .map((r) => {
            const c = (r.publishedRevision?.content ?? {}) as { title?: string; seo?: { noindex?: boolean } };
            return {
              slug: r.slug as string,
              title: c.title || r.title,
              updatedAt: r.publishedRevision?.publishedAt ?? null,
              noindex: c.seo?.noindex === true,
            };
          })
          .sort((a, b) => a.slug.localeCompare(b.slug));
        return { fixed, custom };
      }),
    );
  }

  /** The current notice version, for /privacy and /privacy/hi (§5.6, §7.1). */
  private async noticeInfo() {
    const v = await this.prisma.privacyNoticeVersion.findFirst({ orderBy: { seq: 'desc' } });
    if (!v || !v.announce) return null;
    const showUntil = new Date(v.materialAt.getTime() + NOTICE_SUMMARY_DAYS * DAY_MS);
    if (showUntil.getTime() <= Date.now()) return null;
    return {
      version: v.id,
      materialAt: v.materialAt,
      summaryEn: v.summaryEn,
      summaryHi: v.summaryHi,
      showUntil,
    };
  }

  /** The footer's dated line: for 30 days after an announced material change. */
  private async noticeLine() {
    const v = await this.prisma.privacyNoticeVersion.findFirst({ orderBy: { seq: 'desc' } });
    if (!v || !v.announce) return null;
    const until = new Date(v.materialAt.getTime() + NOTICE_LINE_DAYS * DAY_MS);
    if (until.getTime() <= Date.now()) return null;
    return { date: v.materialAt, until };
  }

  /** A missing W7 table is a 503, logged once. */
  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof SiteContentError) throw err;
      if (isMissingTable(err) || !(await this.tablesPresent())) {
        this.logger.error('site_cms migration not applied: the public content endpoints answer 503.');
        throw cmsUnavailable();
      }
      throw err;
    }
  }

  private async tablesPresent(): Promise<boolean> {
    try {
      return (await tableExists(this.prisma, 'site_content')) && (await tableExists(this.prisma, 'site_content_revisions'));
    } catch {
      return false;
    }
  }
}
