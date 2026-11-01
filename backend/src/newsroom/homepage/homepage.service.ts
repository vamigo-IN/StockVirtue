import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { NewsCache } from '../public/news-cache';
import { SLUG_RE } from '../slug';
import {
  DEFAULT_HOMEPAGE,
  DEFAULT_LIMITS,
  HOME_SECTION_TYPES,
  HomeSection,
  HomeSectionType,
  HomepageConfig,
  SINGLE_SECTION_TYPES,
  UpdateHomepageDto,
} from './homepage.dto';

export const HOMEPAGE_KEY = 'news.homepage';

const STALE =
  'Someone else changed the homepage after you opened it. Reload to get their changes, then make yours again.';

const TYPE_LABELS: Record<HomeSectionType, string> = {
  breaking: 'breaking-news',
  featured: 'featured',
  latest: 'top-stories',
  category: 'category',
  trending: 'trending',
  app_promo: 'app promotion',
};

/** Saved JSON → sections the renderer can trust; anything malformed is dropped. */
export function parseHomepage(raw: Prisma.JsonValue): HomepageConfig {
  const list =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { sections?: unknown }).sections
      : null;
  if (!Array.isArray(list)) return DEFAULT_HOMEPAGE;
  const sections: HomeSection[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const type = s.type as HomeSectionType;
    if (
      typeof s.id !== 'string' ||
      !HOME_SECTION_TYPES.includes(type) ||
      typeof s.title !== 'string' ||
      typeof s.enabled !== 'boolean'
    ) {
      continue;
    }
    const section: HomeSection = {
      id: s.id,
      type,
      enabled: s.enabled,
      title: s.title,
    };
    if (
      typeof s.limit === 'number' &&
      Number.isInteger(s.limit) &&
      s.limit >= 1 &&
      s.limit <= 12
    ) {
      section.limit = s.limit;
    }
    if (type === 'category') {
      if (typeof s.categorySlug !== 'string' || !SLUG_RE.test(s.categorySlug))
        continue;
      section.categorySlug = s.categorySlug;
    }
    sections.push(section);
  }
  return { sections };
}

/**
 * The /news homepage layout: which sections show, in what order, with what
 * titles and how many stories. One `site_config` row, versioned, audited and
 * edited by holders of `site.manage` (Super Admin and Admin by default).
 */
@Injectable()
export class HomepageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: NewsCache,
  ) {}

  /** The saved layout, or the default one until someone saves. */
  async current(): Promise<{
    config: HomepageConfig;
    version: number;
    updatedAt: Date | null;
    updatedById: string | null;
  }> {
    const row = await this.prisma.siteConfig.findUnique({
      where: { key: HOMEPAGE_KEY },
    });
    if (!row) {
      return {
        config: DEFAULT_HOMEPAGE,
        version: 0,
        updatedAt: null,
        updatedById: null,
      };
    }
    return {
      config: parseHomepage(row.value),
      version: row.version,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    };
  }

  async forStaff() {
    const cur = await this.current();
    const [categories, updatedBy] = await Promise.all([
      this.prisma.newsCategory.findMany({
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
        select: {
          slug: true,
          name: true,
          isActive: true,
          parent: { select: { slug: true, name: true } },
        },
      }),
      cur.updatedById
        ? this.prisma.staffProfile.findUnique({
            where: { id: cur.updatedById },
            select: { id: true, displayName: true },
          })
        : null,
    ]);
    return {
      sections: cur.config.sections,
      version: cur.version,
      updatedAt: cur.updatedAt,
      updatedBy,
      categories,
      defaultLimits: DEFAULT_LIMITS,
    };
  }

  async update(
    actor: StaffPrincipal,
    dto: UpdateHomepageDto,
    client: ClientInfo,
  ) {
    const sections = this.clean(dto.sections);
    const before = await this.current();
    if (before.version !== dto.version) throw new ConflictException(STALE);
    const value = { sections } as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      if (dto.version === 0) {
        try {
          await tx.siteConfig.create({
            data: {
              key: HOMEPAGE_KEY,
              value,
              version: 1,
              updatedById: actor.staffId,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            throw new ConflictException(STALE);
          }
          throw err;
        }
      } else {
        const res = await tx.siteConfig.updateMany({
          where: { key: HOMEPAGE_KEY, version: dto.version },
          data: {
            value,
            version: { increment: 1 },
            updatedById: actor.staffId,
          },
        });
        if (res.count === 0) throw new ConflictException(STALE);
      }
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'site.homepage.update',
          entityType: 'SiteConfig',
          entityId: HOMEPAGE_KEY,
          before: {
            sections: before.config.sections,
          } as unknown as Prisma.InputJsonValue,
          after: { sections } as unknown as Prisma.InputJsonValue,
          ...client,
        },
        tx,
      );
    });
    await this.cache.invalidate('homepage');
    return this.forStaff();
  }

  /**
   * Rules the form can't express. A category section may name a category
   * that doesn't exist yet: it stays hidden until someone creates it.
   */
  private clean(input: HomeSection[]): HomeSection[] {
    const ids = new Set<string>();
    const singles = new Set<HomeSectionType>();
    const categories = new Set<string>();
    return input.map((s) => {
      if (ids.has(s.id)) {
        throw new BadRequestException(`Two sections share the id "${s.id}".`);
      }
      ids.add(s.id);
      if (SINGLE_SECTION_TYPES.includes(s.type)) {
        if (singles.has(s.type)) {
          throw new BadRequestException(
            `The homepage can have only one ${TYPE_LABELS[s.type]} section.`,
          );
        }
        singles.add(s.type);
      }
      const title = s.title.trim();
      if (!title) {
        throw new BadRequestException(
          `Give the ${TYPE_LABELS[s.type]} section a title.`,
        );
      }
      const section: HomeSection = {
        id: s.id,
        type: s.type,
        enabled: s.enabled,
        title,
      };
      if (s.type === 'category') {
        if (!s.categorySlug) {
          throw new BadRequestException(`Choose a category for "${title}".`);
        }
        if (categories.has(s.categorySlug)) {
          throw new BadRequestException(
            `"${title}" shows a category another section already shows.`,
          );
        }
        categories.add(s.categorySlug);
        section.categorySlug = s.categorySlug;
      }
      if (s.type !== 'app_promo' && s.limit !== undefined) {
        section.limit = s.limit;
      }
      return section;
    });
  }
}
