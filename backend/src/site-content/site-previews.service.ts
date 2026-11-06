import { randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { SiteContentKind } from '@prisma/client';
import { enforceRateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import type { StaffPrincipal } from '../staff/staff-request';
import { serveChrome, type StoredChrome } from './chrome-links';
import { cmsUnavailable, isMissingTable, notFound, SiteContentError } from './errors';
import { LegalRecordService } from './legal-record.service';
import { MediaResolver } from './media-resolve';
import { FIXED_ITEMS, isFixedKey } from './registry';
import { SiteContentService } from './site-content.service';

/** A preview lives this long, refreshed on every PUT (W7 addendum §7.2). */
export const PREVIEW_TTL_SECONDS = 30 * 60;
/** Per staff member, per minute (they skip the shared global throttle). */
export const PREVIEW_PUT_LIMIT = 40;
export const PREVIEW_GET_LIMIT = 60;
/** Opening a preview pane: its own bucket, so the PUT limit stays exactly 40 a minute. */
export const PREVIEW_CREATE_LIMIT = 20;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const keyOf = (token: string) => `site:preview:${token}`;

interface StoredPreview {
  key: string;
  kind: SiteContentKind;
  lang: string;
  staffId: string;
  content: Record<string, unknown>;
}

const expired = () =>
  new SiteContentError(HttpStatus.NOT_FOUND, 'preview_expired', 'This preview has expired. Open it again from the editor.');

/**
 * Live previews of unsaved drafts (W7 addendum §7.2, §8.9): the editor posts
 * its content, the web's /preview/<token> route reads it back with the staff
 * session. Previews live in Redis for 30 minutes, belong to the staff member
 * who made them, and have their own per-staff limits instead of the global
 * per-IP throttle (every portal call comes from the web server's IP).
 * Lengths and counts aren't enforced (half-typed text still previews), the
 * shape, link, token and id rules are.
 */
@Injectable()
export class SitePreviewsService {
  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly content: SiteContentService,
    private readonly media: MediaResolver,
    private readonly legal: LegalRecordService,
  ) {}

  private async limit(kind: 'create' | 'put' | 'get', staffId: string) {
    const n = kind === 'put' ? PREVIEW_PUT_LIMIT : kind === 'get' ? PREVIEW_GET_LIMIT : PREVIEW_CREATE_LIMIT;
    try {
      await enforceRateLimit(this.redis.client, `site:preview:rl:${kind}:${staffId}`, n, 60);
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw new SiteContentError(HttpStatus.TOO_MANY_REQUESTS, 'preview_busy', 'Preview paused for a moment.');
      }
      throw err;
    }
  }

  /** The item a preview is for: its kind and language. */
  private async itemFor(key: string): Promise<{ kind: SiteContentKind; lang: string }> {
    if (isFixedKey(key)) return { kind: FIXED_ITEMS[key].kind, lang: FIXED_ITEMS[key].lang };
    try {
      const row = await this.prisma.siteContent.findUnique({ where: { key }, select: { kind: true, lang: true, status: true } });
      if (!row || row.kind !== 'CUSTOM' || row.status === 'ARCHIVED') throw notFound('That page');
      return { kind: row.kind, lang: row.lang };
    } catch (err) {
      if (isMissingTable(err)) throw cmsUnavailable();
      throw err;
    }
  }

  private async load(token: string, actor: StaffPrincipal): Promise<StoredPreview> {
    if (!TOKEN.test(token)) throw expired();
    const raw = await this.redis.client.get(keyOf(token));
    if (!raw) throw expired();
    const p = JSON.parse(raw) as StoredPreview;
    // Somebody else's preview looks exactly like an expired one.
    if (p.staffId !== actor.staffId) throw expired();
    return p;
  }

  /** POST staff/site/previews */
  async create(actor: StaffPrincipal, key: string, input: Record<string, unknown>) {
    const { kind, lang } = await this.itemFor(key);
    this.content.assertWrite(actor, kind);
    await this.limit('create', actor.staffId);
    const { value, warnings } = await this.content.check(kind, key, input, { lenient: true });
    const token = randomBytes(32).toString('base64url');
    const stored: StoredPreview = { key, kind, lang, staffId: actor.staffId, content: value };
    await this.redis.client.set(keyOf(token), JSON.stringify(stored), 'EX', PREVIEW_TTL_SECONDS);
    return { token, url: `/preview/${token}`, warnings };
  }

  /** PUT staff/site/previews/:token (the same staff member only). */
  async update(actor: StaffPrincipal, token: string, input: Record<string, unknown>) {
    await this.limit('put', actor.staffId);
    const p = await this.load(token, actor);
    this.content.assertWrite(actor, p.kind);
    const { value } = await this.content.check(p.kind, p.key, input, { lenient: true });
    await this.redis.client.set(keyOf(token), JSON.stringify({ ...p, content: value }), 'EX', PREVIEW_TTL_SECONDS);
  }

  /** GET staff/site/previews/:token: what the web's preview route renders. */
  async read(actor: StaffPrincipal, token: string) {
    await this.limit('get', actor.staffId);
    const p = await this.load(token, actor);
    this.content.assertWrite(actor, p.kind);
    const content = await this.media.resolve(p.content);
    const out: Record<string, unknown> = { key: p.key, kind: p.kind, lang: p.lang, content };
    if (p.kind === 'LEGAL' || p.kind === 'CUSTOM') {
      const settings = await this.prisma.siteSetting.findUnique({
        where: { id: 'singleton' },
        select: { contactEmail: true, config: true },
      });
      let noticeVersion: string | null = null;
      if (p.kind === 'LEGAL') {
        const row = await this.prisma.siteContent
          .findUnique({ where: { key: p.key }, include: { publishedRevision: { select: { noticeVersion: true } } } })
          .catch(() => null);
        noticeVersion = row?.publishedRevision?.noticeVersion ?? null;
      }
      out.liveValues = this.legal.valuesFor(p.content, settings, noticeVersion);
    }
    if (p.kind === 'CHROME') out.chrome = await serveChrome(this.prisma, p.content as unknown as StoredChrome);
    return out;
  }
}
