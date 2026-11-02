'use client';

import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import {
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  auditLabel,
  auditTone,
  deviceLabel,
  formatDateTime,
  timeAgo,
} from '@/portal/format';
import { useAudit } from '@/portal/queries';
import type { AuditEntry } from '@/portal/types';

/** Filters map to action-name prefixes (the API matches with startsWith). */
const FILTERS = [
  { value: 'all', label: 'All activity', prefix: '' },
  { value: 'staff.login', label: 'Portal sign-ins', prefix: 'staff.login' },
  { value: 'staff.', label: 'Staff, roles & sessions', prefix: 'staff.' },
  { value: 'user.', label: 'App user moderation', prefix: 'user.' },
  { value: 'site.', label: 'Website settings', prefix: 'site.' },
];

function Target({ entry }: { entry: AuditEntry }) {
  if (!entry.entityType)
    return <span className="text-muted-foreground">—</span>;
  const short = entry.entityId ? entry.entityId.slice(0, 8) : '';
  if (entry.entityType === 'User' && entry.entityId) {
    return (
      <Link
        href={`/admin/users/${entry.entityId}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        App user · {short}
      </Link>
    );
  }
  const names: Record<string, string> = {
    StaffProfile: 'Staff member',
    StaffSession: 'Session',
    StaffInvitation: 'Invitation',
    Role: 'Role',
    SiteSetting: 'Website settings',
  };
  return (
    <span>
      {names[entry.entityType] ?? entry.entityType}
      {short && entry.entityType !== 'SiteSetting' && (
        <span className="text-muted-foreground"> · {short}</span>
      )}
    </span>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-2.5 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditView({ initialAction }: { initialAction: string }) {
  const known = FILTERS.find((f) => f.prefix === initialAction);
  const [filter, setFilter] = useState(known ? known.value : 'all');
  const prefix = FILTERS.find((f) => f.value === filter)?.prefix ?? '';
  const audit = useAudit(prefix);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = audit.data?.pages.flatMap((p) => p.items) ?? [];

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every privileged action in the newsroom: who did it, when, from where, and what changed. Entries can't be edited or deleted."
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-56" aria-label="Filter activity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {audit.error ? (
        <QueryError error={audit.error} onRetry={() => void audit.refetch()} />
      ) : audit.isPending ? (
        <RowsSkeleton rows={10} />
      ) : rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="Nothing recorded yet" />
      ) : (
        <>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-8 pl-3">
                    <span className="sr-only">Details</span>
                  </TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden md:table-cell">Target</TableHead>
                  <TableHead className="hidden pr-4 lg:table-cell">
                    From
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const expanded = open.has(e.id);
                  const tone = auditTone(e.action);
                  return (
                    <Fragment key={e.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => toggle(e.id)}
                        data-state={expanded ? 'selected' : undefined}
                      >
                        <TableCell className="pl-3">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-expanded={expanded}
                            aria-label={
                              expanded ? 'Hide details' : 'Show details'
                            }
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggle(e.id);
                            }}
                          >
                            {expanded ? <ChevronDown /> : <ChevronRight />}
                          </Button>
                        </TableCell>
                        <TableCell
                          className="text-sm whitespace-nowrap"
                          title={formatDateTime(e.createdAt)}
                        >
                          <span className="block">{timeAgo(e.createdAt)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(e.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-sm">
                          {e.actorEmail ?? 'System'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span
                            className={cn(
                              'font-medium',
                              tone === 'danger' && 'text-destructive',
                              tone === 'warning' && 'text-warning',
                            )}
                          >
                            {auditLabel(e.action)}
                          </span>
                          <code className="block font-mono text-[11px] text-muted-foreground">
                            {e.action}
                          </code>
                        </TableCell>
                        <TableCell
                          className="hidden text-sm md:table-cell"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Target entry={e} />
                        </TableCell>
                        <TableCell className="hidden pr-4 text-sm lg:table-cell">
                          <span className="block font-mono text-xs">
                            {e.ip ?? '—'}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {e.userAgent ? deviceLabel(e.userAgent) : ''}
                          </span>
                        </TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={6}
                            className="bg-muted/20 px-4 py-3 whitespace-normal"
                          >
                            <div className="grid gap-3 md:grid-cols-3">
                              <Json label="Before" value={e.before} />
                              <Json label="After" value={e.after} />
                              <Json label="Details" value={e.meta} />
                              {e.before == null &&
                                e.after == null &&
                                e.meta == null && (
                                  <p className="text-sm text-muted-foreground">
                                    No field changes recorded for this action.
                                  </p>
                                )}
                            </div>
                            <p className="mt-3 font-mono text-[11px] text-muted-foreground break-all">
                              {e.entityType
                                ? `${e.entityType} ${e.entityId ?? ''} · `
                                : ''}
                              {e.userAgent ?? ''}
                            </p>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
          {audit.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void audit.fetchNextPage()}
                disabled={audit.isFetchingNextPage}
              >
                {audit.isFetchingNextPage ? 'Loading…' : 'Load older entries'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
