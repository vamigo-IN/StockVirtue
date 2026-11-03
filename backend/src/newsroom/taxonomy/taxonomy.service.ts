import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { safeHref } from '../content/article-content';
import { NewsCache } from '../public/news-cache';
import { freeSlug, slugify } from '../slug';

type Db = Prisma.TransactionClient | PrismaService;

/** Categories (a tree), tags and public author bylines. */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: NewsCache,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────

  async listCategories() {
    const rows = await this.prisma.newsCategory.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { articles: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      parentId: r.parentId,
      position: r.position,
      isActive: r.isActive,
      keepSeparate: r.keepSeparate,
      articleCount: r._count.articles,
    }));
  }

  async createCategory(
    actor: StaffPrincipal,
    dto: {
      name: string;
      slug?: string;
      description?: string;
      parentId?: string | null;
      position?: number;
      isActive?: boolean;
      keepSeparate?: boolean;
    },
    client: ClientInfo,
  ) {
    const name = dto.name.trim();
    // A slug someone typed must be free as typed; one made from the name
    // may gain a "-2".
    const slug = await this.categorySlug(dto.slug || name, null, !!dto.slug);
    if (dto.parentId) await this.assertCategory(dto.parentId);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.newsCategory.create({
        data: {
          name,
          slug,
          description: dto.description?.trim() ?? '',
          parentId: dto.parentId ?? null,
          position: dto.position ?? 0,
          isActive: dto.isActive ?? true,
          keepSeparate: dto.keepSeparate ?? false,
        },
      });
      await this.log(
        tx,
        actor,
        'news.category.create',
        created.id,
        client,
        undefined,
        {
          name,
          slug,
          keepSeparate: created.keepSeparate,
        },
      );
      return created;
    });
    await this.cache.invalidate('taxonomy');
    return (await this.listCategories()).find((c) => c.id === row.id);
  }

  async updateCategory(
    actor: StaffPrincipal,
    id: string,
    dto: {
      name: string;
      slug?: string;
      description?: string;
      parentId?: string | null;
      position?: number;
      isActive?: boolean;
      keepSeparate?: boolean;
    },
    client: ClientInfo,
  ) {
    const before = await this.assertCategory(id);
    if (dto.parentId) {
      await this.assertCategory(dto.parentId);
      await this.assertNoCycle(id, dto.parentId);
    }
    const slug =
      dto.slug && dto.slug !== before.slug
        ? await this.categorySlug(dto.slug, id, true)
        : before.slug;
    const data = {
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim() ?? before.description,
      parentId: dto.parentId === undefined ? before.parentId : dto.parentId,
      position: dto.position ?? before.position,
      isActive: dto.isActive ?? before.isActive,
      keepSeparate: dto.keepSeparate ?? before.keepSeparate,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.newsCategory.update({ where: { id }, data });
      await this.log(
        tx,
        actor,
        'news.category.update',
        id,
        client,
        {
          name: before.name,
          slug: before.slug,
          parentId: before.parentId,
          isActive: before.isActive,
          keepSeparate: before.keepSeparate,
        },
        data,
      );
    });
    await this.cache.invalidate('taxonomy');
    return (await this.listCategories()).find((c) => c.id === id);
  }

  async deleteCategory(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const before = await this.assertCategory(id);
    const used = await this.prisma.newsArticle.count({
      where: { categoryId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        `${used} article${used === 1 ? ' uses' : 's use'} this category. Move ${used === 1 ? 'it' : 'them'} first, or switch the category off instead.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Sub-categories move up a level rather than disappearing.
      await tx.newsCategory.updateMany({
        where: { parentId: id },
        data: { parentId: before.parentId },
      });
      await tx.newsCategory.delete({ where: { id } });
      await this.log(tx, actor, 'news.category.delete', id, client, {
        name: before.name,
        slug: before.slug,
      });
    });
    await this.cache.invalidate('taxonomy');
  }

  // ── Tags ────────────────────────────────────────────────────────────

  async listTags(q?: string) {
    const term = q?.trim();
    const rows = await this.prisma.newsTag.findMany({
      where: term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { slug: { contains: slugify(term) } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: term ? 20 : 500,
      include: { _count: { select: { articles: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      articleCount: r._count.articles,
    }));
  }

  /** Idempotent: an existing tag with the same slug is returned as is. */
  async createTag(actor: StaffPrincipal, rawName: string, client: ClientInfo) {
    const name = rawName.trim().replace(/\s+/g, ' ');
    const slug = slugify(name, 60);
    if (!slug) {
      throw new BadRequestException('Tags need at least one letter or number.');
    }
    const existing = await this.prisma.newsTag.findUnique({ where: { slug } });
    if (existing)
      return { id: existing.id, slug, name: existing.name, articleCount: 0 };
    const tag = await this.prisma.$transaction(async (tx) => {
      const created = await tx.newsTag.create({ data: { name, slug } });
      await this.log(
        tx,
        actor,
        'news.tag.create',
        created.id,
        client,
        undefined,
        {
          name,
          slug,
        },
      );
      return created;
    });
    return { id: tag.id, slug: tag.slug, name: tag.name, articleCount: 0 };
  }

  async renameTag(
    actor: StaffPrincipal,
    id: string,
    rawName: string,
    client: ClientInfo,
  ) {
    const before = await this.prisma.newsTag.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tag not found.');
    const name = rawName.trim().replace(/\s+/g, ' ');
    const slug = slugify(name, 60);
    if (!slug) {
      throw new BadRequestException('Tags need at least one letter or number.');
    }
    const clash = await this.prisma.newsTag.findFirst({
      where: { slug, id: { not: id } },
    });
    if (clash) {
      throw new ConflictException(
        `A tag called "${clash.name}" already exists.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.newsTag.update({ where: { id }, data: { name, slug } });
      await this.log(
        tx,
        actor,
        'news.tag.update',
        id,
        client,
        {
          name: before.name,
        },
        { name },
      );
    });
    await this.cache.invalidate('taxonomy');
    return (await this.listTags()).find((t) => t.id === id);
  }

  async deleteTag(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const before = await this.prisma.newsTag.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Tag not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.newsTag.delete({ where: { id } }); // detaches it from articles
      await this.log(tx, actor, 'news.tag.delete', id, client, {
        name: before.name,
      });
    });
    await this.cache.invalidate('taxonomy');
  }

  // ── Authors (public bylines) ────────────────────────────────────────

  async listAuthors() {
    const rows = await this.prisma.newsAuthor.findMany({
      orderBy: { name: 'asc' },
      include: {
        staff: { select: { id: true, displayName: true } },
        _count: { select: { articles: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      bio: r.bio,
      avatarUrl: r.avatarUrl,
      socials: r.socials,
      isActive: r.isActive,
      staff: r.staff,
      articleCount: r._count.articles,
    }));
  }

  async saveAuthor(
    actor: StaffPrincipal,
    id: string | null,
    dto: {
      name: string;
      slug?: string;
      bio?: string;
      avatarUrl?: string;
      socials?: { twitter?: string; linkedin?: string; website?: string };
      staffId?: string | null;
      isActive?: boolean;
    },
    client: ClientInfo,
  ) {
    const before = id
      ? await this.prisma.newsAuthor.findUnique({ where: { id } })
      : null;
    if (id && !before) throw new NotFoundException('Byline not found.');
    const name = dto.name.trim();
    const wanted = dto.slug || before?.slug || slugify(name);
    const slug =
      before && wanted === before.slug
        ? before.slug
        : await freeSlug(
            wanted,
            async (s) =>
              !!(await this.prisma.newsAuthor.findFirst({
                where: { slug: s, ...(id ? { id: { not: id } } : {}) },
                select: { id: true },
              })),
            'author',
          );
    if (dto.slug && dto.slug !== slug) {
      throw new ConflictException(
        'Another byline already uses that web address.',
      );
    }
    if (dto.staffId) {
      const taken = await this.prisma.newsAuthor.findFirst({
        where: { staffId: dto.staffId, ...(id ? { id: { not: id } } : {}) },
      });
      if (taken) {
        throw new ConflictException(
          `That staff member already has the byline "${taken.name}".`,
        );
      }
    }
    const socials = Object.fromEntries(
      Object.entries(dto.socials ?? {})
        .map(([k, v]): [string, string | null] => [k, safeHref(v ?? '')])
        .filter(([, v]) => v),
    );
    const data = {
      name,
      slug,
      bio: dto.bio?.trim() ?? before?.bio ?? '',
      avatarUrl:
        dto.avatarUrl !== undefined
          ? (safeHref(dto.avatarUrl) ?? null)
          : (before?.avatarUrl ?? null),
      socials: dto.socials !== undefined ? socials : (before?.socials ?? {}),
      staffId:
        dto.staffId === undefined ? (before?.staffId ?? null) : dto.staffId,
      isActive: dto.isActive ?? before?.isActive ?? true,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = before
        ? await tx.newsAuthor.update({ where: { id: before.id }, data })
        : await tx.newsAuthor.create({ data });
      await this.log(
        tx,
        actor,
        before ? 'news.author.update' : 'news.author.create',
        saved.id,
        client,
        before
          ? { name: before.name, slug: before.slug, staffId: before.staffId }
          : undefined,
        { name, slug, staffId: data.staffId },
      );
      return saved;
    });
    await this.cache.invalidate('taxonomy');
    return (await this.listAuthors()).find((a) => a.id === row.id);
  }

  /**
   * The byline for a staff member's articles, created from their portal name
   * the first time they write.
   */
  async authorForStaff(staffId: string, db: Db = this.prisma) {
    const existing = await db.newsAuthor.findUnique({ where: { staffId } });
    if (existing) return existing;
    const staff = await db.staffProfile.findUniqueOrThrow({
      where: { id: staffId },
    });
    const slug = await freeSlug(
      slugify(staff.displayName),
      async (s) =>
        !!(await db.newsAuthor.findUnique({
          where: { slug: s },
          select: { id: true },
        })),
      'author',
    );
    return db.newsAuthor.create({
      data: { name: staff.displayName, slug, staffId, bio: staff.title ?? '' },
    });
  }

  // ── Internals ───────────────────────────────────────────────────────

  private async assertCategory(id: string) {
    const c = await this.prisma.newsCategory.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found.');
    return c;
  }

  /** Moving a category under one of its own descendants would loop. */
  private async assertNoCycle(id: string, parentId: string) {
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === id) {
        throw new BadRequestException("A category can't sit inside itself.");
      }
      const parent: { parentId: string | null } | null =
        await this.prisma.newsCategory.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
      cursor = parent?.parentId ?? null;
    }
  }

  private async categorySlug(
    wanted: string,
    exceptId: string | null,
    strict = false,
  ) {
    const base = slugify(wanted);
    if (!base)
      throw new BadRequestException('The category needs a web address.');
    const taken = async (s: string) =>
      !!(await this.prisma.newsCategory.findFirst({
        where: { slug: s, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { id: true },
      }));
    if (strict) {
      if (await taken(base)) {
        throw new ConflictException(
          'Another category already uses that web address.',
        );
      }
      return base;
    }
    return freeSlug(base, taken, 'category');
  }

  private log(
    tx: Prisma.TransactionClient,
    actor: StaffPrincipal,
    action: string,
    entityId: string,
    client: ClientInfo,
    before?: Prisma.InputJsonValue,
    after?: Prisma.InputJsonValue,
  ) {
    return this.audit.record(
      {
        actor: { userId: actor.userId, email: actor.email },
        action,
        entityType:
          action.split('.')[1] === 'category'
            ? 'NewsCategory'
            : action.split('.')[1] === 'tag'
              ? 'NewsTag'
              : 'NewsAuthor',
        entityId,
        before,
        after,
        ...client,
      },
      tx,
    );
  }
}
