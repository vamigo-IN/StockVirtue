'use client';

import { ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
import { formatDateTime, timeAgo } from '@/portal/format';
import { useArticles } from '@/portal/queries';

/** Stories waiting for an editor, oldest first so nothing sits forgotten. */
export function ReviewQueueView() {
  const me = usePortalMe();
  const [mine, setMine] = useState(false);
  const list = useArticles({
    status: 'IN_REVIEW',
    scope: mine ? 'assigned' : 'all',
  });
  const rows = [...(list.data?.pages.flatMap((p) => p.items) ?? [])].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  );

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Stories submitted for review. Approve, ask for changes or reject them; you can't sign off your own work."
        actions={
          <div className="flex rounded-lg border p-0.5">
            <Button
              size="sm"
              variant={mine ? 'ghost' : 'secondary'}
              onClick={() => setMine(false)}
            >
              All
            </Button>
            <Button
              size="sm"
              variant={mine ? 'secondary' : 'ghost'}
              onClick={() => setMine(true)}
            >
              Assigned to me
            </Button>
          </div>
        }
      />
      {list.error ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <RowsSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nothing waiting for review">
          Submitted stories appear here.
        </EmptyState>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {rows.map((a) => {
              const own = a.createdBy?.id === me.id;
              const waitingHours =
                (Date.now() - new Date(a.updatedAt).getTime()) / 3_600_000;
              return (
                <li
                  key={a.id}
                  className="relative flex items-center gap-4 px-4 py-3 hover:bg-accent/30"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="font-medium after:absolute after:inset-0"
                    >
                      <span className="line-clamp-1">{a.title}</span>
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.createdBy?.displayName ?? 'Unknown writer'} ·{' '}
                      {a.category?.name ?? 'No category'}
                    </p>
                  </div>
                  {own && <Badge variant="outline">Your story</Badge>}
                  <span
                    className={
                      waitingHours > 6
                        ? 'text-xs font-medium text-warning'
                        : 'text-xs text-muted-foreground'
                    }
                    title={formatDateTime(a.updatedAt)}
                  >
                    Waiting {timeAgo(a.updatedAt).replace(' ago', '')}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
