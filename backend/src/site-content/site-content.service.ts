import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, SiteContent, SiteContentKind, SiteContentRevision } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { has } from '../newsroom/articles/article-access';
import { PrismaService } from '../prisma/prisma.service';
import type { PermissionKey } from '../rbac/rbac.catalog';
import type { ClientInfo, StaffPrincipal } from '../staff/staff-request';
import { canonicalJson, contentHash, jsonBytes, MAX_CONTENT_BYTES } from './canonical';
import { chromeLinks, customPagesFor, type StoredChrome } from './chrome-links';
import { lockItem, type Db } from './db';
import {
  invalidContent,
  isMissingTable,
  cmsUnavailable,
  notFound,
  SiteContentError,
  staleDraft,
  type FieldError,
} from './errors';
import { LegalRecordService } from './legal-record.service';
import { MediaResolver } from './media-resolve';
import { revisionInfo } from './public-site-content.service';
import {
  FIXED_ITEMS,
  FIXED_KEYS,
  isFixedKey,
  isPrivacyKey,
  itemTag,
  READ_PERMISSIONS,
  SITE_CHROME_TAG,
  SITE_PAGES_TAG,
  writePermission,
  type FixedItem,
} from './registry';
import { hookProblems } from './rich/legal-doc';
import { LOCKED_DEFAULTS, profileFor, SCHEMA_VERSION, schemaFor, typesPayload, upgradeContent } from './schemas';
import { classifyMenuPath, pathOnly } from './schemas/chrome';
import { line, newContext, validateContent, type ValidationContext } from './schemas/fields';
import { slugProblem } from './schemas/reserved-ids';
import { SiteContentCache } from './site-content.cache';
import { ANNOUNCED_VIA, announcementProblem, istDay, type AnnouncedVia } from './terms-notice';
import type {
  CreatePageDto,
  DraftVersionDto,
  PublishDto,
  SaveDraftDto,
  UpdatePageDto,
} from './site-content.dto';

type Row = SiteContent & { publishedRevision: SiteContentRevision | null };

/** An item: a fixed key (maybe without a row yet) or a custom page. */
interface Item {
  key: string;
  kind: SiteContentKind;
  fixed: FixedItem | null;
  row: Row | null;
}

export interface CheckOptions {
  actor?: StaffPrincipal;
  /** The item's row, for the legal-locked baseline and published ids. */
  row?: Row | null;
  /** The "Change link" action: published ids may change. */
  renameIds?: boolean;
  /** Publish: menus must link LIVE pages; the baseline is the live revision. */
  forPublish?: boolean;
  /** Previews: no length/count limits, no database checks. */
  lenient?: boolean;
  db?: Db;
}

const LEGAL_SUMMARY_MAX = 300;
const FACT_KEY = /^F([1-9]|[1-3]\d|4[0-2])$/;

const forbidden = (message: string) => new SiteContentError(HttpStatus.FORBIDDEN, 'not_allowed', message);
const nothingToPublish = (message = 'There are no changes to publish.') =>
  new SiteContentError(HttpStatus.BAD_REQUEST, 'nothing_to_publish', message);
const tooLarge = (bytes: number) =>
  new SiteContentError(
    HttpStatus.BAD_REQUEST,
    'too_large',
    `This page is too large to save (${Math.ceil(bytes / 1024)} KB of ${MAX_CONTENT_BYTES / 1024} KB). Shorten it, or split it into two pages.`,
  );

function getAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * The staff side of the admin-managed public site (W7 addendum §2.3, §7.2,
 * §7.3): one draft per item with optimistic locking, publishes that append
 * an immutable revision, history and restore, custom pages. Every save is
 * validated against the item's schema (or document profile); publishes also
 * check the hooks. The two privacy notices publish through the privacy
 * notice flow (M7.3), not here.
 */
@Injectable()
export class SiteContentService {
  private readonly logger = new Logger(SiteContentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: SiteContentCache,
    private readonly legal: LegalRecordService,
    private readonly media: MediaResolver,
  ) {}

  /* ── Permissions (§7.3) ──────────────────────────────────────────────── */

  assertRead(actor: StaffPrincipal) {
    if (READ_PERMISSIONS.some((p) => has(actor, p))) return;
    throw forbidden('You don’t have permission to see the website’s pages (needs "site.manage", "legal.manage" or "settings.read").');
  }

  assertWrite(actor: StaffPrincipal, kind: SiteContentKind) {
    const p: PermissionKey = writePermission(kind);
    if (has(actor, p)) return;
    throw forbidden(`You don’t have permission to edit this page (needs "${p}"). Ask an admin.`);
  }

  /* ── Items ───────────────────────────────────────────────────────────── */

