import { MediaAsset, NewsStatus, Prisma } from '@prisma/client';

/**
 * THE rule for what readers may see. Every public query is built from these
 * helpers: an article is public only when it is PUBLISHED and its publish
 * time has passed. Drafts, stories in review, approved or scheduled ones,
 * and anything unpublished, rejected, spiked or archived can never match.
 */
export function publicWhere(now = new Date()): Prisma.NewsArticleWhereInput {
  return { status: NewsStatus.PUBLISHED, publishedAt: { lte: now } };
}

/**
 * Public and not retracted: what listings, feeds, search, trending and
 * sitemaps show. A retracted story stays readable at its address, with the
 * retraction notice, but is no longer promoted anywhere.
 */
export function listedWhere(now = new Date()): Prisma.NewsArticleWhereInput {
  return { ...publicWhere(now), retractedAt: null };
}

/** A calendar day in India, YYYY-MM-DD. */
export function istDay(at = new Date(), offsetDays = 0): string {
  return new Date(at.getTime() + 330 * 60_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** listedWhere for raw SQL over `news_articles a` (search). Keep in step. */
export const LISTED_SQL = Prisma.sql`a.status = 'PUBLISHED' AND a."publishedAt" <= now() AND a."retractedAt" IS NULL`;

export const CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  subtitle: true,
  summary: true,
  publishedAt: true,
  updatedAt: true,
  readingMinutes: true,
  isBreaking: true,
  isFeatured: true,
  isAiGenerated: true,
  category: { select: { slug: true, name: true, isActive: true } },
  author: {
    select: { slug: true, name: true, avatarUrl: true, isActive: true },
  },
  featuredImage: true,
} satisfies Prisma.NewsArticleSelect;
export type CardRow = Prisma.NewsArticleGetPayload<{
  select: typeof CARD_SELECT;
}>;

export const DETAIL_SELECT = {
  ...CARD_SELECT,
  firstPublishedAt: true,
  content: true,
  categoryId: true,
  contentHtml: true,
  featuredImageCaption: true,
  sectors: true,
  seo: true,
  sourceAttribution: true,
  correctionNote: true,
  retractedAt: true,
  retractionNote: true,
  category: {
    select: {
      slug: true,
      name: true,
      isActive: true,
      parent: { select: { slug: true, name: true, isActive: true } },
    },
  },
  author: {
    select: {
      slug: true,
      name: true,
      avatarUrl: true,
      isActive: true,
      bio: true,
      socials: true,
    },
  },
  tags: { select: { tag: { select: { slug: true, name: true } } } },
  stocks: {
    select: { exchange: true, symbol: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { symbol: 'asc' }],
  },
  related: {
    select: { relatedId: true },
    orderBy: { position: 'asc' },
  },
} satisfies Prisma.NewsArticleSelect;
export type DetailRow = Prisma.NewsArticleGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

export interface PublicImage {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  credit: string | null;
  /** Smaller WebP copies, narrowest first. */
  variants: { url: string; width: number }[];
}

export type ImageOf = (asset: MediaAsset | null) => PublicImage | null;

export interface PublicCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  publishedAt: Date;
  updatedAt: Date;
  readingMinutes: number;
  isBreaking: boolean;
  isFeatured: boolean;
  isAiGenerated: boolean;
  category: { slug: string; name: string } | null;
  author: { slug: string; name: string; avatarUrl: string | null } | null;
  image: PublicImage | null;
}

const SOCIAL_KEYS = [
  'twitter',
  'linkedin',
  'instagram',
  'youtube',
  'facebook',
  'website',
] as const;

/** Only well-formed https links from a byline's social profiles. */
export function publicSocials(raw: Prisma.JsonValue): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of SOCIAL_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(v.trim())) {
      out[key] = v.trim();
    }
  }
  return out;
}

export function toCard(row: CardRow, imageOf: ImageOf): PublicCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    // listedWhere guarantees a publish time.
    publishedAt: row.publishedAt!,
    updatedAt: row.updatedAt,
    readingMinutes: row.readingMinutes,
    isBreaking: row.isBreaking,
    isFeatured: row.isFeatured,
    isAiGenerated: row.isAiGenerated,
    // Hidden categories and retired bylines have no public page to link to.
    category:
      row.category?.isActive === true
        ? { slug: row.category.slug, name: row.category.name }
        : null,
    author:
      row.author?.isActive === true
        ? {
            slug: row.author.slug,
            name: row.author.name,
            avatarUrl: row.author.avatarUrl,
          }
        : null,
    image: imageOf(row.featuredImage),
  };
}

/** Keeps `ids` order; drops anything the query didn't return. */
export function inOrder<T extends { id: string }>(ids: string[], rows: T[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is T => !!r);
}
