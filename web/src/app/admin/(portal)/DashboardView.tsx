'use client';

import {
  ArrowRight,
  KeyRound,
  MonitorSmartphone,
  ShieldAlert,
  UserRound,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader, QueryError, StatCard } from '@/components/portal/common';
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
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { groupLabel } from '@/portal/access';
import {
  auditLabel,
  auditTone,
  formatCount,
  formatDateTime,
  timeAgo,
} from '@/portal/format';
import { useDashboard } from '@/portal/queries';
import { roleLabel } from '@/portal/roles';

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardView() {
  const me = usePortalMe();
  const { data, error, isPending, refetch } = useDashboard();
  const first = me.displayName.split(/\s+/)[0];

  const groups = new Map<string, number>();
  for (const p of me.permissions) {
    const g = p.split('.')[0];
    groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  const editorial = me.permissions.some((p) => p.startsWith('news.'));

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${first}`}
        description={
          me.lastPortalLoginAt
            ? `You signed in ${timeAgo(me.lastPortalLoginAt)} (${formatDateTime(me.lastPortalLoginAt)}).`
            : 'Welcome to the StockVirtue newsroom.'
        }
      />

      {error && <QueryError error={error} onRetry={() => void refetch()} />}

      {(isPending || data?.people || data?.users || data?.security) && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {isPending &&
            Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          {data?.people && (
            <StatCard
              label="Newsroom staff"
              value={formatCount(data.people.active)}
              icon={Users}
              href="/admin/staff"
              hint={`${data.people.suspended} suspended · ${data.people.pendingInvitations} invitation${data.people.pendingInvitations === 1 ? '' : 's'} pending`}
            />
          )}
          {data?.users && (
            <StatCard
              label="App users"
              value={formatCount(data.users.total)}
              icon={UserRound}
              href="/admin/users"
              hint={`+${formatCount(data.users.joinedLast7Days)} this week · ${formatCount(data.users.blocked)} blocked`}
            />
          )}
          {data?.security && (
            <>
              <StatCard
                label="Staff signed in now"
                value={formatCount(data.security.activeSessions)}
                icon={KeyRound}
                href="/admin/security"
                hint="Active portal sessions"
              />
              <StatCard
                label="Failed sign-ins (24 h)"
                value={formatCount(data.security.failedSignIns24h)}
                icon={ShieldAlert}
                href="/admin/audit?action=staff.login"
                tone={
                  data.security.failedSignIns24h >= 10 ? 'warning' : 'default'
                }
                hint="Wrong passwords and codes"
              />
            </>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {data?.activity && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardDescription>
                The latest changes across the newsroom.
              </CardDescription>
              <CardAction>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/admin/audit">
                    Audit log <ArrowRight />
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {data.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing recorded yet.
                </p>
              ) : (
                <ol className="divide-y">
                  {data.activity.map((a) => {
                    const tone = auditTone(a.action);
                    return (
                      <li
                        key={a.id}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            'mt-1.5 size-2 shrink-0 rounded-full bg-primary/60',
                            tone === 'warning' && 'bg-warning',
                            tone === 'danger' && 'bg-destructive',
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {auditLabel(a.action)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.actorEmail ?? 'System'}
                            {a.ip ? ` · ${a.ip}` : ''}
                          </p>
                        </div>
                        <time
                          dateTime={a.createdAt}
                          title={formatDateTime(a.createdAt)}
                          className="shrink-0 text-xs text-muted-foreground"
                        >
                          {timeAgo(a.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        )}

        <Card className={cn(!data?.activity && 'lg:col-span-3')}>
          <CardHeader>
            <CardTitle>Your access</CardTitle>
            <CardDescription>
              What your roles let you do in the newsroom.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {me.roles.map((r) => (
                <Badge key={r} variant="secondary">
                  {roleLabel(r)}
                </Badge>
              ))}
            </div>
            <ul className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-1">
              {[...groups.entries()]
                .sort((a, b) =>
                  groupLabel(a[0]).localeCompare(groupLabel(b[0])),
                )
                .map(([g, n]) => (
                  <li key={g} className="flex justify-between gap-4">
                    <span>{groupLabel(g)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {n} permission{n === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
            </ul>
            {data && (
              <Link
                href="/admin/security"
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent/40"
              >
                <MonitorSmartphone
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex-1">
                  Signed in on {data.mySessions} browser
                  {data.mySessions === 1 ? '' : 's'}
                </span>
                <ArrowRight
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </Link>
            )}
            {editorial && (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                Writing and review tools for articles will appear in this portal
                when they are switched on.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
