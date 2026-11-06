import { createHash } from 'node:crypto';
import { NewsVersionReason, Prisma } from '@prisma/client';

/** Everything a version records: enough to compare and to restore. */
export const SNAPSHOT_SELECT = {
  version: true,
  title: true,
  subtitle: true,
  summary: true,
  slug: true,
  content: true,
  contentText: true,
  categoryId: true,
  authorId: true,
  featuredImageId: true,
  featuredImageCaption: true,
  sectors: true,
  seo: true,
  sourceAttribution: true,
  isAiGenerated: true,
  retractionNote: true,
  tags: { select: { tagId: true } },
  related: { select: { relatedId: true }, orderBy: { position: 'asc' } },
  stocks: {
    select: { exchange: true, symbol: true, isPrimary: true },
    orderBy: [{ isPrimary: 'desc' }, { symbol: 'asc' }],
  },
} satisfies Prisma.NewsArticleSelect;

type SnapshotSource = Prisma.NewsArticleGetPayload<{
  select: typeof SNAPSHOT_SELECT;
}>;

export interface ArticleSnapshot {
  title: string;
  subtitle: string | null;
  summary: string;
  slug: string;
  content: Prisma.JsonValue;
  contentText: string;
  categoryId: string | null;
  authorId: string | null;
  featuredImageId: string | null;
  featuredImageCaption: string | null;
  sectors: string[];
  seo: Prisma.JsonValue;
  sourceAttribution: Prisma.JsonValue;
  isAiGenerated: boolean;
  retractionNote: string | null;
  tagIds: string[];
  relatedIds: string[];
  /** Main company first. Missing in versions saved before stocks existed. */
  stocks?: { exchange: string; symbol: string }[];
  /** Fingerprint of the fields above: identical saves record no new version. */
  hash: string;
}

export function snapshotOf(a: SnapshotSource): ArticleSnapshot {
  const data = {
    title: a.title,
    subtitle: a.subtitle,
    summary: a.summary,
    slug: a.slug,
    content: a.content,
    contentText: a.contentText,
    categoryId: a.categoryId,
    authorId: a.authorId,
    featuredImageId: a.featuredImageId,
    featuredImageCaption: a.featuredImageCaption,
    sectors: a.sectors,
    seo: a.seo,
    sourceAttribution: a.sourceAttribution,
    isAiGenerated: a.isAiGenerated,
    retractionNote: a.retractionNote,
    tagIds: a.tags.map((t) => t.tagId).sort(),
    relatedIds: a.related.map((r) => r.relatedId),
    stocks: a.stocks.map((s) => ({ exchange: s.exchange, symbol: s.symbol })),
  };
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  return { ...data, hash };
}

/**
 * A stored version's snapshot, as the portal gets it. Versions saved before
 * correction notes were retired (6 Nov 2026) still carry `correctionNote`
 * in their JSON: it is never returned, compared or restored.
 */
export function storedSnapshot(raw: Prisma.JsonValue): ArticleSnapshot {
  const snapshot = { ...(raw as object) } as ArticleSnapshot & {
    correctionNote?: unknown;
  };
  delete snapshot.correctionNote;
  return snapshot;
}

/**
 * Records the article as it stands now, inside the caller's transaction and
 * after the caller bumped `version` (versions are numbered by it). Unless
 * forced, a save identical to the latest version records nothing.
 */
export async function recordVersion(
  tx: Prisma.TransactionClient,
  articleId: string,
  reason: NewsVersionReason,
  editorId: string | null,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const article = await tx.newsArticle.findUniqueOrThrow({
    where: { id: articleId },
    select: SNAPSHOT_SELECT,
  });
  const snapshot = snapshotOf(article);
  if (!opts.force) {
    const last = await tx.newsVersion.findFirst({
      where: { articleId },
      orderBy: { version: 'desc' },
      select: { snapshot: true },
    });
    if (
      (last?.snapshot as { hash?: string } | undefined)?.hash === snapshot.hash
    ) {
      return false;
    }
  }
  await tx.newsVersion.create({
    data: {
      articleId,
      version: article.version,
      reason,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      editorId,
    },
  });
  return true;
}
