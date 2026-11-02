'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FetchHistory } from '@/components/newswire/FetchHistory';
import {
  HealthBadge,
  pollLabel,
  sourceTypeLabel,
  USAGE,
} from '@/components/newswire/labels';
import { SourceDialog } from '@/components/newswire/SourceDialog';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatCard,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { qk, useSources } from '@/portal/queries';
import type { NewsSourceView } from '@/portal/types';

const host = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/**
 * News sources (spec §8): where incoming news comes from, how each source is
 * doing, and its recent failures with Retry.
 */
export function SourcesView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const sources = useSources();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<NewsSourceView | null>(null);
  const [removing, setRemoving] = useState<NewsSourceView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canCreate = can(me, 'sources.create');
  const canUpdate = can(me, 'sources.update');
  const canDelete = can(me, 'sources.delete');
  const refresh = () => void qc.invalidateQueries({ queryKey: qk.sources });

  async function fetchNow(s: NewsSourceView) {
    setBusy(s.id);
    try {
      await api(`staff/sources/${s.id}/fetch`, { method: 'POST' });
      toast.success(`Fetching ${s.name}. New items appear in Incoming news.`);
      setTimeout(refresh, 4_000);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(s: NewsSourceView, isActive: boolean) {
    setBusy(s.id);
    try {
      await api(`staff/sources/${s.id}`, {
        method: 'PATCH',
        body: { isActive },
      });
      toast.success(
        isActive ? `${s.name} is active again.` : `${s.name} is paused.`,
      );
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const list = sources.data ?? [];
  const attention = list.filter(
    (s) => s.health === 'degraded' || s.health === 'failing',
  );
  const waiting = list.reduce((n, s) => n + (s.waiting ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="News sources"
        description="Where incoming news comes from. The newsroom worker checks each active source on its schedule, catches duplicates and matches companies; new items wait in Incoming news for a person. Nothing is published automatically."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/inbox">
                <Inbox /> Incoming news
              </Link>
            </Button>
            {canCreate && (
              <Button onClick={() => setAdding(true)}>
                <Plus /> Add source
              </Button>
            )}
          </>
        }
      />

      {sources.error ? (
        <QueryError
          error={sources.error}
          onRetry={() => void sources.refetch()}
        />
      ) : !sources.data ? (
        <RowsSkeleton rows={5} />
      ) : list.length === 0 ? (
        <EmptyState icon={Radio} title="No news sources yet">
          {canCreate
            ? 'Add a feed, a licensed news API or an official announcements page. The RBI and SEBI feeds are a good start.'
            : 'A newsroom admin can add feeds and news APIs here.'}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Healthy"
              value={list.filter((s) => s.health === 'healthy').length}
              icon={CheckCircle2}
              hint={`of ${list.filter((s) => s.format !== 'NONE').length} fetched sources`}
            />
            <StatCard
              label="Need attention"
              value={attention.length}
              icon={AlertTriangle}
              tone={attention.length ? 'warning' : 'default'}
              hint="Failing, or behind schedule"
            />
            <StatCard
              label="Paused"
              value={list.filter((s) => s.health === 'paused').length}
              icon={Radio}
            />
            <StatCard
              label="Waiting in Incoming news"
              value={waiting}
              icon={Inbox}
              href="/admin/inbox"
            />
          </div>

          <Card>
            <CardContent className="overflow-x-auto px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Source</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Use</TableHead>
                    <TableHead className="text-right">Waiting</TableHead>
                    {canUpdate && <TableHead>Active</TableHead>}
                    <TableHead className="w-0 pr-6" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-6">
                        <Link
                          href={`/admin/sources/${s.id}`}
                          className="font-medium hover:underline"
                        >
                          {s.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {sourceTypeLabel(s.type)}
                          {host(s.url) ? ` · ${host(s.url)}` : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        <HealthBadge health={s.health} />
                        <span
                          className="block max-w-xs truncate text-xs text-muted-foreground"
                          title={s.lastError ?? undefined}
                        >
                          {s.health === 'failing' || s.health === 'degraded'
                            ? (s.lastError ??
                              (s.lastSuccessAt
                                ? `Last worked ${timeAgo(s.lastSuccessAt)} — is the worker running?`
                                : 'Not fetched yet — is the worker running?'))
                            : s.lastSuccessAt
                              ? `Checked ${timeAgo(s.lastSuccessAt)}`
                              : ''}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {s.format === 'NONE' ? '—' : pollLabel(s.pollMinutes)}
                        {s.nextPollAt && s.isActive && s.format !== 'NONE' && (
                          <span
                            className="block text-xs text-muted-foreground"
                            title={formatDateTime(s.nextPollAt)}
                          >
                            {new Date(s.nextPollAt).getTime() <= Date.now()
                              ? 'Due now'
                              : `Next ${timeAgo(s.nextPollAt)}`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {USAGE[s.usage].label}
                        {s.allowAiDrafts && (
                          <Badge variant="secondary" className="ml-1.5">
                            AI drafts
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.waiting ? (
                          <Link
                            href={`/admin/inbox?source=${s.id}`}
                            className="font-medium hover:underline"
                          >
                            {s.waiting}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      {canUpdate && (
                        <TableCell>
                          {s.format !== 'NONE' && (
                            <Switch
                              checked={s.isActive}
                              disabled={busy === s.id}
                              onCheckedChange={(v) => void toggle(s, v)}
                              aria-label={`${s.name} active`}
                            />
                          )}
                        </TableCell>
                      )}
                      <TableCell className="pr-6">
                        <div className="flex items-center justify-end gap-1">
                          {canUpdate && s.format !== 'NONE' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void fetchNow(s)}
                              disabled={busy === s.id}
                            >
                              <RefreshCw
                                className={
                                  busy === s.id ? 'animate-spin' : undefined
                                }
                              />
                              <span className="hidden xl:inline">
                                Fetch now
                              </span>
                            </Button>
                          )}
                          {(canUpdate || canDelete) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`More for ${s.name}`}
                                >
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canUpdate && (
                                  <DropdownMenuItem
                                    onSelect={() => setEditing(s)}
                                  >
                                    <Pencil /> Edit
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setRemoving(s)}
                                  >
                                    <Trash2 /> Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Failed fetches</CardTitle>
              <CardDescription>
                The latest problems across all sources. A source that keeps
                failing is checked less often until it works again.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FetchHistory
                filters={{ status: 'FAILED' }}
                canRetry={canUpdate}
                showSource
                compact
              />
            </CardContent>
          </Card>
        </div>
      )}

      <SourceDialog open={adding} onOpenChange={setAdding} onSaved={refresh} />
      <SourceDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        source={editing}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.name ?? 'this source'}?`}
        description={
          <>
            <p>
              Its fetch history and the items it delivered are deleted too.
              Stories already started from its items keep their source credit.
            </p>
            <p>To stop fetching but keep everything, pause it instead.</p>
          </>
        }
        confirmLabel="Delete source"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await api(`staff/sources/${removing.id}`, { method: 'DELETE' });
          toast.success(`Deleted ${removing.name}.`);
          refresh();
        }}
      />
    </div>
  );
}
