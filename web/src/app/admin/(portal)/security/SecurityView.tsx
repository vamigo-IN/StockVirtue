'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Monitor, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { can } from '@/portal/access';
import { api } from '@/portal/api';
import { deviceLabel, formatDateTime, timeAgo } from '@/portal/format';
import { qk, useAllSessions, useMySessions } from '@/portal/queries';
import type { MySession, StaffSessionRow } from '@/portal/types';

const isMobile = (ua: string | null) =>
  !!ua && /Android|iPhone|iPad|Mobile/.test(ua);

function DeviceIcon({ ua }: { ua: string | null }) {
  const Icon = isMobile(ua) ? Smartphone : Monitor;
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
      <Icon className="size-4 text-muted-foreground" aria-hidden />
    </span>
  );
}

type Ending =
  | { kind: 'mine'; session: MySession }
  | { kind: 'others' }
  | { kind: 'any'; session: StaffSessionRow }
  | null;

export function SecurityView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const manage = can(me, 'security.manage');
  const mine = useMySessions();
  const all = useAllSessions(manage);
  const [ending, setEnding] = useState<Ending>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.mySessions });
    void qc.invalidateQueries({ queryKey: qk.allSessions });
    void qc.invalidateQueries({ queryKey: qk.dashboard });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };
  const others = mine.data?.filter((s) => !s.current).length ?? 0;

  return (
    <>
      <PageHeader
        title="Security"
        description="Where you're signed in to the newsroom. Every sign-in needs your password and a code emailed to you; sessions end after a period of inactivity and expire within hours."
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Your sessions</CardTitle>
            <CardDescription>
              Don&apos;t recognise one? End it, then change your StockVirtue
              password in the app.
            </CardDescription>
            {others > 0 && (
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEnding({ kind: 'others' })}
                >
                  Sign out other sessions
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {mine.error ? (
              <QueryError
                error={mine.error}
                onRetry={() => void mine.refetch()}
              />
            ) : mine.isPending ? (
              <RowsSkeleton rows={2} />
            ) : (
              <ul className="divide-y">
                {mine.data.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <DeviceIcon ua={s.userAgent} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {deviceLabel(s.userAgent)}
                        {s.current && (
                          <Badge className="bg-success/15 px-1.5 py-0 text-[10px] text-success">
                            This browser
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.ip ?? 'Unknown IP'} · signed in{' '}
                        {timeAgo(s.createdAt)} · active {timeAgo(s.lastSeenAt)}
                      </p>
                    </div>
                    {!s.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEnding({ kind: 'mine', session: s })}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {manage && (
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>All staff sessions</CardTitle>
              <CardDescription>
                Everyone signed in to the portal right now. Ending a session
                signs that browser out at its next action.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {all.error ? (
                <div className="px-6 pb-6">
                  <QueryError
                    error={all.error}
                    onRetry={() => void all.refetch()}
                  />
                </div>
              ) : all.isPending ? (
                <div className="px-6 pb-6">
                  <RowsSkeleton rows={3} />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead className="pl-6">Person</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Device
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        IP address
                      </TableHead>
                      <TableHead>Last active</TableHead>
                      <TableHead className="w-28 pr-6">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {all.data.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="pl-6">
                          <p className="font-medium">{s.displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.email}
                          </p>
                        </TableCell>
                        <TableCell className="hidden text-sm sm:table-cell">
                          {deviceLabel(s.userAgent)}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs md:table-cell">
                          {s.ip ?? '—'}
                        </TableCell>
                        <TableCell
                          className="text-sm"
                          title={formatDateTime(s.lastSeenAt)}
                        >
                          {timeAgo(s.lastSeenAt)}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          {s.current ? (
                            <span className="text-xs text-muted-foreground">
                              You
                            </span>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() =>
                                setEnding({ kind: 'any', session: s })
                              }
                            >
                              End session
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/30">
          <CardContent className="flex gap-3">
            <ShieldCheck
              className="mt-0.5 size-5 shrink-0 text-primary"
              aria-hidden
            />
            <p className="text-sm text-muted-foreground">
              Newsroom access uses your StockVirtue account. Keep its password
              to yourself, never share sign-in codes, and sign out on shared
              computers. Suspending a staff member signs them out everywhere
              immediately.
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={ending?.kind === 'mine'}
        onOpenChange={(o) => !o && setEnding(null)}
        title="Sign out this session?"
        description={
          ending?.kind === 'mine'
            ? `${deviceLabel(ending.session.userAgent)} (${ending.session.ip ?? 'unknown IP'}) will need to sign in again.`
            : ''
        }
        confirmLabel="Sign out"
        onConfirm={async () => {
          if (ending?.kind !== 'mine') return;
          await api(`staff/auth/sessions/${ending.session.id}`, {
            method: 'DELETE',
          });
          refresh();
          toast.success('Session signed out.');
        }}
      />
      <ConfirmDialog
        open={ending?.kind === 'others'}
        onOpenChange={(o) => !o && setEnding(null)}
        title="Sign out your other sessions?"
        description="Every browser signed in as you, except this one, will need to sign in again."
        confirmLabel="Sign out others"
        onConfirm={async () => {
          const res = await api<{ signedOut: number }>(
            'staff/auth/sessions/revoke-others',
            {
              method: 'POST',
            },
          );
          refresh();
          toast.success(
            `Signed out ${res.signedOut} session${res.signedOut === 1 ? '' : 's'}.`,
          );
        }}
      />
      <ConfirmDialog
        open={ending?.kind === 'any'}
        onOpenChange={(o) => !o && setEnding(null)}
        title={`End ${ending?.kind === 'any' ? ending.session.displayName : ''}'s session?`}
        description="That browser is signed out at its next action. The person can sign in again with their password and an emailed code. To keep them out, suspend them on the Staff page."
        confirmLabel="End session"
        destructive
        onConfirm={async () => {
          if (ending?.kind !== 'any') return;
          await api(`staff/security/sessions/${ending.session.id}`, {
            method: 'DELETE',
          });
          refresh();
          toast.success('Session ended.');
        }}
      />
    </>
  );
}
