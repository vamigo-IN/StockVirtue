'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  CircleSlash,
  Eye,
  History,
  Loader2,
  Lock,
  MessageSquareWarning,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArticleEditor } from '@/components/editor/ArticleEditor';
import { ArticleStatusBadge } from '@/components/portal/ArticleStatusBadge';
import { QueryError, RowsSkeleton } from '@/components/portal/common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, ApiError, errorMessage } from '@/portal/api';
import { formatDateTime } from '@/portal/format';
import {
  invalidateArticles,
  pendingSaves,
  qk,
  useArticle,
} from '@/portal/queries';
import type { ArticleDetail, SaveResult } from '@/portal/types';
import { CollabPanel } from './CollabPanel';
import { DetailsPanel } from './DetailsPanel';
import { type Draft, type DraftKey, SEO_KEYS, toBody, toDraft } from './draft';
import { PreviewDialog } from './PreviewDialog';
import { SeoPanel } from './SeoPanel';
import { WorkflowActions } from './WorkflowActions';

/// Pause after typing before a background save.
const AUTOSAVE_MS = 2_500;

type SaveState =
  | { kind: 'saved'; at: string }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' };

function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  switch (state.kind) {
    case 'saved':
      return (
        <span
          className="flex items-center gap-1 text-xs text-muted-foreground"
          title={formatDateTime(state.at)}
        >
          <Check className="size-3.5 text-success" /> Saved
        </span>
      );
    case 'dirty':
      return (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      );
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Saving…
        </span>
      );
    case 'error':
      return (
        <button
          type="button"
          onClick={onRetry}
          title={state.message}
          className="flex items-center gap-1 text-xs text-destructive hover:underline"
        >
          <AlertCircle className="size-3.5" /> Couldn&apos;t save. Retry
        </button>
      );
    case 'conflict':
      return (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3.5" /> Changed elsewhere
        </span>
      );
  }
}

function lockReason(a: ArticleDetail): string {
  switch (a.status) {
    case 'IN_REVIEW':
      return a.can.withdraw
        ? 'This story is with the editors. Withdraw it from review to make changes.'
        : 'This story is in review.';
    case 'APPROVED':
    case 'SCHEDULED':
      return 'This story has been approved. Only editors can change it now.';
    case 'PUBLISHED':
      return 'This story is live. Editors can update it or publish a correction.';
    case 'REJECTED':
    case 'CANCELLED':
    case 'ARCHIVED':
      return 'Reopen this story as a draft to edit it.';
    default:
      return 'You can read this story but not edit it.';
  }
}

export function ArticleWorkspace({ id }: { id: string }) {
  const query = useArticle(id);
  const [epoch, setEpoch] = useState(0);
  if (query.error)
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  // Only a copy fetched for this visit: an older cached one may predate saves.
  if (!query.data || !query.isFetchedAfterMount)
    return <RowsSkeleton rows={6} />;
  return (
    <Workspace
      key={`${query.data.id}:${epoch}`}
      initial={query.data}
      onReload={async () => {
        await query.refetch();
        setEpoch((e) => e + 1);
      }}
    />
  );
}