  private async item(key: string, db: Db = this.prisma): Promise<Item> {
    const fixed = isFixedKey(key) ? FIXED_ITEMS[key] : null;
    if (!fixed && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key)) {
      throw notFound('That page');
    }
    let row: Row | null;
    try {
      row = await db.siteContent.findUnique({ where: { key }, include: { publishedRevision: true } });
    } catch (err) {
      if (isMissingTable(err)) throw cmsUnavailable();
      throw err;
    }
    if (!fixed && (!row || row.kind !== 'CUSTOM' || row.status === 'ARCHIVED')) throw notFound('That page');
    return { key, kind: fixed?.kind ?? 'CUSTOM', fixed, row };
  }

  private status(it: Item): 'BUILT_IN' | 'DRAFT' | 'LIVE' | 'HIDDEN' {
    const r = it.row;
    if (!r) return 'BUILT_IN';
    if (r.status === 'LIVE' || r.status === 'HIDDEN') return r.status;
    if (it.kind !== 'CUSTOM' && !r.draft && !r.publishedRevisionId) return 'BUILT_IN';
    return 'DRAFT';
  }

  private async names(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map();
    const rows = await this.prisma.staffProfile.findMany({
      where: { id: { in: list } },
      select: { id: true, displayName: true },
    });
    return new Map(rows.map((r) => [r.id, r.displayName]));
  }

  private itemView(it: Item, names: Map<string, string>) {
    const r = it.row;
    const live = r?.publishedRevision ?? null;
    return {
      key: it.key,
      kind: it.kind,
      title: it.kind === 'CUSTOM' ? (r?.title ?? '') : (it.fixed?.title ?? ''),
      path: it.kind === 'CUSTOM' ? (r?.slug ? `/${r.slug}` : null) : (it.fixed?.path ?? null),
      slug: it.kind === 'CUSTOM' ? (r?.slug ?? null) : undefined,
      previousSlugs: it.kind === 'CUSTOM' ? (r?.previousSlugs ?? []) : undefined,
      lang: r?.lang ?? it.fixed?.lang ?? 'en',
      status: this.status(it),
      hasDraft: !!r?.draft,
      draftVersion: r?.draftVersion ?? 0,
      draftUpdatedAt: r?.draftUpdatedAt ?? null,
      draftUpdatedBy: r?.draftUpdatedById ? (names.get(r.draftUpdatedById) ?? null) : null,
      restoredFromId: r?.draftRestoredFromId ?? null,
      live: live
        ? {
            number: live.number,
            publishedAt: live.publishedAt,
            publishedBy: (live.publishedById && names.get(live.publishedById)) || live.publishedByEmail || null,
            noticeVersion: live.noticeVersion,
            change: live.change,
          }
        : null,
      factsSnapshot: live?.factsSnapshot ?? null,
    };
  }

  private revisionView(rev: SiteContentRevision, names: Map<string, string>) {
    return {
      id: rev.id,
      ...revisionInfo(rev),
      summary: rev.summary,
      summaryHi: rev.summaryHi,
      publishedBy: (rev.publishedById && names.get(rev.publishedById)) || rev.publishedByEmail || null,
      publishedByEmail: rev.publishedByEmail,
      contentHash: rev.contentHash,
      liveValues: rev.liveValues ?? null,
      factsSnapshot: rev.factsSnapshot ?? null,
      restoredFromId: rev.restoredFromId,
      announcedAt: rev.announcedAt,
      announcedVia: rev.announcedVia,
    };
  }

  /* ── Reads ───────────────────────────────────────────────────────────── */

  /** GET staff/site/content: every fixed item (BUILT_IN without a row) and the custom pages. */
  async list(actor: StaffPrincipal) {
    this.assertRead(actor);
    let rows: Row[];
    try {
      rows = await this.prisma.siteContent.findMany({
        where: { status: { not: 'ARCHIVED' } },
        include: { publishedRevision: true },
      });
    } catch (err) {
      if (isMissingTable(err)) throw cmsUnavailable();
      throw err;
    }
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const names = await this.names(rows.flatMap((r) => [r.draftUpdatedById, r.publishedRevision?.publishedById]));
    const fixed = FIXED_KEYS.map((k) =>
      this.itemView({ key: k, kind: FIXED_ITEMS[k].kind, fixed: FIXED_ITEMS[k], row: byKey.get(k) ?? null }, names),
    );
    const custom = rows
      .filter((r) => r.kind === 'CUSTOM')
      .map((r) => this.itemView({ key: r.key, kind: 'CUSTOM', fixed: null, row: r }, names))
      .sort((a, b) => a.title.localeCompare(b.title));
    return { items: [...fixed, ...custom] };
  }

  types(actor: StaffPrincipal) {
    this.assertRead(actor);
    return typesPayload();
  }

  /** GET staff/site/content/:key */
  async get(actor: StaffPrincipal, key: string) {
    this.assertRead(actor);
    const it = await this.item(key);
    const r = it.row;
    const names = await this.names([r?.draftUpdatedById, r?.publishedRevision?.publishedById]);
    const live = r?.publishedRevision ?? null;
    return {
      item: this.itemView(it, names),
      draft: r?.draft ? upgradeContent(it.kind, r.schemaVersion, r.draft) : null,
      draftVersion: r?.draftVersion ?? 0,
      live: live
        ? { revision: this.revisionView(live, names), content: upgradeContent(it.kind, live.schemaVersion, live.content) }
        : null,
      schemaVersion: SCHEMA_VERSION,
    };
  }

  async revisions(actor: StaffPrincipal, key: string) {
    this.assertRead(actor);
    const it = await this.item(key);
    if (!it.row) return { items: [] };
    const revs = await this.prisma.siteContentRevision.findMany({
      where: { contentId: it.row.id },
      orderBy: { number: 'desc' },
      take: 500,
    });
    const names = await this.names(revs.map((r) => r.publishedById));
    return {
      items: revs.map((r) => {
        const v = this.revisionView(r, names);
        return {
          id: v.id,
          number: v.number,
          change: v.change,
          summary: v.summary,
          summaryHi: v.summaryHi,
          noticeVersion: v.noticeVersion,
          dateShown: v.dateShown,
          dateLabel: v.dateLabel,
          publishedAt: v.publishedAt,
          publishedBy: v.publishedBy,
          live: r.id === it.row?.publishedRevisionId,
        };
      }),
    };
  }

  async revision(actor: StaffPrincipal, key: string, id: string) {
    this.assertRead(actor);
    const it = await this.item(key);
    const rev = it.row
      ? await this.prisma.siteContentRevision.findFirst({ where: { id, contentId: it.row.id } })
      : null;
    if (!rev) throw notFound('That revision');
    const names = await this.names([rev.publishedById]);
    return {
      revision: this.revisionView(rev, names),
      content: upgradeContent(it.kind, rev.schemaVersion, rev.content),
    };
  }

  /* ── Validation ──────────────────────────────────────────────────────── */

  /**
   * Validates a content against the item's schema and every rule the
   * database decides (§2.3). Throws 400 `invalid_content` with field errors,
   * 400 `too_large`, 403 `legal_field_locked`. Lenient (previews): returns
   * the errors instead of throwing, and skips the database checks.
   */
  async check(
    kind: SiteContentKind,
    key: string,
    input: unknown,
    o: CheckOptions = {},
  ): Promise<{ value: Record<string, unknown>; ctx: ValidationContext; warnings: FieldError[] }> {
    const db = o.db ?? this.prisma;
    const raw = jsonBytes(input);
    if (raw > MAX_CONTENT_BYTES) throw tooLarge(raw);
    const schema = schemaFor(kind, key);
    if (!schema) throw notFound('That page');
    const ctx = newContext(this.legal.siteUrl(), istDay(new Date()), !!o.lenient);
    const value = validateContent(schema, input, ctx);
    const bytes = jsonBytes(value);
    if (bytes > MAX_CONTENT_BYTES) throw tooLarge(bytes);
    if (o.lenient) return { value, ctx, warnings: ctx.errors };

    const warnings: FieldError[] = [];
    if (o.actor) this.checkLocked(o.actor, key, value, ctx, o);
    if (o.row?.publishedRevision && !o.renameIds) this.checkRenames(kind, key, o.row, ctx);
    await this.checkMedia(ctx, db);
    if (kind === 'CHROME') await this.checkMenuLinks(ctx, !!o.forPublish, warnings, db);
    if (key === 'download') await this.checkFaqRefs(ctx, db);
    if (ctx.errors.length) throw invalidContent(ctx.errors);
    return { value, ctx, warnings };
  }

  /** Legal-locked fields need legal.manage (§3.1): compared with the current text. */
  private checkLocked(actor: StaffPrincipal, key: string, value: unknown, ctx: ValidationContext, o: CheckOptions) {
    if (ctx.locked.size === 0 || has(actor, 'legal.manage')) return;
    const live = o.row?.publishedRevision?.content;
    // A draft save compares with the draft (or the live text); a publish with the live text.
    const baseline = o.forPublish ? live : (o.row?.draft ?? live);
    for (const path of ctx.locked.keys()) {
      const before = baseline !== undefined && baseline !== null ? getAt(baseline, path) : LOCKED_DEFAULTS[key]?.[path];
      if (before === undefined || canonicalJson(before) !== canonicalJson(getAt(value, path))) {
        throw new SiteContentError(
          HttpStatus.FORBIDDEN,
          'legal_field_locked',
          'Only someone who may edit legal pages (legal.manage) can change the legal wording on this page. Your other changes were not saved either.',
          { path },
        );
      }
    }
  }

  /**
   * Published ids are links people already have (§3.1): a published id that
   * disappears while a new one takes its place is a rename, which needs the
   * "Change link" action (renameIds).
   */
  private checkRenames(kind: SiteContentKind, key: string, row: Row, ctx: ValidationContext) {
    const schema = schemaFor(kind, key);
    const live = row.publishedRevision?.content;
    if (!schema || !live) return;
    const liveCtx = newContext(ctx.siteUrl, ctx.today, true);
    validateContent(schema, upgradeContent(kind, row.publishedRevision?.schemaVersion ?? 1, live), liveCtx);
    for (const [scope, ids] of ctx.ids) {
      const before = (liveCtx.ids.get(scope) ?? []).filter((x) => x.immutable).map((x) => x.id);
      if (!before.length) continue;
      const now = ids.map((x) => x.id);
      ids.forEach((x, i) => {
        if (!x.immutable || before.includes(x.id)) return;
        const old = before[i];
        if (old !== undefined && !now.includes(old)) {
          ctx.errors.push({
            path: x.path,
            message: `This changes the published link name "${old}" to "${x.id}", so links people already have stop working. Use "Change link" to do it on purpose.`,
          });
        }
      });
    }
  }

  private async checkMedia(ctx: ValidationContext, db: Db) {
    if (!ctx.media.length) return;
    const ready = await this.media.readyIds(ctx.media.map((m) => m.mediaId), db);
    for (const m of ctx.media) {
      if (!ready.has(m.mediaId)) ctx.errors.push({ path: m.path, message: 'Pick an image from the media library.' });
    }
  }

  /** Menus: custom pages exist (LIVE when publishing), sections are on, paths are pages (§6.2). */
  private async checkMenuLinks(ctx: ValidationContext, forPublish: boolean, warnings: FieldError[], db: Db) {
    const links = ctx.menuLinks;
    const pages = await customPagesFor(db, links.map((l) => l.link.target));
    const byId = new Map(pages.map((p) => [p.id, p]));
    const bySlug = new Map(pages.filter((p) => p.slug).map((p) => [p.slug as string, p]));
    const cats = links.filter((l) => l.link.target.type === 'category');
    const active = cats.length
      ? new Set(
          (
            await db.newsCategory.findMany({
              where: {
                slug: { in: cats.map((c) => (c.link.target as { slug: string }).slug) },
                isActive: true,
              },
              select: { slug: true },
            })
          ).map((c) => c.slug),
        )
      : new Set<string>();
    for (const { path, link } of links) {
      const t = link.target;
      const tp = `${path}.target`;
      let page: { id: string; slug: string | null; status: string; title: string } | undefined;
      if (t.type === 'page') {
        page = byId.get(t.pageId);
        if (!page || page.status === 'ARCHIVED') {
          ctx.errors.push({ path: tp, message: 'That page no longer exists. Pick another one.' });
          continue;
        }
      } else if (t.type === 'path' && classifyMenuPath(t.path) === 'custom') {
        const slug = pathOnly(t.path).slice(1);
        page = bySlug.get(slug);
        if (!page || page.status === 'ARCHIVED') {
          ctx.errors.push({ path: tp, message: `"${t.path}" isn’t a page on the site.` });
          continue;
        }
      } else if (t.type === 'category') {
        if (!active.has(t.slug)) ctx.errors.push({ path: tp, message: 'Pick a news section that is switched on.' });
        continue;
      } else {
        continue;
      }
      if (page.status !== 'LIVE') {
        if (forPublish) {
          throw new SiteContentError(
            HttpStatus.BAD_REQUEST,
            'page_not_live',
            `Publish "${page.title}" first, or remove its link.`,
            { path: tp, pageId: page.id },
          );
        }
        warnings.push({ path: tp, message: `"${page.title}" isn’t published yet: publish it before the menus.` });
      }
    }
  }

  /** download → FAQ ids: when the FAQ is published, they must be in it (§3.6). */
  private async checkFaqRefs(ctx: ValidationContext, db: Db) {
    if (!ctx.refs.length) return;
    const faq = await db.siteContent.findUnique({
      where: { key: 'faq' },
      include: { publishedRevision: { select: { content: true } } },
    });
    const content = faq?.status === 'LIVE' ? faq.publishedRevision?.content : null;
    if (!content) return; // built-in FAQ: a missing id is skipped at render
    const ids = new Set<string>();
    const groups = (content as { groups?: { items?: { id?: string }[] }[] }).groups ?? [];
    for (const g of groups) for (const i of g.items ?? []) if (i.id) ids.add(i.id);
    for (const r of ctx.refs) {
      if (!ids.has(r.id)) ctx.errors.push({ path: r.path, message: `The FAQ has no question with the link name "${r.id}".` });
    }
  }

  /* ── Drafts ──────────────────────────────────────────────────────────── */

  /** PUT staff/site/content/:key/draft */
  async saveDraft(actor: StaffPrincipal, key: string, dto: SaveDraftDto, client: ClientInfo) {
    const it = await this.item(key);
    this.assertWrite(actor, it.kind);
    const { value, warnings } = await this.check(it.kind, key, dto.content, {
      actor,
      row: it.row,
      renameIds: dto.renameIds,
    });
    const now = new Date();
    const draft = value as Prisma.InputJsonValue;
    const draftVersion = await this.prisma.$transaction(async (tx) => {
      let next: number;
      let id: string;
      if (!it.row) {
        if (dto.draftVersion !== 0) throw staleDraft();
        try {
          const created = await tx.siteContent.create({
            data: {
              key,
              kind: it.kind,
              lang: it.fixed?.lang ?? 'en',
              title: it.fixed?.title ?? '',
              schemaVersion: SCHEMA_VERSION,
              draft,
              draftVersion: 1,
              draftUpdatedAt: now,
              draftUpdatedById: actor.staffId,
              createdById: actor.staffId,
            },
          });
          next = 1;
          id = created.id;
        } catch (err) {
          if ((err as { code?: string }).code === 'P2002') throw staleDraft();
          throw err;
        }
      } else {
        const res = await tx.siteContent.updateMany({
          where: { id: it.row.id, draftVersion: dto.draftVersion },
          data: {
            draft,
            draftVersion: { increment: 1 },
            draftUpdatedAt: now,
            draftUpdatedById: actor.staffId,
            schemaVersion: SCHEMA_VERSION,
          },
        });
        if (res.count === 0) throw staleDraft();
        next = dto.draftVersion + 1;
        id = it.row.id;
      }
      // Autosaves are not audited (the article precedent); explicit saves are.
      if (!dto.autosave) {
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'site.content.draft',
            entityType: 'SiteContent',
            entityId: id,
            after: { draftVersion: next, hash: contentHash(value) },
            meta: { key },
            ...client,
          },
          tx,
        );
      }
      return next;
    });
    return { draftVersion, savedAt: now, warnings };
  }

  /** POST staff/site/content/:key/draft/discard (never DELETE: the proxy drops DELETE bodies). */
  async discard(actor: StaffPrincipal, key: string, dto: DraftVersionDto, client: ClientInfo) {
    const it = await this.item(key);
    this.assertWrite(actor, it.kind);
    if (!it.row) {
      if (dto.draftVersion !== 0) throw staleDraft();
      return { draftVersion: 0 };
    }
    const row = it.row;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.siteContent.updateMany({
        where: { id: row.id, draftVersion: dto.draftVersion },
        data: { draft: Prisma.DbNull, draftRestoredFromId: null, draftVersion: { increment: 1 } },
      });
      if (res.count === 0) throw staleDraft();
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'site.content.discard',
          entityType: 'SiteContent',
          entityId: row.id,
          meta: { key },
          ...client,
        },
        tx,
      );
    });
    return { draftVersion: dto.draftVersion + 1 };
  }

  /** POST staff/site/content/:key/revisions/:id/restore: copies a revision into the draft. */
  async restore(actor: StaffPrincipal, key: string, revisionId: string, dto: DraftVersionDto, client: ClientInfo) {
    const it = await this.item(key);
    this.assertWrite(actor, it.kind);
    const row = it.row;
    const rev = row
      ? await this.prisma.siteContentRevision.findFirst({ where: { id: revisionId, contentId: row.id } })
      : null;
    if (!row || !rev) throw notFound('That revision');
    const content = upgradeContent(it.kind, rev.schemaVersion, rev.content);
    // An older text may use other ids: restoring it is a deliberate change.
    const { value } = await this.check(it.kind, key, content, { actor, row, renameIds: true });
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.siteContent.updateMany({
        where: { id: row.id, draftVersion: dto.draftVersion },
        data: {
          draft: value as Prisma.InputJsonValue,
          draftRestoredFromId: rev.id,
          draftVersion: { increment: 1 },
          draftUpdatedAt: new Date(),
          draftUpdatedById: actor.staffId,
          schemaVersion: SCHEMA_VERSION,
        },
      });
      if (res.count === 0) throw staleDraft();
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'site.content.restore',
          entityType: 'SiteContent',
          entityId: row.id,
          after: { revision: rev.number, hash: rev.contentHash },
          meta: { key, number: rev.number },
          ...client,
        },
        tx,
      );
    });
    return { draftVersion: dto.draftVersion + 1 };
  }

  /* ── Publish ─────────────────────────────────────────────────────────── */

  /** POST staff/site/content/:key/publish (every key but the two privacy notices). */
  async publish(actor: StaffPrincipal, key: string, dto: PublishDto, client: ClientInfo) {
    if (isPrivacyKey(key)) {
      throw new SiteContentError(
        HttpStatus.BAD_REQUEST,
        'privacy_notice_flow',
        'The privacy notices are published together, with their notice version, from the privacy publish dialog.',
      );
    }
    const it = await this.item(key);
    this.assertWrite(actor, it.kind);
    if (!it.row) throw nothingToPublish('Save a draft of this page first.');
    const rowId = it.row.id;
    const now = new Date();

    const result = await this.prisma.$transaction(
      async (tx) => {
        await lockItem(tx, key);
        const row = await tx.siteContent.findUnique({ where: { id: rowId }, include: { publishedRevision: true } });
        if (!row || row.status === 'ARCHIVED') throw notFound('That page');
        if (row.draftVersion !== dto.draftVersion) throw staleDraft();
        if (!row.draft) throw nothingToPublish();
        const { value, ctx } = await this.check(it.kind, key, upgradeContent(it.kind, row.schemaVersion, row.draft), {
          actor,
          row,
          renameIds: true, // the draft's ids were checked when it was saved
          forPublish: true,
          db: tx,
        });
        const profile = profileFor(it.kind, key);
        if (profile) {
          const info = ctx.docs.get('body');
          const problems = info ? hookProblems(profile, info) : ['The document is missing.'];
          if (problems.length) {
            throw new SiteContentError(HttpStatus.BAD_REQUEST, 'missing_hook', problems[0], { problems });
          }
        }
        const prev = row.publishedRevision;
        const hash = contentHash(value);
        if (prev && prev.contentHash === hash && row.status === 'LIVE') throw nothingToPublish();

        // The terms' clause 12: a change that matters to users is announced first (§4.5).
        let change: 'EDIT' | 'MATERIAL' = 'EDIT';
        let announcedAt: Date | null = null;
        let announcedVia: AnnouncedVia | null = null;
        if (key === 'terms' && dto.mattersToUsers) {
          change = 'MATERIAL';
          if (!dto.announcedAt || !dto.announcedVia || !(ANNOUNCED_VIA as readonly string[]).includes(dto.announcedVia)) {
            throw new SiteContentError(
              HttpStatus.BAD_REQUEST,
              'announcement_required',
              'Tell users first (the terms promise it), then publish on or after the day the change should take effect.',
            );
          }
          announcedAt = new Date(dto.announcedAt);
          if (Number.isNaN(announcedAt.getTime())) {
            throw invalidContent([{ path: 'announcedAt', message: 'Give the date users were told.' }]);
          }
          const problem = announcementProblem(announcedAt, now);
          if (problem) throw new SiteContentError(HttpStatus.BAD_REQUEST, problem.code, problem.message);
          announcedVia = dto.announcedVia as AnnouncedVia;
        }
        const keepDate = !!dto.keepDate && change !== 'MATERIAL' && !!prev;
        const summary = (dto.summary ?? '').trim();
        if (it.kind === 'LEGAL' && !summary) {
          throw invalidContent([{ path: 'summary', message: 'Say what changed, in a sentence (it goes in the page’s history).' }]);
        }
        if (summary.length > LEGAL_SUMMARY_MAX || /[\r\n]/.test(summary)) {
          throw invalidContent([{ path: 'summary', message: `Keep the summary to one line of at most ${LEGAL_SUMMARY_MAX} characters.` }]);
        }
        const settings =
          it.kind === 'LEGAL'
            ? await tx.siteSetting.findUnique({ where: { id: 'singleton' }, select: { contactEmail: true, config: true } })
            : null;
        const last = await tx.siteContentRevision.aggregate({ where: { contentId: row.id }, _max: { number: true } });
        const number = (last._max.number ?? 0) + 1;
        const rev = await tx.siteContentRevision.create({
          data: {
            contentId: row.id,
            number,
            schemaVersion: SCHEMA_VERSION,
            content: value as Prisma.InputJsonValue,
            contentHash: hash,
            change,
            summary,
            dateShown: keepDate && prev ? prev.dateShown : now,
            dateLabel: keepDate && prev ? prev.dateLabel : null,
            liveValues:
              it.kind === 'LEGAL' ? (this.legal.valuesFor(value, settings, null) as Prisma.InputJsonValue) : Prisma.DbNull,
            factsSnapshot: this.factsSnapshot(dto.factsSnapshot) ?? Prisma.DbNull,
            announcedAt,
            announcedVia,
            restoredFromId: row.draftRestoredFromId,
            publishedById: actor.staffId,
            publishedByEmail: actor.email ?? '',
          },
        });
        await tx.siteContent.update({
          where: { id: row.id },
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
            action: it.kind === 'LEGAL' ? 'site.legal.publish' : 'site.content.publish',
            entityType: 'SiteContent',
            entityId: row.id,
            ...(prev ? { before: { revision: prev.number, hash: prev.contentHash } } : {}),
            after: { revision: number, hash },
            meta:
              it.kind === 'LEGAL'
                ? { key, number, keepDate, change, ...(announcedAt ? { announcedAt: announcedAt.toISOString() } : {}) }
                : { key, number, summary },
            ...client,
          },
          tx,
        );
        return { rev, slug: row.slug };
      },
      { timeout: 20_000 },
    );
    const tag = itemTag(key, it.kind, result.slug);
    const tags = it.kind === 'CUSTOM' ? [tag, SITE_PAGES_TAG] : [tag];
    await this.cache.invalidate(`publish ${key}`, tags.filter((t): t is string => !!t));
    const names = await this.names([result.rev.publishedById]);
    return { revision: this.revisionView(result.rev, names), draftVersion: dto.draftVersion + 1 };
  }

  /** The fact texts the page relied on (F-id → text), as the portal sends them. */
  private factsSnapshot(input: unknown): Prisma.InputJsonValue | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (FACT_KEY.test(k) && typeof v === 'string') out[k] = v.slice(0, 2000);
    }
    return Object.keys(out).length ? out : null;
  }

  /* ── Custom pages (§3.12) ────────────────────────────────────────────── */

  private slugError(slug: unknown) {
    const p = slugProblem(slug);
    if (!p) return null;
    return p.code === 'reserved'
      ? new SiteContentError(HttpStatus.BAD_REQUEST, 'slug_reserved', p.message)
      : invalidContent([{ path: 'slug', message: p.message }]);
  }

  private async assertSlugFree(slug: string, exceptId?: string) {
    const clash = await this.prisma.siteContent.findFirst({
      where: {
        kind: 'CUSTOM',
        OR: [{ slug }, { previousSlugs: { has: slug } }],
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) {
      throw new SiteContentError(HttpStatus.CONFLICT, 'slug_taken', `"/${slug}" is already used by another page.`);
    }
  }

  private titleOf(input: unknown): string {
    const ctx = newContext(this.legal.siteUrl(), istDay(new Date()));
    const title = validateContent({ kind: 'group', fields: { title: line(3, 80) } }, { title: input }, ctx).title as string;
    if (ctx.errors.length) throw invalidContent(ctx.errors);
    return title;
  }

  /** POST staff/site/pages */
  async createPage(actor: StaffPrincipal, dto: CreatePageDto, client: ClientInfo) {
    this.assertWrite(actor, 'CUSTOM');
    const slugErr = this.slugError(dto.slug);
    if (slugErr) throw slugErr;
    const title = this.titleOf(dto.title);
    try {
      await this.assertSlugFree(dto.slug);
    } catch (err) {
      if (isMissingTable(err)) throw cmsUnavailable();
      throw err;
    }
    const id = randomUUID();
    const now = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.siteContent.create({
          data: {
            id,
            key: id,
            kind: 'CUSTOM',
            status: 'DRAFT',
            slug: dto.slug,
            title,
            schemaVersion: SCHEMA_VERSION,
            // The editor starts here; a page needs its text before it saves.
            draft: {
              title,
              intro: '',
              body: { type: 'doc', content: [] },
              seo: { title: '', description: '', noindex: false },
              showUpdated: true,
            },
            draftVersion: 1,
            draftUpdatedAt: now,
            draftUpdatedById: actor.staffId,
            createdById: actor.staffId,
          },
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'site.page.create',
            entityType: 'SiteContent',
            entityId: id,
            after: { slug: dto.slug, title },
            ...client,
          },
          tx,
        );
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new SiteContentError(HttpStatus.CONFLICT, 'slug_taken', `"/${dto.slug}" is already used by another page.`);
      }
      throw err;
    }
    return { key: id };
  }

  /** Where the published menus link to this custom page ("Footer → Company"), or []. */
  private async menuUses(page: { id: string; slug: string | null }, db: Db = this.prisma): Promise<string[]> {
    const chrome = await db.siteContent.findUnique({
      where: { key: 'chrome' },
      include: { publishedRevision: { select: { content: true } } },
    });
    const content = chrome?.status === 'LIVE' ? chrome.publishedRevision?.content : null;
    if (!content) return [];
    const places = new Set<string>();
    for (const { where, link } of chromeLinks(content as unknown as StoredChrome)) {
      const t = link.target;
      if ((t.type === 'page' && t.pageId === page.id) || (t.type === 'path' && page.slug && pathOnly(t.path) === `/${page.slug}`)) {
        places.add(where);
      }
    }
    return [...places];
  }

  private pageInMenu(places: string[]) {
    return new SiteContentError(
      HttpStatus.CONFLICT,
      'page_in_menu',
      `This page is linked from the menus (${places.join(', ')}). Remove the link and publish the menus first.`,
      { places },
    );
  }

  /** PATCH staff/site/pages/:key: slug or title (old slugs redirect once the page has been live). */
  async updatePage(actor: StaffPrincipal, key: string, dto: UpdatePageDto, client: ClientInfo) {
    const it = await this.item(key);
    if (it.kind !== 'CUSTOM' || !it.row) throw notFound('That page');
    this.assertWrite(actor, 'CUSTOM');
    const row = it.row;
    const slug = dto.slug ?? row.slug ?? '';
    const slugChanged = dto.slug !== undefined && dto.slug !== row.slug;
    if (slugChanged) {
      const slugErr = this.slugError(dto.slug);
      if (slugErr) throw slugErr;
      // Its own old slugs may come back; anybody else's may not.
      await this.assertSlugFree(slug, row.id);
    }
    const title = dto.title !== undefined ? this.titleOf(dto.title) : row.title;
    let previousSlugs = row.previousSlugs.filter((s) => s !== slug);
    if (slugChanged && row.slug && row.publishedRevisionId) {
      previousSlugs = [row.slug, ...previousSlugs.filter((s) => s !== row.slug)].slice(0, 20);
    }
    const linked = slugChanged ? await this.menuUses(row) : [];
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.siteContent.updateMany({
        where: { id: row.id, draftVersion: dto.draftVersion },
        data: { slug, title, previousSlugs, draftVersion: { increment: 1 } },
      });
      if (res.count === 0) throw staleDraft();
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'site.page.update',
          entityType: 'SiteContent',
          entityId: row.id,
          before: { slug: row.slug, title: row.title },
          after: { slug, title },
          ...client,
        },
        tx,
      );
    });
    if (row.status === 'LIVE' && (slugChanged || title !== row.title)) {
      const tags = [SITE_PAGES_TAG, `custom:${slug}`];
      if (row.slug && slugChanged) tags.push(`custom:${row.slug}`);
      if (linked.length) tags.push(SITE_CHROME_TAG);
      await this.cache.invalidate(`page ${slug}`, tags);
    }
    const updated = await this.item(key);
    return { item: this.itemView(updated, await this.names([updated.row?.draftUpdatedById])) };
  }

  /** POST staff/site/pages/:key/unpublish (HIDDEN) or …/archive (ARCHIVED, the slug freed). */
  async hidePage(actor: StaffPrincipal, key: string, to: 'HIDDEN' | 'ARCHIVED', client: ClientInfo) {
    const it = await this.item(key);
    if (it.kind !== 'CUSTOM' || !it.row) {
      throw new SiteContentError(HttpStatus.BAD_REQUEST, 'not_allowed', 'The site’s own pages can’t be unpublished or removed.');
    }
    this.assertWrite(actor, 'CUSTOM');
    const row = it.row;
    const places = await this.menuUses(row);
    if (places.length) throw this.pageInMenu(places);
    if (to === 'HIDDEN' && row.status !== 'LIVE') {
      return { item: this.itemView(it, await this.names([row.draftUpdatedById])) };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.siteContent.update({
        where: { id: row.id },
        data:
          to === 'ARCHIVED'
            ? { status: 'ARCHIVED', slug: null, previousSlugs: [], draftVersion: { increment: 1 } }
            : { status: 'HIDDEN', draftVersion: { increment: 1 } },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: to === 'ARCHIVED' ? 'site.page.archive' : 'site.page.unpublish',
          entityType: 'SiteContent',
          entityId: row.id,
          before: { status: row.status, slug: row.slug },
          after: { status: to },
          ...client,
        },
        tx,
      );
    });
    if (row.status === 'LIVE' && row.slug) {
      const tags = [SITE_PAGES_TAG, `custom:${row.slug}`, ...row.previousSlugs.map((s) => `custom:${s}`)];
      await this.cache.invalidate(`${to === 'ARCHIVED' ? 'archive' : 'unpublish'} ${row.slug}`, tags);
    }
    if (to === 'ARCHIVED') {
      return { item: { ...this.itemView(it, new Map()), status: 'ARCHIVED' as const, slug: null, path: null } };
    }
    const updated = await this.item(key);
    return { item: this.itemView(updated, await this.names([updated.row?.draftUpdatedById])) };
  }
}
