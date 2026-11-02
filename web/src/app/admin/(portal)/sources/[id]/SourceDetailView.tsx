'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  Inbox,
  Pause,
  Pencil,
  Play,
  RefreshCw,
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
import { QueryError, RowsSkeleton } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { qk, useSource } from '@/portal/queries';

/** One news source: its settings, health and full fetch history. */
export function SourceDetailView({ id }: { id: string }) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const source = useSource(id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canUpdate = can(me, 'sources.update');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.sources });
  };

  async function fetchNow() {
    setBusy(true);
    try {
      await api(`staff/sources/${id}/fetch`, { method: 'POST' });
      toast.success('Fetching now. The result appears in the history below.');
      setTimeout(refresh, 4_000);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(isActive: boolean) {
    setBusy(true);
    try {
      await api(`staff/sources/${id}`, { method: 'PATCH', body: { isActive } });
      toast.success(isActive ? 'Source resumed.' : 'Source paused.');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (source.error) {
    return (
      <QueryError error={source.error} onRetry={() => void source.refetch()} />
    );
  }
  const s = source.data;
  if (!s) return <RowsSkeleton rows={6} />;
  const fetched = s.format !== 'NONE';

  const facts: [string, React.ReactNode][] = [
    ['Kind', sourceTypeLabel(s.type)],
    [
      'Address',
      s.url ? (
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 break-all hover:underline"
        >
          {s.url} <ExternalLink className="size-3 shrink-0" />
        </a>
      ) : (
        'Items are added by staff'
      ),
    ],
    [
      'API key',
      s.auth.mode === 'none'
        ? 'None'
        : `${s.hasSecret ? 'Saved' : 'Missing'} (${s.auth.mode === 'header' ? `header ${s.auth.name}` : `parameter ${s.auth.name}`})`,
    ],
    ['Schedule', fetched ? pollLabel(s.pollMinutes) : '—'],
    ['What we keep', USAGE[s.usage].label],
    ['AI drafts', s.allowAiDrafts ? 'Allowed by its terms' : 'Not allowed'],
    ['Credit on stories', s.attribution || s.name],
    ['Default category', s.category?.name ?? 'Suggested from the topic'],
    [
      'Emails editors',
      s.notifyEditors ? 'Yes, at most every 30 minutes' : 'No',
    ],
    [
      'Last success',
      s.lastSuccessAt
        ? `${timeAgo(s.lastSuccessAt)} (${formatDateTime(s.lastSuccessAt)})`
        : 'Never',
    ],
    [
      'Next check',
      fetched && s.isActive && s.nextPollAt
        ? formatDateTime(s.nextPollAt)
        : '—',
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/admin/sources">
            <ArrowLeft /> News sources
          </Link>
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/inbox?source=${id}&status=ALL`}>
            <Inbox /> Its items{s.total ? ` (${s.total})` : ''}
          </Link>
        </Button>
        {canUpdate && fetched && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void setActive(!s.isActive)}
              disabled={busy}
            >
              {s.isActive ? <Pause /> : <Play />}{' '}
              {s.isActive ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchNow()}
              disabled={busy}
            >
              <RefreshCw className={busy ? 'animate-spin' : undefined} /> Fetch
              now
            </Button>
          </>
        )}
        {canUpdate && (
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{s.name}</h1>
        <div className="mt-1">
          <HealthBadge health={s.health} />
        </div>
      </div>

      {s.lastError && (s.health === 'failing' || s.health === 'degraded') && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>
            The last{' '}
            {s.consecutiveFailures > 1
              ? `${s.consecutiveFailures} fetches`
              : 'fetch'}{' '}
            failed
          </AlertTitle>
          <AlertDescription>
            <p>{s.lastError}</p>
            {s.consecutiveFailures > 1 && (
              <p>It is checked less often until it works again.</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!s.lastError && s.health === 'degraded' && (
        <Alert>
          <AlertCircle />
          <AlertDescription>
            This source hasn’t been checked on schedule. Check that the newsroom
            worker is running.
          </AlertDescription>
        </Alert>
      )}
      {s.hasSecret && !s.secretReadable && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            The saved API key can’t be read any more (the secrets key changed).
            Edit the source and enter the key again.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="min-w-0">{v}</dd>
                </div>
              ))}
              {s.licenceNote && (
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Licence notes
                  </dt>
                  <dd className="whitespace-pre-line">{s.licenceNote}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fetch history</CardTitle>
            <CardDescription>
              Every check of this source in the last 60 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fetched ? (
              <FetchHistory filters={{ sourceId: id }} canRetry={canUpdate} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Manual sources aren’t fetched: staff add their items from
                Incoming news.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <SourceDialog
        open={editing}
        onOpenChange={setEditing}
        source={s}
        onSaved={() => {
          refresh();
          void source.refetch();
        }}
      />
    </div>
  );
}
