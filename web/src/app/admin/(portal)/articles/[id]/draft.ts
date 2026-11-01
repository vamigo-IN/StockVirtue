import type {
  ArticleDetail,
  ArticleSeo,
  MediaAsset,
  SourceCredit,
} from '@/portal/types';

/** What the editor page lets people change, in editor-friendly shapes. */
export interface Draft {
  title: string;
  subtitle: string;
  summary: string;
  content: Record<string, unknown>;
  categoryId: string | null;
  tags: { id: string; name: string }[];
  authorId: string | null;
  featuredImage: MediaAsset | null;
  featuredImageCaption: string;
  sectors: string[];
  related: { id: string; title: string; slug: string }[];
  seo: ArticleSeo;
  slug: string;
  sources: SourceCredit[];
  editorialNotes: string;
  isAiGenerated: boolean;
}

export type DraftKey = keyof Draft;

/** Fields that only need SEO rights (news.update_seo), not edit rights. */
export const SEO_KEYS: DraftKey[] = ['seo', 'slug'];

export function toDraft(a: ArticleDetail): Draft {
  return {
    title: a.title,
    subtitle: a.subtitle ?? '',
    summary: a.summary,
    content: a.content,
    categoryId: a.category?.id ?? null,
    tags: a.tags.map((t) => ({ id: t.id, name: t.name })),
    authorId: a.author?.id ?? null,
    featuredImage: a.featuredImage,
    featuredImageCaption: a.featuredImageCaption ?? '',
    sectors: a.sectors,
    related: a.related.map((r) => ({ id: r.id, title: r.title, slug: r.slug })),
    seo: a.seo ?? {},
    slug: a.slug,
    sources: a.sourceAttribution ?? [],
    editorialNotes: a.editorialNotes ?? '',
    isAiGenerated: a.isAiGenerated,
  };
}

/** The PATCH body for the given changed fields. */
export function toBody(d: Draft, keys: DraftKey[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const k of keys) {
    switch (k) {
      case 'tags':
        body.tagIds = d.tags.map((t) => t.id);
        break;
      case 'featuredImage':
        body.featuredImageId = d.featuredImage?.id ?? null;
        break;
      case 'related':
        body.relatedIds = d.related.map((r) => r.id);
        break;
      case 'sources':
        body.sourceAttribution = d.sources
          .filter((s) => s.name.trim())
          .map((s) => ({
            name: s.name.trim(),
            ...(s.url?.trim() ? { url: s.url.trim() } : {}),
            ...(s.note?.trim() ? { note: s.note.trim() } : {}),
          }));
        break;
      case 'seo':
        body.seo = {
          title: d.seo.title ?? '',
          description: d.seo.description ?? '',
          canonicalUrl: d.seo.canonicalUrl ?? '',
          noIndex: !!d.seo.noIndex,
          noFollow: !!d.seo.noFollow,
        };
        break;
      default:
        body[k] = d[k];
    }
  }
  return body;
}
