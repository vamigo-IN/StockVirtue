'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatusBadge,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/portal/api';
import { formatDate, formatDateTime } from '@/portal/format';
import type {
  PrivacyRequestsPage,
  PrivacyRequestStatus,
  PrivacyRequestType,
  PrivacyRequestView,
} from '@/portal/types';

export const REQUEST_TYPES: Record<PrivacyRequestType, string> = {
  ACCESS: 'See their data',
  CORRECTION: 'Correct their data',
  ERASURE: 'Delete their data',
  NOMINATION: 'Nominate someone',
  WITHDRAW_CONSENT: 'Withdraw consent',
  GRIEVANCE: 'Grievance',
  OTHER: 'Other',
};

const STATUSES: Record<PrivacyRequestStatus, { label: string; style: string }> =
  {
    OPEN: { label: 'Open', style: 'border-warning/40 text-warning' },
    IN_PROGRESS: {
      label: 'In progress',
      style: 'border-primary/40 text-primary',
    },
    RESOLVED: {
      label: 'Resolved',
      style: 'border-success/30 bg-success/10 text-success',
    },
    REJECTED: { label: 'Rejected', style: '' },
  };

const CHANNELS: Record<string, string> = {
  app: 'App',
  web: 'Website',
  staff: 'Staff',
};

const isOpen = (r: PrivacyRequestView) =>
  r.status === 'OPEN' || r.status === 'IN_PROGRESS';
const overdue = (r: PrivacyRequestView) =>
  isOpen(r) && new Date(r.dueAt).getTime() < Date.now();

function RequestStatus({ status }: { status: PrivacyRequestStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', STATUSES[status].style)}
    >
      {STATUSES[status].label}
    </Badge>
  );
}

/**
 * The privacy request register (DPDP Act 2023): requests to see, correct or
 * delete personal data, nominations, withdrawn consent and grievances, from
 * the app and the website. Each has a due date inside the published response
 * time (the law allows at most 90 days); answers go to the person by email.
 */
