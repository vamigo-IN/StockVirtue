'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  EmptyState,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { type FetchLogFilters, useFetchLogs } from '@/portal/queries';
import type { FetchLogRow } from '@/portal/types';
import { History } from 'lucide-react';
import { FetchStatusBadge } from './labels';

const TRIGGER = {
  SCHEDULE: 'Scheduled',
  MANUAL: 'Fetch now',
  RETRY: 'Retry',
} as const;

/** Fetch history: every check of a source, its result, and Retry for failures. */
export function FetchHistory({
  filters,
  canRetry,
  showSource = false,
  compact = false,
}: {
  filters: FetchLogFilters;
  canRetry: boolean;
  showSource?: boolean;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const logs = useFetchLogs({ ...filters, page });
  const [retrying, setRetrying] = useState<string | null>(null);

  async function retry(row: FetchLogRow) {
    setRetrying(row.id);
    try {
      await api(`staff/sources/logs/${row.id}/retry`, { method: 'POST' });
      toast.success(
        `Retrying ${row.source.name}. The result appears here shortly.`,
      );
      void qc.invalidateQueries({ queryKey: ['sources'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRetrying(null);
    }
  }

  if (logs.error)
    return (
      <QueryError error={logs.error} onRetry={() => void logs.refetch()} />
    );
  if (!logs.data) return <RowsSkeleton rows={compact ? 3 : 6} />;
  if (logs.data.items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title={
          filters.status === 'FAILED' ? 'No failed fetches' : 'No fetches yet'
        }
      >
        {filters.status === 'FAILED'
          ? 'Every recent fetch worked.'
          : 'The worker records every check of this source here.'}
      </EmptyState>
    );
  }
  const pages = Math.ceil(logs.data.total / logs.data.pageSize);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              {showSource && <TableHead>Source</TableHead>}
              <TableHead>Result</TableHead>
              <TableHead className="text-right">New</TableHead>
              {!compact && (
                <TableHead className="text-right">Repeats</TableHead>
              )}
              {!compact && <TableHead className="text-right">Seen</TableHead>}
              <TableHead>Details</TableHead>
              {canRetry && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.data.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">
                  <span title={formatDateTime(r.startedAt)}>
                    {timeAgo(r.startedAt)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {TRIGGER[r.trigger]}
                    {r.requestedBy ? ` · ${r.requestedBy}` : ''}
                  </span>
                </TableCell>
                {showSource && (
                  <TableCell>
                    <Link
                      href={`/admin/sources/${r.source.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.source.name}
                    </Link>
                  </TableCell>
                )}
                <TableCell>
                  <FetchStatusBadge status={r.status} />
                  {r.httpStatus != null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      HTTP {r.httpStatus}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.itemsNew - r.itemsDuplicate}
                </TableCell>
                {!compact && (
                  <TableCell className="text-right tabular-nums">
                    {r.itemsDuplicate}
                  </TableCell>
                )}
                {!compact && (
                  <TableCell className="text-right tabular-nums">
                    {r.itemsSeen}
                  </TableCell>
                )}
                <TableCell className="max-w-md">
                  {r.error ? (
                    <span className="text-sm text-destructive">{r.error}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {r.durationMs != null
                        ? `${(r.durationMs / 1000).toFixed(1)} s`
                        : ''}
                    </span>
                  )}
                  {r.retriedBy && (
                    <span className="block text-xs text-muted-foreground">
                      Retried {timeAgo(r.retriedBy.startedAt)}
                    </span>
                  )}
                </TableCell>
                {canRetry && (
                  <TableCell>
                    {r.status === 'FAILED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void retry(r)}
                        disabled={retrying === r.id}
                      >
                        <RotateCw
                          className={
                            retrying === r.id ? 'animate-spin' : undefined
                          }
                        />
                        Retry
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!compact && pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
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
  );
}
