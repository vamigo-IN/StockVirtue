'use client';

import { useQueryClient } from '@tanstack/react-query';
import { FileText, MessageSquare, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArticleStatusBadge } from '@/components/portal/ArticleStatusBadge';
import {
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import {
  type ArticleFilters,
  invalidateArticles,
  useArticleCounts,
  useArticles,
  useCategories,
} from '@/portal/queries';

const TABS: { value: string; label: string; statuses?: string[] }[] = [
  { value: 'all', label: 'All' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'IN_REVIEW', label: 'In review' },
  { value: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Spiked' },
];

function NewArticleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const categories = useCategories();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (title.trim().length < 3)
      return setError('Give the story a working headline (3+ characters).');
    setBusy(true);
    try {
      const res = await api<{ id: string }>('staff/articles', {
        method: 'POST',
        body: {
          title: title.trim(),
          ...(categoryId !== 'none' ? { categoryId } : {}),
        },
      });
      invalidateArticles(qc);
      router.push(`/admin/articles/${res.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={create} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New article</DialogTitle>
            <DialogDescription>
              Start with a working headline; you can change everything later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-title">Headline</Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Decide later</SelectItem>
                {(categories.data ?? [])
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create and open'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ArticlesView() {
  const me = usePortalMe();
  const readAll = can(me, 'news.read_all');
  const [tab, setTab] = useState('all');
  const [scope, setScope] = useState<'all' | 'mine' | 'assigned'>(
    readAll ? 'all' : 'mine',
  );
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [creating, setCreating] = useState(false);
  const categories = useCategories();
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const filters: ArticleFilters = {
    scope,
    ...(tab !== 'all' ? { status: tab } : {}),
    ...(q ? { q } : {}),
    ...(categoryId !== 'all' ? { categoryId } : {}),
  };
  const list = useArticles(filters);
  const counts = useArticleCounts(scope);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Articles"
        description={
          readAll
            ? 'Every story in the newsroom, from first draft to archive.'
            : 'Your stories and the ones assigned to you.'
        }
        actions={
          can(me, 'news.create') && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New article
            </Button>
          )
        }
      />
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const n =
            t.value === 'all'
              ? counts.data?.total
              : counts.data?.[t.value as keyof typeof counts.data];
          if (t.value !== 'all' && t.value !== 'DRAFT' && !n) return null;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                tab === t.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card hover:bg-accent',
              )}
            >
              {t.label}
              {n !== undefined && (
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    tab === t.value ? 'opacity-80' : 'text-muted-foreground',
                  )}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search headlines"
            className="pl-9"
            aria-label="Search headlines"
          />
        </div>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="sm:w-48" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories.data ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={scope}
          onValueChange={(v) => setScope(v as typeof scope)}
        >
          <SelectTrigger className="sm:w-44" aria-label="Whose articles">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {readAll && <SelectItem value="all">Everyone&apos;s</SelectItem>}
            <SelectItem value="mine">Written by me</SelectItem>
            <SelectItem value="assigned">Assigned to me</SelectItem>
            {!readAll && <SelectItem value="all">Mine and assigned</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {list.error ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <RowsSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q ? 'No stories match that search' : 'Nothing here yet'}
        >
          {can(me, 'news.create') && !q && 'Start a new article to get going.'}
        </EmptyState>
      ) : (
        <>
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y">
              {rows.map((a) => (
                <li
                  key={a.id}
                  className="relative flex items-center gap-4 px-4 py-3 hover:bg-accent/30"
                >
                  {a.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.thumbUrl}
                      alt=""
                      className="hidden size-14 shrink-0 rounded-md object-cover sm:block"
                    />
                  ) : (
                    <span className="hidden size-14 shrink-0 place-items-center rounded-md bg-muted sm:grid">
                      <FileText className="size-5 text-muted-foreground" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="font-medium after:absolute after:inset-0 focus-visible:outline-none"
                    >
                      <span className="line-clamp-1">{a.title}</span>
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{a.category?.name ?? 'No category'}</span>
                      <span>·</span>
                      <span>
                        {a.author?.name ??
                          a.createdBy?.displayName ??
                          'StockVirtue Desk'}
                      </span>
                      {a.comments > 0 && (
                        <span className="flex items-center gap-0.5">
                          · <MessageSquare className="size-3" /> {a.comments}
                        </span>
                      )}
                      {a.isBreaking && (
                        <Badge
                          variant="destructive"
                          className="h-4 px-1 text-[10px]"
                        >
                          Breaking
                        </Badge>
                      )}
                      {a.isFeatured && (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1 text-[10px]"
                        >
                          Featured
                        </Badge>
                      )}
                      {a.isAiGenerated && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[10px]"
                        >
                          AI
                        </Badge>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ArticleStatusBadge status={a.status} />
                    <span
                      className="text-xs text-muted-foreground"
                      title={formatDateTime(a.updatedAt)}
                    >
                      {a.status === 'SCHEDULED' && a.scheduledAt
                        ? `Goes live ${formatDateTime(a.scheduledAt)}`
                        : a.status === 'PUBLISHED' && a.publishedAt
                          ? `Published ${timeAgo(a.publishedAt)}`
                          : `Edited ${timeAgo(a.updatedAt)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {list.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
              >
                {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
      <NewArticleDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
