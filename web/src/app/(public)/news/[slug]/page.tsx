import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { ArticleBody } from '@/components/news/ArticleBody';
import { NewsImg } from '@/components/news/NewsImg';
import { ShareBar } from '@/components/news/ShareBar';
import { AuthorBox } from '@/components/news/story/AuthorBox';
import { RelatedStories } from '@/components/news/story/RelatedStories';
import { Sources } from '@/components/news/story/Sources';
import { StoryHeader } from '@/components/news/story/StoryHeader';
import { categoryModule, StoryRail } from '@/components/news/story/StoryRail';
import s from '@/components/news/story/story.module.css';
import { Tags } from '@/components/news/story/Tags';
import { TryItPanel } from '@/components/news/story/TryItPanel';
import { ViewBeacon } from '@/components/news/ViewBeacon';
import { Container } from '@/components/public/Container';
import { playStoreUrl } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { getIpos, getSnapshot } from '@/market/server';
import { getArticle, getListing, getTrending } from '@/news/api';
import { newsPath } from '@/news/routes';
import {
  absolute,
  articleMetadata,
  breadcrumbJsonLd,
  JsonLdScript,
  newsArticleJsonLd,
} from '@/news/seo';
import type { NewsArticle } from '@/news/types';

export const revalidate = 30;

/** Stories are rendered on first visit, then cached and refreshed (ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticle((await params).slug);
  return article
    ? articleMetadata(article)
    : { title: 'Story not found', robots: { index: false } };
}

/** The hero's `sizes`: c2–10 at 1280 px (916 px), c1–9 from 1024, full width below. */
const HERO_SIZES = '(min-width:1280px) 916px, (min-width:1024px) 71vw, 100vw';

/**
 * A story (spec §5.12). One `<article>` holds the story grid (12 / 8 / 4
 * columns, named rows head · hero · body · share · end), in this DOM order,
 * which is also the phone's reading order:
 *   head (StoryHeader) · hero · body (ArticleBody) · the ONE ShareBar ·
 *   end (Sources, Tags, AuthorBox) · the rail (lead stock card, category
 *   module, Most read) · the app panel ("From StockVirtue"; none on a
 *   retracted story).
 * From 768 px the rail sits beside the body and end; from 1280 the ShareBar
 * is the sticky icon column in c1. After the grid: Related stories and
 * More in {category}.
 *
 * Server fetches: the story, the category listing, the settings, the market
 * snapshot (no broker call), Most read and, for IPO stories, the IPO board.
 * No quote or chart is fetched on the server (spec §7.6, §7.12): the strip
 * and the lead card ask in the browser.
 */
export default async function ArticlePage({ params }: Props) {
  const a = await getArticle((await params).slug);
  if (!a) notFound();
  const [more, settings, snapshot, trending, ipos] = await Promise.all([
    a.category
      ? getListing({ category: a.category.slug, limit: 6 })
      : Promise.resolve(null),
    getSettings(),
    getSnapshot(),
    getTrending(6),
    categoryModule(a, null) === 'ipo' ? getIpos() : Promise.resolve(null),
  ]);
  const relatedIds = new Set(a.related.map((r) => r.id));
  const moreItems = (more?.items ?? [])
    .filter((c) => c.id !== a.id && !relatedIds.has(c.id))
    .slice(0, 4);
  const mostRead = trending.filter((c) => c.id !== a.id).slice(0, 5);

  const url = absolute(newsPath.article(a.slug));
  const trail = [
    { name: 'News', path: newsPath.home() },
    ...(a.category?.parent
      ? [
          {
            name: a.category.parent.name,
            path: newsPath.category(a.category.parent.slug),
          },
        ]
      : []),
    ...(a.category
      ? [{ name: a.category.name, path: newsPath.category(a.category.slug) }]
      : []),
  ];

  return (
    <>
      <JsonLdScript
        data={[
          newsArticleJsonLd(a, {
            logoUrl: settings.config.branding.logo?.url,
          }),
          breadcrumbJsonLd([
            ...trail,
            { name: a.title, path: newsPath.article(a.slug) },
          ]),
        ]}
      />
      <ViewBeacon id={a.id} />
      {/* The white reading band on the mint ground (Emerald Terminal), with
          the 40 px band corners at its foot; the related stories follow on
          the mint. */}
      <div className={s.reading}>
      <Container>
        <article className={s.grid}>
          <StoryHeader
            className={s.head}
            article={a}
            trail={trail.map((t) => ({ name: t.name, href: t.path }))}
            snapshot={snapshot}
          />
          {a.image ? <StoryHero article={a} className={s.hero} /> : null}
          <ArticleBody className={s.body} blocks={a.blocks} html={a.contentHtml} />
          <ShareBar url={url} title={a.title} />
          <div className={s.end}>
            <Sources sources={a.sources} />
            <Tags tags={a.tags} className={a.sources.length ? 'mt-5' : undefined} />
            {a.author && (a.author.bio || a.author.avatarUrl) ? (
              <AuthorBox author={a.author} className="mt-8" />
            ) : null}
          </div>
          <StoryRail
            className={s.rail}
            article={a}
            snapshot={snapshot}
            ipos={ipos}
            mostRead={mostRead}
          />
          {a.retractedAt ? null : (
            <TryItPanel playUrl={playStoreUrl(settings)} className={s.panel} />
          )}
        </article>
      </Container>
      </div>
      <RelatedStories
        related={a.related}
        more={moreItems}
        category={a.category}
        className="mt-[var(--sv-section-site)]"
      />
      <div className="h-[var(--sv-section-site)]" aria-hidden="true" />
    </>
  );
}

/**
 * The hero (spec §5.12): the LCP image, `priority`. 3:2, or the picture's
 * own ratio when it is wider (taller pictures are cropped to 3:2); radius
 * 4; full bleed at 16:9 on phones. The caption and credit under it, in
 * `meta`, across c2–8.
 */
function StoryHero({ article: a, className }: { article: NewsArticle; className?: string }) {
  const img = a.image;
  if (!img) return null;
  const ratio = img.width && img.height ? Math.max(img.width / img.height, 1.5) : 1.5;
  return (
    <figure className={className}>
      <div
        className={s.heroMedia}
        style={{ '--sv-hero-ratio': ratio.toFixed(4) } as CSSProperties}
      >
        <NewsImg image={img} sizes={HERO_SIZES} priority className="size-full object-cover" />
      </div>
      {a.imageCaption || img.credit ? (
        <figcaption className={cn('t-meta text-fg-2', s.heroCaption)}>
          {a.imageCaption}
          {img.credit ? (
            <span className="text-fg-3">
              {a.imageCaption ? ' ' : ''}
              {img.credit}
            </span>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
