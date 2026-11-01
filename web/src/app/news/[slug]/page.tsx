import { AlertTriangle, Bot, PenLine } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArticleCard, Kicker } from '@/components/news/ArticleCard';
import {
  AppPromo,
  Breadcrumbs,
  Container,
  SectionHeader,
} from '@/components/news/blocks';
import { NewsImg } from '@/components/news/NewsImg';
import { ShareBar } from '@/components/news/ShareBar';
import { ViewBeacon } from '@/components/news/ViewBeacon';
import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getArticle, getListing } from '@/news/api';
import { fullTime, initials, wasUpdated } from '@/news/format';
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

export default async function ArticlePage({ params }: Props) {
  const a = await getArticle((await params).slug);
  if (!a) notFound();
  const [more, settings] = await Promise.all([
    a.category
      ? getListing({ category: a.category.slug, limit: 6 })
      : Promise.resolve(null),
    getSettings(),
  ]);
  const relatedIds = new Set(a.related.map((r) => r.id));
  const moreItems = (more?.items ?? [])
    .filter((c) => c.id !== a.id && !relatedIds.has(c.id))
    .slice(0, 4);

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
          newsArticleJsonLd(a),
          breadcrumbJsonLd([
            ...trail,
            { name: a.title, path: newsPath.article(a.slug) },
          ]),
        ]}
      />
      <ViewBeacon id={a.id} />
      <article>
        <Container className="pt-6 sm:pt-10">
          <div className="mx-auto max-w-3xl">
            <Breadcrumbs
              items={trail.map((t) => ({ name: t.name, href: t.path }))}
            />
            {a.retractedAt && <Retraction article={a} />}
            <Kicker card={a} className="mt-6" />
            <h1 className="mt-3 text-[2rem] leading-[1.1] font-bold text-balance sm:text-5xl">
              {a.title}
            </h1>
            {a.subtitle && (
              <p className="mt-4 font-serif text-xl leading-relaxed text-muted-foreground sm:text-2xl">
                {a.subtitle}
              </p>
            )}
            <Byline article={a} />
            {a.isAiGenerated && (
              <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Bot className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                AI tools helped prepare this story. It was approved for
                publication by the StockVirtue newsroom.
              </p>
            )}
          </div>
        </Container>

        {a.image && (
          <figure className="mx-auto mt-8 max-w-5xl sm:px-6">
            <div className="aspect-[16/9] overflow-hidden bg-muted sm:rounded-xl">
              <NewsImg
                image={a.image}
                sizes="(min-width: 1024px) 1024px, 100vw"
                priority
                className="size-full object-cover"
              />
            </div>
            {(a.imageCaption || a.image.credit) && (
              <figcaption className="mx-auto mt-2 max-w-3xl px-4 text-sm text-muted-foreground sm:px-0">
                {a.imageCaption}
                {a.image.credit && (
                  <span className="opacity-75">
                    {a.imageCaption ? ' ' : ''}
                    {a.image.credit}
                  </span>
                )}
              </figcaption>
            )}
          </figure>
        )}

        <Container>
          <div className="mx-auto max-w-3xl">
            {/* Built and sanitised by the API from the stored story. */}
            <div
              className="sv-prose prose prose-neutral mt-8 max-w-none"
              dangerouslySetInnerHTML={{ __html: a.contentHtml }}
            />

            {a.correctionNote && (
              <aside className="mt-10 rounded-lg border border-border bg-paper p-4">
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <PenLine className="size-4" aria-hidden="true" /> Correction
                </h2>
                <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
                  {a.correctionNote}
                </p>
              </aside>
            )}

            {a.sources.length > 0 && (
              <section className="mt-10" aria-labelledby="sources">
                <h2 id="sources" className="text-sm font-bold">
                  Sources
                </h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {a.sources.map((s) => (
                    <li key={`${s.name}-${s.url ?? ''}`}>
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-primary underline-offset-2 hover:underline"
                        >
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                      {s.note && <span> · {s.note}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(a.stocks.length > 0 || a.tags.length > 0) && (
              <div className="mt-8 flex flex-wrap gap-2">
                {a.stocks.map((s) => (
                  <Link
                    key={`${s.exchange}:${s.symbol}`}
                    href={newsPath.stock(s.symbol)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/70"
                    title={s.name ?? undefined}
                  >
                    <span className="font-mono text-xs">{s.symbol}</span>
                    {s.name && (
                      <span className="hidden sm:inline">{s.name}</span>
                    )}
                  </Link>
                ))}
                {a.tags.map((t) => (
                  <Link
                    key={t.slug}
                    href={newsPath.tag(t.slug)}
                    className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    #{t.name}
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-8 border-t border-border pt-6">
              <ShareBar url={url} title={a.title} />
            </div>

            {a.author && (a.author.bio || a.author.avatarUrl) && (
              <AuthorBox article={a} />
            )}
          </div>
        </Container>
      </article>

      {a.related.length > 0 && (
        <section aria-labelledby="related" className="mt-14">
          <Container>
            <SectionHeader id="related" title="Related stories" />
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {a.related.map((c) => (
                <ArticleCard key={c.id} card={c} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {a.category && moreItems.length > 0 && (
        <section aria-labelledby="more" className="mt-14">
          <Container>
            <SectionHeader
              id="more"
              title={`More in ${a.category.name}`}
              href={newsPath.category(a.category.slug)}
            />
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {moreItems.map((c) => (
                <ArticleCard key={c.id} card={c} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <Container className="mt-14">
        <AppPromo playUrl={settings.playStoreUrl || SITE.playUrl} />
      </Container>
    </>
  );
}

function Avatar({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size: number;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-foreground"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  );
}

function Byline({ article: a }: { article: NewsArticle }) {
  const published = a.firstPublishedAt ?? a.publishedAt;
  return (
    <div className="mt-6 flex items-center gap-3 border-y border-border py-4">
      {a.author && (
        <Avatar name={a.author.name} url={a.author.avatarUrl} size={40} />
      )}
      <div className="min-w-0 text-sm">
        {a.author && (
          <p className="font-semibold">
            By{' '}
            <Link
              href={newsPath.author(a.author.slug)}
              className="hover:text-primary hover:underline"
            >
              {a.author.name}
            </Link>
          </p>
        )}
        <p className="text-muted-foreground">
          <time dateTime={published}>{fullTime(published)}</time>
          {wasUpdated(published, a.updatedAt) && (
            <>
              {' · Updated '}
              <time dateTime={a.updatedAt}>{fullTime(a.updatedAt)}</time>
            </>
          )}
          {' · '}
          {a.readingMinutes} min read
        </p>
      </div>
    </div>
  );
}

function Retraction({ article: a }: { article: NewsArticle }) {
  return (
    <div
      role="note"
      className="mt-6 flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <AlertTriangle
        className="mt-0.5 size-5 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <div>
        <p className="font-bold text-destructive">
          This story has been retracted
          {a.retractedAt && <> on {fullTime(a.retractedAt)}</>}.
        </p>
        {a.retractionNote && (
          <p className="mt-1 text-foreground/80">{a.retractionNote}</p>
        )}
      </div>
    </div>
  );
}

function AuthorBox({ article: a }: { article: NewsArticle }) {
  const author = a.author!;
  return (
    <aside className="mt-8 flex gap-4 rounded-xl bg-paper p-5">
      <Avatar name={author.name} url={author.avatarUrl} size={56} />
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          About the author
        </p>
        <p className="mt-1 font-display text-lg font-bold">
          <Link
            href={newsPath.author(author.slug)}
            className="hover:text-primary hover:underline"
          >
            {author.name}
          </Link>
        </p>
        {author.bio && (
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {author.bio}
          </p>
        )}
      </div>
    </aside>
  );
}
