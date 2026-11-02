'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, Radio, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import {
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import {
  invalidateArticles,
  invalidateIncoming,
  useAiStatus,
  useSourceItems,
  useSources,
} from '@/portal/queries';
import type { ItemStatus, SourceItem } from '@/portal/types';
import { DraftPreviewDialog } from './DraftPreviewDialog';
import { ItemCard } from './ItemCard';
import { ManualItemDialog } from './ManualItemDialog';

const TABS: { value: ItemStatus | 'ALL'; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'DRAFTED', label: 'Started' },
  { value: 'DUPLICATE', label: 'Duplicates' },
  { value: 'DISMISSED', label: 'Dismissed' },
  { value: 'ALL', label: 'All' },
];

/**
 * Incoming news (spec §8, steps 8–11): items from the sources waiting for a
 * person. Starting a story makes an ordinary draft, which goes through
 * review and approval like any other; nothing here is ever published.
 */
export function InboxView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? 'NEW');
  const [sourceId, setSourceId] = useState(params.get('source') ?? 'all');
  const [text, setText] = useState(params.get('q') ?? '');
  const [q, setQ] = useState(text);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const canTriage = can(me, 'news.create');
  const canSubmit = can(me, 'sources.create');
  const ai = useAiStatus(can(me, 'ai.use'));
  const canAiDraft =
    can(me, 'ai.use') &&
    !!ai.data?.ready &&
    !!ai.data.tasks.find((t) => t.task === 'DRAFT_FROM_SOURCE')?.enabled;

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => setPage(1), [status, sourceId, q]);
  // Keep the address in step, so links (and the editors' email) open this view.
  useEffect(() => {
    const sp = new URLSearchParams();
    if (status !== 'NEW') sp.set('status', status);
    if (sourceId !== 'all') sp.set('source', sourceId);
    if (q) sp.set('q', q);
    router.replace(`/admin/inbox${sp.size ? `?${sp.toString()}` : ''}`, {
      scroll: false,
    });
  }, [status, sourceId, q, router]);

  const items = useSourceItems({
    status,
    sourceId: sourceId === 'all' ? undefined : sourceId,
    q: q || undefined,
    page,
  });
  const sources = useSources();
  const manualSources = (sources.data ?? []).filter((s) => s.format === 'NONE');

  // While an AI draft is being written, check back every few seconds.
  const drafting = items.data?.items.some(
    (i) =>
      i.aiDraft &&
      (i.aiDraft.status === 'QUEUED' || i.aiDraft.status === 'RUNNING'),
  );
  const { refetch } = items;
  useEffect(() => {
    if (!drafting) return;
    const t = setInterval(() => void refetch(), 3_000);
    return () => clearInterval(t);
  }, [drafting, refetch]);

  async function run(item: SourceItem, fn: () => Promise<void>) {
    setBusy(item.id);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
      invalidateIncoming(qc);
    } finally {
      setBusy(null);
    }
  }

  const start = (item: SourceItem, aiJobId?: string) =>
    run(item, async () => {
      const res = await api<{ articleId: string }>(
        `staff/source-items/${item.id}/story`,
        {
          method: 'POST',
          body: aiJobId ? { aiJobId } : {},
        },
      );
      invalidateIncoming(qc);
      invalidateArticles(qc);
      toast.success(
        aiJobId
          ? 'Story started from the AI draft. Check every fact before sending it for review.'
          : 'Story started. Write it in your own words, then send it for review.',
      );
      router.push(`/admin/articles/${res.articleId}`);
    });

  const aiDraft = (item: SourceItem) =>
    run(item, async () => {
      await api('staff/ai/jobs', {
        method: 'POST',
        body: { task: 'DRAFT_FROM_SOURCE', sourceItemId: item.id },
      });
      toast.success('The AI is drafting it. It appears here when ready.');
      invalidateIncoming(qc);
    });

  const dismiss = (item: SourceItem) =>
    run(item, async () => {
      await api(`staff/source-items/${item.id}/dismiss`, { method: 'POST' });
      invalidateIncoming(qc);
      toast.success('Dismissed.', {
        action: { label: 'Undo', onClick: () => void restore(item) },
      });
    });

  const restore = (item: SourceItem) =>
    run(item, async () => {
      await api(`staff/source-items/${item.id}/restore`, { method: 'POST' });
      invalidateIncoming(qc);
      toast.success('Restored to New.');
    });

  const counts = items.data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const pages = items.data
    ? Math.ceil(items.data.total / items.data.pageSize)
    : 1;
  const previewItem = items.data?.items.find((i) => i.id === preview);

  return (
    <div>
      <PageHeader
        title="Incoming news"
        description="Items from your news sources, checked for duplicates and matched to listed companies. Start a story to write one up: it is your draft, and goes through review like any story. Nothing here is published."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/sources">
                <Radio /> News sources
              </Link>
            </Button>
            {canSubmit && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add a tip
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList className="h-auto flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {counts && (
                  <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                    {t.value === 'ALL' ? total : counts[t.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid gap-3 sm:grid-cols-[220px_260px]">
          <ChoiceSelect
            id="inbox-source"
            label="Source"
            value={sourceId}
            onChange={setSourceId}
            choices={[
              { value: 'all', label: 'All sources' },
              ...(sources.data ?? []).map((s) => ({
                value: s.id,
                label: s.name,
              })),
            ]}
          />
          <div className="space-y-1.5">
            <label htmlFor="inbox-q" className="text-sm font-medium">
              Search headlines
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="inbox-q"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. repo rate"
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </div>

      {items.error ? (
        <QueryError error={items.error} onRetry={() => void items.refetch()} />
      ) : !items.data ? (
        <RowsSkeleton rows={5} />
      ) : items.data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === 'NEW' && !q ? 'Nothing new' : 'No items here'}
        >
          {sources.data && sources.data.length === 0 ? (
            <>
              No sources yet.{' '}
              <Link href="/admin/sources" className="underline">
                Add a news source
              </Link>{' '}
              and its items will appear here.
            </>
          ) : status === 'NEW' && !q ? (
            'New items appear here as the newsroom worker fetches your sources.'
          ) : (
            'Try another tab, source or search.'
          )}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {items.data.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              canTriage={canTriage}
              canAiDraft={canAiDraft}
              busy={busy === item.id}
              onStart={() => void start(item)}
              onAiDraft={() => void aiDraft(item)}
              onPreview={() => setPreview(item.id)}
              onDismiss={() => void dismiss(item)}
              onRestore={() => void restore(item)}
            />
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-2 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Newer
              </Button>
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
              >
                Older
              </Button>
            </div>
          )}
        </div>
      )}

      <DraftPreviewDialog
        itemId={preview}
        onOpenChange={(o) => !o && setPreview(null)}
        busy={!!busy}
        onUse={(aiJobId) => {
          if (previewItem) void start(previewItem, aiJobId);
        }}
      />
      <ManualItemDialog
        open={adding}
        onOpenChange={setAdding}
        manualSources={manualSources}
        onAdded={() => invalidateIncoming(qc)}
      />
    </div>
  );
}
