'use client';

import { ChevronDown, ChevronRight, History } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import {
  EmptyState,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDateTime, timeAgo } from '@/portal/format';
import { type AiJobFilters, useAiJobs } from '@/portal/queries';
import type { AiJob, AiJobStatus } from '@/portal/types';
import { formatUsd } from './labels';

const STATUS: Record<AiJobStatus, { label: string; cls: string }> = {
  QUEUED: {
    label: 'Waiting',
    cls: 'border-border bg-muted text-muted-foreground',
  },
  RUNNING: {
    label: 'Running',
    cls: 'border-border bg-muted text-muted-foreground',
  },
  SUCCEEDED: {
    label: 'Done',
    cls: 'border-success/30 bg-success/10 text-success',
  },
  FAILED: {
    label: 'Failed',
    cls: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

export function AiStatusBadge({ status }: { status: AiJobStatus }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS[status].cls)}>
      {STATUS[status].label}
    </Badge>
  );
}

/** The AI processing history (spec §9): who asked for what, what came back, and what it cost. */
export function AiHistory({
  filters,
  compact = false,
}: {
  filters: AiJobFilters;
  compact?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const jobs = useAiJobs({ ...filters, page });
  if (jobs.error)
    return (
      <QueryError error={jobs.error} onRetry={() => void jobs.refetch()} />
    );
  if (!jobs.data) return <RowsSkeleton rows={compact ? 3 : 6} />;
  if (jobs.data.items.length === 0) {
    return (
      <EmptyState icon={History} title="No AI requests yet">
        Every request to the AI is recorded here, with what came back.
      </EmptyState>
    );
  }
  const pages = Math.ceil(jobs.data.total / jobs.data.pageSize);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-0" />
              <TableHead>When</TableHead>
              <TableHead>Tool</TableHead>
              {!compact && <TableHead>For</TableHead>}
              <TableHead>Result</TableHead>
              {!compact && <TableHead className="text-right">Tokens</TableHead>}
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.data.items.map((j) => (
              <Fragment key={j.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setOpen(open === j.id ? null : j.id)}
                >
                  <TableCell>
                    {open === j.id ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span title={formatDateTime(j.createdAt)}>
                      {timeAgo(j.createdAt)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {j.automatic
                        ? 'Automatic'
                        : (j.requestedBy?.displayName ?? 'Former staff')}
                    </span>
                  </TableCell>
                  <TableCell>
                    {j.label}
                    {j.appliedAt && (
                      <span className="block text-xs text-success">Used</span>
                    )}
                  </TableCell>
                  {!compact && (
                    <TableCell className="max-w-xs truncate text-sm">
                      {j.article ? (
                        <Link
                          href={`/admin/articles/${j.article.id}`}
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {j.article.title}
                        </Link>
                      ) : j.sourceItem ? (
                        <span className="text-muted-foreground">
                          Item: {j.sourceItem.title}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <AiStatusBadge status={j.status} />
                  </TableCell>
                  {!compact && (
                    <TableCell className="text-right text-xs tabular-nums">
                      {j.inputTokens != null
                        ? `${j.inputTokens.toLocaleString('en-IN')} / ${(j.outputTokens ?? 0).toLocaleString('en-IN')}`
                        : '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm tabular-nums">
                    {formatUsd(j.costUsd)}
                  </TableCell>
                </TableRow>
                {open === j.id && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={compact ? 5 : 7}
                      className="bg-muted/30"
                    >
                      <JobDetail job={j} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
      {pages > 1 && (
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

function JobDetail({ job }: { job: AiJob }) {
  const checks = job.checks;
  return (
    <div className="space-y-3 text-sm whitespace-normal">
      <p className="text-xs text-muted-foreground">
        {job.model ? `${job.model} · ` : ''}prompt v{job.promptVersion}
        {job.durationMs != null
          ? ` · ${(job.durationMs / 1000).toFixed(1)} s`
          : ''}
        {job.finishedAt ? ` · finished ${formatDateTime(job.finishedAt)}` : ''}
      </p>
      {job.error && <p className="text-destructive">{job.error}</p>}
      {checks && (checks.removed.length > 0 || checks.withheld.length > 0) && (
        <div>
          <p className="font-medium">Automatic checks</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {checks.removed.map((r, i) => (
              <li key={`r${i}`}>
                Removed “{r.text}” —{' '}
                {r.reason === 'figures'
                  ? `${r.figures?.join(', ')} not in the material`
                  : 'copied wording'}
              </li>
            ))}
            {checks.withheld.map((w, i) => (
              <li key={`w${i}`}>
                Withheld “{w.text}”
                {w.figures.length
                  ? ` — ${w.figures.join(', ')} not in the material`
                  : ' — copied wording'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {job.output != null && (
        <details>
          <summary className="cursor-pointer font-medium">
            What came back
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap">
            {JSON.stringify(job.output, null, 2)}
          </pre>
        </details>
      )}
      {job.input != null && (
        <details>
          <summary className="cursor-pointer font-medium">
            What was sent
          </summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded-md bg-background p-2 text-xs whitespace-pre-wrap">
            {JSON.stringify(job.input, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