function Workspace({
  initial,
  onReload,
}: {
  initial: ArticleDetail;
  onReload: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [article, setArticle] = useState(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const draftRef = useRef(draft);
  const versionRef = useRef(initial.version);
  const dirty = useRef(new Set<DraftKey>());
  const timer = useRef<number | undefined>(undefined);
  const inflight = useRef<Promise<void> | null>(null);
  const [save, setSave] = useState<SaveState>({
    kind: 'saved',
    at: initial.updatedAt,
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    open: boolean;
    article: ArticleDetail | null;
  }>({
    open: false,
    article: null,
  });

  const can = article.can;
  const conflict = save.kind === 'conflict';
  const editable = can.edit && !conflict;
  const seoEditable = can.editSeo && !conflict;

  const persist = useCallback(
    async (autosave: boolean) => {
      if (inflight.current) await inflight.current.catch(() => undefined);
      const keys = [...dirty.current];
      if (keys.length === 0) return;
      dirty.current.clear();
      setSave({ kind: 'saving' });
      const run = api<SaveResult>(`staff/articles/${initial.id}`, {
        method: 'PATCH',
        body: {
          version: versionRef.current,
          autosave,
          ...toBody(draftRef.current, keys),
        },
      })
        .then((res) => {
          versionRef.current = res.version;
          setArticle((a) => ({
            ...a,
            version: res.version,
            slug: res.slug,
            readingMinutes: res.readingMinutes,
            updatedAt: res.updatedAt,
          }));
          setSave(
            dirty.current.size
              ? { kind: 'dirty' }
              : { kind: 'saved', at: res.updatedAt },
          );
        })
        .catch((err: unknown) => {
          keys.forEach((k) => dirty.current.add(k));
          if (err instanceof ApiError && err.status === 409)
            setSave({ kind: 'conflict' });
          else setSave({ kind: 'error', message: errorMessage(err) });
          throw err;
        })
        .finally(() => {
          inflight.current = null;
        });
      inflight.current = run;
      await run;
    },
    [initial.id],
  );

  const change = useCallback(
    <K extends DraftKey>(key: K, value: Draft[K]) => {
      draftRef.current = { ...draftRef.current, [key]: value };
      setDraft(draftRef.current);
      dirty.current.add(key);
      setSave((s) => (s.kind === 'conflict' ? s : { kind: 'dirty' }));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void persist(true).catch(() => undefined);
      }, AUTOSAVE_MS);
    },
    [persist],
  );

  // Don't lose work: warn before leaving, and flush when the page unmounts.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || inflight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.clearTimeout(timer.current);
      if (dirty.current.size) {
        const flush = persist(true)
          .catch(() => undefined)
          .finally(() => pendingSaves.delete(initial.id));
        pendingSaves.set(initial.id, flush);
      }
    };
  }, [persist, initial.id]);

  const applyArticle = useCallback(
    (next: ArticleDetail) => {
      versionRef.current = next.version;
      setArticle(next);
      qc.setQueryData(qk.article(next.id), next);
    },
    [qc],
  );

  const act = useCallback(
    async (
      path: string,
      extra: Record<string, unknown> = {},
      success?: string,
    ) => {
      window.clearTimeout(timer.current);
      setBusy(true);
      try {
        if (dirty.current.size) await persist(false);
        const next = await api<ArticleDetail>(
          `staff/articles/${initial.id}/${path}`,
          {
            method: 'POST',
            body: { version: versionRef.current, ...extra },
          },
        );
        applyArticle(next);
        invalidateArticles(qc);
        setSave({ kind: 'saved', at: next.updatedAt });
        if (success) toast.success(success);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409)
          setSave({ kind: 'conflict' });
        toast.error(errorMessage(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyArticle, initial.id, persist, qc],
  );

  async function saveNow() {
    window.clearTimeout(timer.current);
    try {
      await persist(false);
      toast.success('Saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function openPreview() {
    setPreview({ open: true, article: null });
    try {
      if (dirty.current.size) await persist(false);
      const fresh = await api<ArticleDetail>(`staff/articles/${initial.id}`);
      setPreview({ open: true, article: fresh });
    } catch (err) {
      toast.error(errorMessage(err));
      setPreview({ open: false, article: null });
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`staff/articles/${initial.id}`, {
        method: 'DELETE',
        query: { version: versionRef.current },
      });
      dirty.current.clear();
      invalidateArticles(qc);
      toast.success('Draft deleted.');
      router.push('/admin/articles');
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  const lastReview = article.reviews[0];
  const showSeoTab = can.editSeo || can.edit || article.can.read;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/admin/articles">
            <ArrowLeft /> Articles
          </Link>
        </Button>
        <ArticleStatusBadge status={article.status} />
        {article.isBreaking && <Badge variant="destructive">Breaking</Badge>}
        {article.isFeatured && <Badge variant="secondary">Featured</Badge>}
        <SaveIndicator state={save} onRetry={() => void saveNow()} />
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void openPreview()}>
          <Eye /> <span className="hidden sm:inline">Preview</span>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/articles/${article.id}/history`}>
            <History /> <span className="hidden sm:inline">History</span>
          </Link>
        </Button>
        {(can.edit || can.editSeo) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void saveNow()}
            disabled={busy || conflict}
          >
            Save
          </Button>
        )}
        <WorkflowActions
          article={article}
          busy={busy}
          act={act}
          onDelete={remove}
        />
      </div>

      <div className="mb-4 space-y-3">
        {conflict && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>
              Someone else saved this story after you opened it
            </AlertTitle>
            <AlertDescription>
              <p>
                Reload to get their changes. Anything you typed here since your
                last save will be lost.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => void onReload()}
              >
                <RefreshCw /> Reload the latest version
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!can.edit && !conflict && (
          <Alert>
            <Lock />
            <AlertDescription>{lockReason(article)}</AlertDescription>
          </Alert>
        )}
        {(article.status === 'CHANGES_REQUESTED' ||
          article.status === 'REJECTED') &&
          lastReview?.comment && (
            <Alert className="border-warning/40 bg-warning/5">
              <MessageSquareWarning className="text-warning" />
              <AlertTitle>
                {lastReview.reviewer?.displayName ?? 'An editor'}{' '}
                {article.status === 'REJECTED'
                  ? 'rejected this story'
                  : 'asked for changes'}
              </AlertTitle>
              <AlertDescription className="whitespace-pre-line">
                {lastReview.comment}
              </AlertDescription>
            </Alert>
          )}
        {article.status === 'SCHEDULED' && article.scheduledAt && (
          <Alert>
            <CalendarClock />
            <AlertDescription>
              Scheduled to go live {formatDateTime(article.scheduledAt)}.
            </AlertDescription>
          </Alert>
        )}
        {article.retractedAt && (
          <Alert variant="destructive">
            <CircleSlash />
            <AlertTitle>
              Retracted {formatDateTime(article.retractedAt)}
            </AlertTitle>
            <AlertDescription>{article.retractionNote}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <textarea
            value={draft.title}
            onChange={(e) =>
              change('title', e.target.value.replace(/\n/g, ' '))
            }
            placeholder="Headline"
            aria-label="Headline"
            maxLength={200}
            rows={1}
            disabled={!editable}
            className="field-sizing-content w-full resize-none bg-transparent font-display text-3xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/60 disabled:opacity-100 sm:text-4xl"
          />
          <textarea
            value={draft.subtitle}
            onChange={(e) =>
              change('subtitle', e.target.value.replace(/\n/g, ' '))
            }
            placeholder="Standfirst: one line under the headline (optional)"
            aria-label="Standfirst"
            maxLength={300}
            rows={1}
            disabled={!editable}
            className="field-sizing-content w-full resize-none bg-transparent text-lg text-muted-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-100"
          />
          <Textarea
            value={draft.summary}
            onChange={(e) => change('summary', e.target.value)}
            placeholder="Summary: one or two sentences for listings, search results and the app."
            aria-label="Summary"
            maxLength={1000}
            rows={2}
            disabled={!editable}
            className={cn(
              'resize-none bg-card',
              !draft.summary && editable && 'border-dashed',
            )}
          />
          <ArticleEditor
            articleId={article.id}
            initialContent={initial.content}
            editable={editable}
            onChange={(doc) => change('content', doc)}
          />
        </div>
        <aside className="min-w-0">
          <Tabs defaultValue="details">
            <TabsList className="w-full">
              <TabsTrigger value="details">Details</TabsTrigger>
              {showSeoTab && <TabsTrigger value="seo">SEO</TabsTrigger>}
              <TabsTrigger value="team">Team</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="mt-3">
              <DetailsPanel
                article={article}
                draft={draft}
                change={change}
                editable={editable}
                onArticle={applyArticle}
              />
            </TabsContent>
            {showSeoTab && (
              <TabsContent value="seo" className="mt-3">
                <SeoPanel
                  article={article}
                  draft={draft}
                  change={(k, v) =>
                    SEO_KEYS.includes(k) ? change(k, v) : undefined
                  }
                  editable={seoEditable}
                />
              </TabsContent>
            )}
            <TabsContent value="team" className="mt-3">
              <CollabPanel article={article} onArticle={applyArticle} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <PreviewDialog
        article={preview.article}
        open={preview.open}
        onOpenChange={(o) => setPreview((p) => ({ ...p, open: o }))}
      />
    </div>
  );
}
