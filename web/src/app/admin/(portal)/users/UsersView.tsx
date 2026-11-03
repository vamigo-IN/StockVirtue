'use client';

import { ChevronRight, Search, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatusBadge,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import {
  formatDate,
  formatDateTime,
  SIGN_IN_LABELS,
  timeAgo,
} from '@/portal/format';
import { useAppUsers } from '@/portal/queries';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function UsersView() {
  const [text, setText] = useState('');
  const [status, setStatus] = useState('all');
  const q = useDebounced(text.trim(), 300);
  const users = useAppUsers(q, status === 'all' ? '' : status);
  const rows = users.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="App users"
        description="StockVirtue app accounts. Find someone, fix an offensive display name, or block an account that breaks the rules."
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search name, email, phone, referral code or id"
            className="pl-9"
            aria-label="Search app users"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="BLOCKED">Blocked</SelectItem>
            <SelectItem value="DELETED">Deleted</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {users.error ? (
        <QueryError error={users.error} onRetry={() => void users.refetch()} />
      ) : users.isPending ? (
        <RowsSkeleton rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title={q ? 'No users match that search' : 'No users'}
        />
      ) : (
        <>
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="pl-4">User</TableHead>
                  <TableHead className="hidden lg:table-cell">Phone</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Signs in with
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  <TableHead className="hidden xl:table-cell">
                    Last sign-in
                  </TableHead>
                  <TableHead className="w-10 pr-4">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((u) => (
                  <TableRow key={u.id} className="relative">
                    <TableCell className="max-w-64 pl-4">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          <span className="truncate">
                            {u.displayName || 'Unnamed'}
                          </span>
                          {u.isStaff && (
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              Staff
                            </Badge>
                          )}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email ?? 'No email'}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">
                      {u.phone ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {u.signIn.map((s) => (
                          <Badge key={s} variant="secondary">
                            {SIGN_IN_LABELS[s] ?? s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell
                      className="hidden text-sm text-muted-foreground xl:table-cell"
                      title={formatDateTime(u.lastLoginAt)}
                    >
                      {timeAgo(u.lastLoginAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <ChevronRight
                        className="ml-auto size-4 text-muted-foreground"
                        aria-hidden
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {users.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => void users.fetchNextPage()}
                disabled={users.isFetchingNextPage}
              >
                {users.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