export function PrivacyRequestsView() {
  const [status, setStatus] = useState<string>('open');
  const [type, setType] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const query = {
    ...(status === 'overdue'
      ? { overdue: 'true' }
      : status !== 'open' && status !== 'all'
        ? { status }
        : {}),
    ...(type !== 'all' ? { type } : {}),
  };
  const list = useQuery({
    queryKey: ['privacy-requests', status, type],
    queryFn: () =>
      api<PrivacyRequestsPage>('staff/privacy/requests', { query }),
  });
  const items = (list.data?.items ?? []).filter(
    (r) => status !== 'open' || isOpen(r),
  );
  const selected = list.data?.items.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Requests to see, correct or delete personal data, nominations, withdrawn consent and grievances, from the app and the website. Answer each by its due date: the law allows at most 90 days."
      />
      {list.data && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">{list.data.counts.open} open</Badge>
          <Badge
            variant="outline"
            className={cn(
              list.data.counts.overdue > 0 &&
                'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {list.data.counts.overdue} overdue
          </Badge>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open and in progress</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by request">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every kind of request</SelectItem>
            {(Object.keys(REQUEST_TYPES) as PrivacyRequestType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {REQUEST_TYPES[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {list.error ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <RowsSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={status === 'open' ? 'Nothing waiting' : 'No requests here'}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Request</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Came in</TableHead>
                <TableHead>Answer by</TableHead>
                <TableHead className="pr-4">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(r.id)}
                >
                  <TableCell className="pl-4">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => setOpenId(r.id)}
                    >
                      {REQUEST_TYPES[r.type]}
                    </button>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {r.reference} · {CHANNELS[r.channel] ?? r.channel}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.name || r.email || r.phone || 'App user'}
                    {r.email && r.name && (
                      <span className="block text-xs text-muted-foreground">
                        {r.email}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(r.createdAt)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-sm',
                      overdue(r) ? 'font-medium text-destructive' : '',
                    )}
                  >
                    {isOpen(r) ? formatDate(r.dueAt) : '—'}
                    {overdue(r) && (
                      <span className="block text-xs">Overdue</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <RequestStatus status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <RequestSheet
        request={selected}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </>
  );
}

function RequestSheet({
  request: r,
  onOpenChange,
}: {
  request: PrivacyRequestView | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (r && shownFor !== r.id) {
    setShownFor(r.id);
    setResponse(r.response ?? '');
  }
  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ['privacy-requests'] });

  async function update(status: PrivacyRequestStatus) {
    if (!r) return;
    setBusy(true);
    try {
      await api(`staff/privacy/requests/${r.id}`, {
        method: 'PATCH',
        body: {
          status,
          ...(response.trim() ? { response: response.trim() } : {}),
        },
      });
      toast.success(
        status === 'RESOLVED' || status === 'REJECTED'
          ? 'Answered. The person gets your answer by email.'
          : 'Saved.',
      );
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!r) return;
    setBusy(true);
    try {
      const data = await api<unknown>(`staff/privacy/requests/${r.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `stockvirtue-data-${r.reference}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const open = r ? isOpen(r) : false;
  const accountLive = !!r?.user && r.user.status !== 'DELETED';
  return (
    <Sheet open={!!r} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        {r && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>{REQUEST_TYPES[r.type]}</SheetTitle>
              <SheetDescription>
                <span className="font-mono">{r.reference}</span> · came in{' '}
                {formatDateTime(r.createdAt)} via{' '}
                {(CHANNELS[r.channel] ?? r.channel).toLowerCase()}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 space-y-5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <RequestStatus status={r.status} />
                {open && (
                  <span
                    className={cn(
                      'text-muted-foreground',
                      overdue(r) && 'font-medium text-destructive',
                    )}
                  >
                    {overdue(r) ? 'Overdue since' : 'Answer by'}{' '}
                    {formatDate(r.dueAt)}
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
                <dt className="text-muted-foreground">From</dt>
                <dd>{r.name || '—'}</dd>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="break-all">{r.email || '—'}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{r.phone || '—'}</dd>
                <dt className="text-muted-foreground">Account</dt>
                <dd>
                  {r.user ? (
                    <>
                      <Link
                        href={`/admin/users/${r.user.id}`}
                        className="hover:underline"
                      >
                        {r.user.displayName || r.user.id}
                      </Link>{' '}
                      <StatusBadge status={r.user.status} />
                      {r.user.eraseAfter && (
                        <span className="block text-xs text-muted-foreground">
                          Erased for good on {formatDate(r.user.eraseAfter)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      No account matches this email
                    </span>
                  )}
                </dd>
              </dl>
              <div>
                <p className="mb-1 font-medium">What they asked</p>
                <p className="rounded-lg bg-muted p-3 whitespace-pre-wrap">
                  {r.details}
                </p>
              </div>
              {(r.type === 'ACCESS' && r.user) ||
              (r.type === 'ERASURE' && accountLive) ? (
                <div className="flex flex-wrap gap-2">
                  {r.type === 'ACCESS' && r.user && (
                    <Button
                      variant="outline"
                      onClick={() => void download()}
                      disabled={busy}
                    >
                      <Download /> Download their data
                    </Button>
                  )}
                  {r.type === 'ERASURE' && accountLive && open && (
                    <Button
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setErasing(true)}
                      disabled={busy}
                    >
                      <Trash2 /> Delete their account
                    </Button>
                  )}
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="pr-response">
                  {open ? 'Your answer' : 'Answer sent'}
                </Label>
                <Textarea
                  id="pr-response"
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={6}
                  maxLength={6000}
                  disabled={!open || busy}
                  placeholder="What you did, or why you can't. It is emailed to the person with the grievance officer's details and their right to complain to the Data Protection Board."
                />
                {r.respondedAt && (
                  <p className="text-xs text-muted-foreground">
                    Answered {formatDateTime(r.respondedAt)}
                    {r.handledBy ? ` by ${r.handledBy.displayName}` : ''}
                  </p>
                )}
              </div>
              {open && (
                <div className="flex flex-wrap justify-end gap-2">
                  {r.status === 'OPEN' && (
                    <Button
                      variant="outline"
                      onClick={() => void update('IN_PROGRESS')}
                      disabled={busy}
                    >
                      Mark in progress
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => void update('REJECTED')}
                    disabled={busy || response.trim().length < 5}
                  >
                    Refuse and send
                  </Button>
                  <Button
                    onClick={() => void update('RESOLVED')}
                    disabled={busy || response.trim().length < 5}
                  >
                    Resolve and send
                  </Button>
                </div>
              )}
            </div>
            <ConfirmDialog
              open={erasing}
              onOpenChange={setErasing}
              title="Delete this account?"
              description="They are signed out everywhere and their name, email and phone stop being used at once. A locked copy is kept for one year, as the law requires, and then erased for good. This can't be undone. The request is marked resolved and they get an email."
              confirmLabel="Delete account"
              destructive
              onConfirm={async () => {
                await api(`staff/privacy/requests/${r.id}/erase`, {
                  method: 'POST',
                });
                toast.success('Account deleted.');
                refresh();
              }}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
