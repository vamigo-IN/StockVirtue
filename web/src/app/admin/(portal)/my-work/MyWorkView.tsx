'use client';

import {
  ArrowRight,
  ClipboardCheck,
  FilePen,
  Inbox,
  MessageSquareWarning,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { ArticleStatusBadge } from '@/components/portal/ArticleStatusBadge';
import {
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDate, timeAgo } from '@/portal/format';
import { useMyWork } from '@/portal/queries';
import type { ArticleBrief } from '@/portal/types';

function List({ items, empty }: { items: ArticleBrief[]; empty: string }) {
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((a) => (
        <li
          key={a.id}
          className="relative flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
        >
          <div className="min-w-0 flex-1">
            <Link
              href={`/admin/articles/${a.id}`}
              className="text-sm font-medium after:absolute after:inset-0"
            >
              <span className="line-clamp-1">{a.title}</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              {a.category?.name ?? 'No category'} · edited{' '}
              {timeAgo(a.updatedAt)}
            </p>
          </div>
          <ArticleStatusBadge status={a.status} />
        </li>
      ))}
    </ul>
  );
}

const ROLE = { WRITER: 'Write', EDITOR: 'Edit', REVIEWER: 'Review' } as const;

export function MyWorkView() {
  const work = useMyWork();
  if (work.error)
    return (
      <QueryError error={work.error} onRetry={() => void work.refetch()} />
    );
  if (!work.data) return <RowsSkeleton rows={6} />;
  const w = work.data;

  return (
    <>
      <PageHeader
        title="My work"
        description="Your assignments and the stories you have in progress."
        actions={
          w.reviewQueue !== null && (
            <Button variant="outline" asChild>
              <Link href="/admin/review">
                <ClipboardCheck /> Review queue
                <Badge className="ml-1">{w.reviewQueue}</Badge>
              </Link>
            </Button>
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="size-4 text-primary" /> Assigned to you
            </CardTitle>
            <CardDescription>
              Open assignments, soonest deadline first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {w.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No open assignments.
              </p>
            ) : (
              <ul className="divide-y">
                {w.assignments.map((x) => {
                  const overdue =
                    x.dueAt && new Date(x.dueAt).getTime() < Date.now();
                  return (
                    <li
                      key={x.id}
                      className="relative flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Badge variant="outline" className="w-16 justify-center">
                        {ROLE[x.role]}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/articles/${x.article.id}`}
                          className="text-sm font-medium after:absolute after:inset-0"
                        >
                          <span className="line-clamp-1">
                            {x.article.title}
                          </span>
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {x.note ? `${x.note} · ` : ''}from{' '}
                          {x.assignedBy?.displayName ?? 'an editor'}
                        </p>
                      </div>
                      {x.dueAt && (
                        <span
                          className={cn(
                            'text-xs',
                            overdue
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground',
                          )}
                        >
                          {overdue ? 'Overdue · ' : 'Due '}
                          {formatDate(x.dueAt)}
                        </span>
                      )}
                      <ArrowRight
                        className="size-4 text-muted-foreground"
                        aria-hidden
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareWarning className="size-4 text-warning" /> Changes
              requested
            </CardTitle>
          </CardHeader>
          <CardContent>
            <List
              items={w.changesRequested}
              empty="Nothing sent back to you."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FilePen className="size-4 text-muted-foreground" /> Drafts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <List items={w.drafts} empty="No drafts in progress." />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-4 text-sky-600" /> With the editors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <List
              items={w.inReview}
              empty="Nothing of yours is waiting for review."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
