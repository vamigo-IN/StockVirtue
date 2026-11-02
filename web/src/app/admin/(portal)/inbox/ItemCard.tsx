'use client';

import {
  Bot,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import Link from 'next/link';
import {
  ITEM_STATUS,
  sourceTypeLabel,
  TOPIC_LABELS,
} from '@/components/newswire/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ARTICLE_STATUS_LABELS,
  formatDateTime,
  timeAgo,
} from '@/portal/format';
import type { SourceItem } from '@/portal/types';

const VIA = { name: 'by name', symbol: 'by ticker', alias: 'by alias' };

/** One incoming item, with what the pipeline found and what a person can do. */
export function ItemCard({
  item,
  canTriage,
  canAiDraft,
  busy,
  onStart,
  onAiDraft,
  onPreview,
  onDismiss,
  onRestore,
}: {
  item: SourceItem;
  canTriage: boolean;
  /** The assistant is on and this person may use it. */
  canAiDraft: boolean;
  busy: boolean;
  onStart: () => void;
  onAiDraft: () => void;
  onPreview: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const when = item.publishedAt ?? item.fetchedAt;
  const draft = item.aiDraft;
  const drafting =
    draft && (draft.status === 'QUEUED' || draft.status === 'RUNNING');
  const draftReady = draft?.status === 'SUCCEEDED';
  const aiAllowed = item.allowAiDrafts && item.usage !== 'HEADLINE_ONLY';
  const open = item.status === 'NEW' || item.status === 'DUPLICATE';
  const possible =
    item.status === 'NEW' && (item.duplicateOf || item.duplicateOfArticle);

  return (
    <article
      className={cn(
        'rounded-xl border bg-card p-4 sm:p-5',
        item.status === 'DUPLICATE' || item.status === 'DISMISSED'
          ? 'opacity-80'
          : '',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{item.source.name}</span>
        <span>· {sourceTypeLabel(item.source.type)}</span>
        <span title={formatDateTime(when)}>
          ·{' '}
          {item.publishedAt
            ? timeAgo(item.publishedAt)
            : `fetched ${timeAgo(item.fetchedAt)}`}
        </span>
        {item.hasFullText && (
          <Badge variant="outline" className="font-normal">
            Full text
          </Badge>
        )}
        {item.status !== 'NEW' && (
          <Badge variant="outline" className="ml-auto">
            {ITEM_STATUS[item.status]}
          </Badge>
        )}
      </div>

      <h3 className="mt-1.5 text-base leading-snug font-semibold">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {item.title}
            <ExternalLink className="ml-1 inline size-3.5 align-baseline text-muted-foreground" />
          </a>
        ) : (
          item.title
        )}
      </h3>
      {item.summary && (
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
          {item.summary}
        </p>
      )}

      {(item.stocks.length > 0 ||
        item.topics.length > 0 ||
        item.suggestedCategory) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.stocks.map((s) => (
            <Badge
              key={s.symbol}
              variant="secondary"
              title={`${s.name} (matched ${VIA[s.via]})`}
            >
              {s.symbol}
            </Badge>
          ))}
          {item.topics.map((t) => (
            <Badge key={t} variant="outline">
              {TOPIC_LABELS[t] ?? t}
            </Badge>
          ))}
          {item.suggestedCategory && (
            <Badge
              variant="outline"
              className="border-dashed"
              title="Suggested category"
            >
              → {item.suggestedCategory.name}
            </Badge>
          )}
        </div>
      )}

      {(item.status === 'DUPLICATE' || possible) && (
        <p
          className={cn(
            'mt-3 flex items-start gap-1.5 text-sm',
            item.status === 'DUPLICATE'
              ? 'text-muted-foreground'
              : 'text-warning',
          )}
        >
          <Copy className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {item.status === 'DUPLICATE'
              ? 'Same story as '
              : 'Possibly the same story as '}
            {item.duplicateOfArticle ? (
              <>
                our story{' '}
                <Link
                  href={`/admin/articles/${item.duplicateOfArticle.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  “{item.duplicateOfArticle.title}”
                </Link>{' '}
                (
                {ARTICLE_STATUS_LABELS[item.duplicateOfArticle.status] ??
                  item.duplicateOfArticle.status}
                )
              </>
            ) : item.duplicateOf ? (
              <>
                “{item.duplicateOf.title}” from {item.duplicateOf.source}
              </>
            ) : null}
            {item.duplicateScore != null && item.duplicateScore < 1 && (
              <span className="text-muted-foreground">
                {' '}
                · {Math.round(item.duplicateScore * 100)}% alike
              </span>
            )}
          </span>
        </p>
      )}

      {item.article && (
        <p className="mt-3 flex items-center gap-1.5 text-sm">
          <FileText className="size-3.5 text-muted-foreground" />
          Story
          {item.handledBy
            ? ` started by ${item.handledBy.displayName}`
            : ''}:{' '}
          <Link
            href={`/admin/articles/${item.article.id}`}
            className="font-medium hover:underline"
          >
            {item.article.title}
          </Link>
          <span className="text-muted-foreground">
            ({ARTICLE_STATUS_LABELS[item.article.status] ?? item.article.status}
            )
          </span>
        </p>
      )}
      {item.status === 'DISMISSED' && item.handledBy && (
        <p className="mt-3 text-xs text-muted-foreground">
          Dismissed by {item.handledBy.displayName} {timeAgo(item.handledAt)}
        </p>
      )}

      {draft && open && (
        <p
          className={cn(
            'mt-3 flex items-center gap-1.5 text-sm',
            draft.status === 'FAILED'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {drafting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Bot className="size-3.5" />
          )}
          {drafting && 'The AI is drafting this story…'}
          {draftReady && (
            <>
              An AI draft is ready.{' '}
              <button
                type="button"
                onClick={onPreview}
                className="font-medium text-primary hover:underline"
              >
                Read it
              </button>
            </>
          )}
          {draft.status === 'FAILED' &&
            `The AI draft failed: ${draft.error ?? 'unknown error'}`}
        </p>
      )}

      {canTriage && (
        <div className="mt-4 flex flex-wrap gap-2">
          {open && (
            <Button size="sm" onClick={onStart} disabled={busy}>
              <FileText /> Start a story
            </Button>
          )}
          {open && draftReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPreview}
              disabled={busy}
            >
              <Bot /> Use the AI draft
            </Button>
          )}
          {open && canAiDraft && aiAllowed && !drafting && !draftReady && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAiDraft}
              disabled={busy}
            >
              <Sparkles />{' '}
              {draft?.status === 'FAILED'
                ? 'Try the AI draft again'
                : 'Draft with AI'}
            </Button>
          )}
          {open && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
              disabled={busy}
            >
              <X /> Dismiss
            </Button>
          )}
          {item.status === 'DISMISSED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRestore}
              disabled={busy}
            >
              <RotateCcw /> Restore
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
