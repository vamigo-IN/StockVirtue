'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/portal/format';
import type { ArticleDetail } from '@/portal/types';

/**
 * The story as readers will see it, from the server-rendered HTML (the only
 * HTML that is ever served), not from the editor's own rendering.
 */
export function PreviewDialog({
  article,
  open,
  onOpenChange,
}: {
  article: ArticleDetail | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            How the article will look to readers.
          </DialogDescription>
        </DialogHeader>
        {!article ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <article className="px-1 py-2 sm:px-4">
            {article.retractedAt && (
              <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <strong>Retracted.</strong> {article.retractionNote}
              </div>
            )}
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">
              {article.category?.name ?? 'News'}
              {article.isBreaking && (
                <span className="ml-2 text-destructive">Breaking</span>
              )}
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight font-semibold sm:text-4xl">
              {article.title}
            </h1>
            {article.subtitle && (
              <p className="mt-3 text-lg text-muted-foreground">
                {article.subtitle}
              </p>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              {article.author?.name ?? 'StockVirtue Desk'} ·{' '}
              {article.publishedAt
                ? formatDateTime(article.publishedAt)
                : 'Not published yet'}{' '}
              · {article.readingMinutes} min read
              {article.isAiGenerated && ' · Written with AI assistance'}
            </p>
            {article.featuredImage?.url && (
              <figure className="mt-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.featuredImage.url}
                  alt={article.featuredImage.alt}
                  className="w-full rounded-xl"
                />
                {article.featuredImageCaption && (
                  <figcaption className="mt-2 text-sm text-muted-foreground">
                    {article.featuredImageCaption}
                  </figcaption>
                )}
              </figure>
            )}
            {article.summary && (
              <p className="mt-6 border-l-4 border-primary pl-4 text-base font-medium">
                {article.summary}
              </p>
            )}
            <div
              className="sv-prose prose prose-neutral dark:prose-invert mt-6 max-w-none"
              // Server-rendered from the validated document only.
              dangerouslySetInnerHTML={{ __html: article.contentHtml }}
            />
            {article.correctionNote && (
              <div className="mt-8 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
                <p className="font-semibold">Corrections</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {article.correctionNote}
                </p>
              </div>
            )}
            {article.sourceAttribution.length > 0 && (
              <p className="mt-6 text-sm text-muted-foreground">
                Sources:{' '}
                {article.sourceAttribution.map((s, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="underline"
                      >
                        {s.name}
                      </a>
                    ) : (
                      s.name
                    )}
                  </span>
                ))}
              </p>
            )}
            {article.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {article.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs"
                  >
                    #{t.name}
                  </span>
                ))}
              </div>
            )}
          </article>
        )}
      </DialogContent>
    </Dialog>
  );
}
