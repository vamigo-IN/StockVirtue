'use client';

import { useQueryClient } from '@tanstack/react-query';
import { diffWords } from 'diff';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArticleStatusBadge } from '@/components/portal/ArticleStatusBadge';
import {
  ConfirmDialog,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import {
  invalidateArticles,
  qk,
  useArticle,
  useVersion,
  useVersions,
} from '@/portal/queries';
import type { ArticleDetail, VersionInfo } from '@/portal/types';

const REASONS: Record<VersionInfo['reason'], string> = {
  AUTOSAVE: 'Autosave',
  MANUAL: 'Saved',
  SUBMIT: 'Sent for review',
  APPROVE: 'Approved',
  PUBLISH: 'Published',
  // A change to a live story: a retraction today, or one of the correction
  // notes retired on 6 Nov 2026 (their note is not shown any more).
  CORRECTION: 'Live update',
  RESTORE: 'Restored',
};

function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  if (before === after)
    return <p className="text-sm text-muted-foreground">No change.</p>;
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.added ? (
          <ins
            key={i}
            className="rounded-sm bg-success/15 text-success no-underline decoration-transparent"
          >
            {p.value}
          </ins>
        ) : p.removed ? (
          <del
            key={i}
            className="rounded-sm bg-destructive/10 text-destructive"
          >
            {p.value}
          </del>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </p>
  );
}

export function HistoryView({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const article = useArticle(id);
  const versions = useVersions(id);
  const [right, setRight] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<VersionInfo | null>(null);

  useEffect(() => {
    if (versions.data && !right) {
      setRight(versions.data[0]?.id ?? null);
      setLeft(versions.data[1]?.id ?? null);
    }
  }, [versions.data, right]);

  const a = useVersion(id, left);
  const b = useVersion(id, right);

  if (versions.error || article.error) {
    return (
      <QueryError
        error={versions.error ?? article.error}
        onRetry={() => void versions.refetch()}
      />
    );
  }
  if (!versions.data || !article.data) return <RowsSkeleton rows={6} />;

  const pick = (v: VersionInfo) => {
    // Clicking a version compares it with the one before it.
    const idx = versions.data.findIndex((x) => x.id === v.id);
    setRight(v.id);
    setLeft(versions.data[idx + 1]?.id ?? null);
  };

  const sa = a.data?.snapshot;
  const sb = b.data?.snapshot;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="-ml-2 mb-3 text-muted-foreground"
      >
        <Link href={`/admin/articles/${id}`}>
          <ArrowLeft /> Back to the story
        </Link>
      </Button>
      <PageHeader
        title="Version history"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {article.data.title}{' '}
            <ArticleStatusBadge status={article.data.status} />
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <ol className="max-h-[70vh] divide-y overflow-y-auto">
            {versions.data.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => pick(v)}
                  className={cn(
                    'w-full px-4 py-3 text-left hover:bg-accent/40',
                    right === v.id && 'bg-accent/60',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    v{v.version}
                    <Badge variant="outline" className="text-[10px]">
                      {REASONS[v.reason]}
                    </Badge>
                  </span>
                  <span
                    className="block text-xs text-muted-foreground"
                    title={formatDateTime(v.createdAt)}
                  >
                    {v.editor?.displayName ?? 'Scheduler'} ·{' '}
                    {timeAgo(v.createdAt)} · {v.words} words
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {b.data ? (
                <>
                  Changes in v{b.data.version}
                  {a.data ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      since v{a.data.version}
                    </span>
                  ) : (
                    ' (first version)'
                  )}
                </>
              ) : (
                'Pick a version'
              )}
            </CardTitle>
            {b.data &&
              article.data.can.edit &&
              b.data.id !== versions.data[0]?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRestoring(
                      versions.data.find((v) => v.id === b.data!.id) ?? null,
                    )
                  }
                >
                  <RotateCcw /> Restore v{b.data.version}
                </Button>
              )}
          </CardHeader>
          <CardContent className="space-y-5">
            {!sb ? (
              <RowsSkeleton rows={3} />
            ) : (
              <>
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Headline
                  </h3>
                  <Diff before={sa?.title ?? ''} after={sb.title} />
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Standfirst
                  </h3>
                  <Diff before={sa?.subtitle ?? ''} after={sb.subtitle ?? ''} />
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Summary
                  </h3>
                  <Diff before={sa?.summary ?? ''} after={sb.summary} />
                </section>
                <section>
                  <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Story
                  </h3>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <Diff
                      before={sa?.contentText ?? ''}
                      after={sb.contentText}
                    />
                  </div>
                </section>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={`Restore v${restoring?.version ?? ''}?`}
        description="Its headline, text and details become the current version. Nothing is lost: today's version stays in the history."
        confirmLabel="Restore"
        onConfirm={async () => {
          if (!restoring) return;
          const next = await api<ArticleDetail>(
            `staff/articles/${id}/versions/${restoring.id}/restore`,
            { method: 'POST', body: { version: article.data.version } },
          );
          qc.setQueryData(qk.article(id), next);
          void qc.invalidateQueries({ queryKey: qk.versions(id) });
          invalidateArticles(qc);
          toast.success(`Restored v${restoring.version}.`);
          router.push(`/admin/articles/${id}`);
        }}
      />
    </>
  );
}
