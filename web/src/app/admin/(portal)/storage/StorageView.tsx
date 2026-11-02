'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  HardDrive,
  Loader2,
  MinusCircle,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatCard,
} from '@/components/portal/common';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { api, ApiError, errorMessage } from '@/portal/api';
import { formatBytes, formatDateTime, timeAgo } from '@/portal/format';
import { qk, useMediaStorage } from '@/portal/queries';
import type {
  MediaStorageView,
  StorageCheck,
  StorageCheckStep,
} from '@/portal/types';

interface Form {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  /** Write-only: blank keeps the saved one. */
  secretAccessKey: string;
  endpoint: string;
  uploadToR2: boolean;
}

interface ShownCheck {
  ok: boolean;
  steps: StorageCheckStep[];
  at: string;
}

const fromView = (v: MediaStorageView): Form => ({
  accountId: v.r2.accountId,
  bucket: v.r2.bucket,
  accessKeyId: v.r2.accessKeyId,
  secretAccessKey: '',
  endpoint: v.r2.endpoint,
  uploadToR2: v.r2.uploadToR2,
});

const shown = (c: StorageCheck): ShownCheck => ({
  ok: c.ok,
  steps: c.steps,
  at: c.checkedAt,
});

/** The connection as typed; a blank secret keeps the saved one. */
function connection(f: Form) {
  const secret = f.secretAccessKey.trim();
  return {
    accountId: f.accountId.trim(),
    bucket: f.bucket.trim(),
    accessKeyId: f.accessKeyId.trim(),
    endpoint: f.endpoint.trim(),
    ...(secret ? { secretAccessKey: secret } : {}),
  };
}

/** What to paste under the bucket's Settings → CORS policy. */
function corsPolicy(origin: string) {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ['PUT', 'GET'],
        AllowedHeaders: ['content-type'],
        MaxAgeSeconds: 3600,
      },
    ],
    null,
    2,
  );
}

function StepIcon({ ok }: { ok: boolean | null }) {
  if (ok === true) {
    return (
      <CheckCircle2
        className="mt-0.5 size-4 shrink-0 text-success"
        aria-label="Passed"
      />
    );
  }
  if (ok === false) {
    return (
      <XCircle
        className="mt-0.5 size-4 shrink-0 text-destructive"
        aria-label="Failed"
      />
    );
  }
  return (
    <MinusCircle
      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      aria-label="Not run"
    />
  );
}

function CheckSteps({ check }: { check: ShownCheck }) {
  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 text-sm">
        <span className="font-medium">
          {check.ok ? 'Connection check passed' : 'Connection check failed'}
        </span>
        <span
          className="text-xs text-muted-foreground"
          title={formatDateTime(check.at)}
        >
          {timeAgo(check.at)}
        </span>
      </div>
      <ol className="divide-y">
        {check.steps.map((s) => (
          <li key={s.key} className="flex gap-3 px-4 py-2.5 text-sm">
            <StepIcon ok={s.ok} />
            <div className="min-w-0">
              <p className={cn(s.ok === null && 'text-muted-foreground')}>
                {s.label}
              </p>
              {s.detail && (
                <p className="mt-0.5 text-xs break-words text-destructive">
                  {s.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function StorageView() {
  const qc = useQueryClient();
  const query = useMediaStorage();
  const view = query.data;
  const [form, setForm] = useState<Form | null>(null);
  const [check, setCheck] = useState<ShownCheck | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (view && !form) {
      setForm(fromView(view));
      setCheck(view.lastCheck);
      setAdvanced(!!view.r2.endpoint);
    }
  }, [view, form]);

  const dirty = useMemo(
    () =>
      !!form &&
      !!view &&
      (!!form.secretAccessKey.trim() ||
        JSON.stringify(connection(form)) !==
          JSON.stringify(connection(fromView(view))) ||
        form.uploadToR2 !== view.r2.uploadToR2),
    [form, view],
  );

  if (query.error) {
    return (
      <>
        <PageHeader title="Media storage" />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!form || !view) {
    return (
      <>
        <PageHeader title="Media storage" />
        <RowsSkeleton rows={6} />
      </>
    );
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  async function runCheck() {
    if (!form) return;
    setBusy('check');
    try {
      const res = await api<StorageCheck>('staff/media-storage/check', {
        method: 'POST',
        body: connection(form),
      });
      setCheck(shown(res));
      void qc.invalidateQueries({ queryKey: qk.mediaStorage });
      if (res.ok) toast.success('Every check passed.');
      else toast.error('The connection check failed. See the steps below.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!form) return;
    setBusy('save');
    try {
      const res = await api<{
        settings: MediaStorageView;
        check: StorageCheck | null;
      }>('staff/media-storage', {
        method: 'PUT',
        body: { ...connection(form), uploadToR2: form.uploadToR2 },
      });
      qc.setQueryData(qk.mediaStorage, res.settings);
      setForm(fromView(res.settings));
      if (res.check) setCheck(shown(res.check));
      void qc.invalidateQueries({ queryKey: ['media'] });
      void qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success(
        res.settings.uploadsTo === 'R2'
          ? 'Saved. New uploads go to Cloudflare R2.'
          : 'Saved. New uploads are kept on this server.',
      );
    } catch (err) {
      // A refused save carries the check that failed.
      const failed =
        err instanceof ApiError
          ? (err.body as { message?: { check?: StorageCheck } } | null)?.message
              ?.check
          : undefined;
      if (failed) setCheck(shown(failed));
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const res = await api<MediaStorageView>('staff/media-storage', {
      method: 'DELETE',
    });
    qc.setQueryData(qk.mediaStorage, res);
    setForm(fromView(res));
    setCheck(null);
    setAdvanced(false);
    void qc.invalidateQueries({ queryKey: ['media'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
    toast.success(
      'The Cloudflare R2 connection was removed. New uploads are kept on this server.',
    );
  }

  async function copyPolicy() {
    try {
      await navigator.clipboard.writeText(corsPolicy(view!.uploadOrigin));
      toast.success('CORS policy copied.');
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  const saved = view.r2.connected || view.r2.hasSecret || !!view.r2.bucket;
  const status = view.r2.problem
    ? {
        label: 'Needs attention',
        className: 'border-destructive/40 text-destructive',
      }
    : view.r2.connected
      ? view.uploadsTo === 'R2'
        ? { label: 'In use', className: 'border-success/40 text-success' }
        : { label: 'Connected, not used for uploads', className: '' }
      : { label: 'Not connected', className: 'text-muted-foreground' };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Media storage"
        description={
          <>
            Where uploaded images are kept. Wherever they are stored, readers
            load them from{' '}
            <span className="font-mono text-xs break-words">
              {view.publicBaseUrl}
            </span>
            , so their links never change.
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="New uploads go to"
          value={view.uploadsTo === 'R2' ? 'Cloudflare R2' : 'This server'}
          icon={view.uploadsTo === 'R2' ? Cloud : HardDrive}
          hint={
            view.uploadsTo === 'R2'
              ? `Bucket ${view.r2.bucket}`
              : 'Until R2 is connected and switched on'
          }
        />
        <StatCard
          label="Images on this server"
          value={view.images.server}
          icon={HardDrive}
          tone={view.server.writable ? 'default' : 'danger'}
          hint={
            view.server.freeBytes !== null
              ? `${formatBytes(view.server.freeBytes)} free on the disk`
              : undefined
          }
        />
        <StatCard
          label="Images in Cloudflare R2"
          value={view.images.r2}
          icon={Cloud}
        />
      </div>

      {!view.server.writable && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>This server can&apos;t store uploads</AlertTitle>
          <AlertDescription>{view.server.problem}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Cloudflare R2
            <Badge
              variant="outline"
              className={cn('font-medium', status.className)}
            >
              {status.label}
            </Badge>
          </CardTitle>
          <CardDescription>
            Keep images in your own R2 bucket. The bucket stays private and
            needs no custom domain: the portal uploads to it with short-lived
            signed links, and this server fetches images from it for readers.
            {view.updatedAt && (
              <span title={formatDateTime(view.updatedAt)}>
                {' '}
                Last changed {timeAgo(view.updatedAt)}
                {view.updatedBy ? ` by ${view.updatedBy}` : ''}.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {view.r2.problem && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>{view.r2.problem}</AlertDescription>
            </Alert>
          )}
          <fieldset
            disabled={busy !== null}
            className="grid gap-5 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label htmlFor="accountId">Account ID</Label>
              <Input
                id="accountId"
                value={form.accountId}
                onChange={(e) => set('accountId', e.target.value)}
                placeholder="32 characters, e.g. 4f1c…9b2e"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                On the R2 overview page. You can also paste the bucket&apos;s S3
                API address.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bucket">Bucket name</Label>
              <Input
                id="bucket"
                value={form.bucket}
                onChange={(e) => set('bucket', e.target.value)}
                placeholder="stockvirtue-media"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accessKeyId">Access key ID</Label>
              <Input
                id="accessKeyId"
                value={form.accessKeyId}
                onChange={(e) => set('accessKeyId', e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secretAccessKey">Secret access key</Label>
              <Input
                id="secretAccessKey"
                type="password"
                value={form.secretAccessKey}
                onChange={(e) => set('secretAccessKey', e.target.value)}
                placeholder={
                  view.r2.hasSecret ? 'Saved. Leave blank to keep it.' : ''
                }
                autoComplete="new-password"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                From an R2 API token with Object Read &amp; Write on this
                bucket. Stored encrypted and never shown again.
              </p>
            </div>
            {advanced ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="endpoint">Endpoint (optional)</Label>
                <Input
                  id="endpoint"
                  value={form.endpoint}
                  onChange={(e) => set('endpoint', e.target.value)}
                  placeholder="https://<account id>.eu.r2.cloudflarestorage.com"
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  Only for a bucket in a jurisdiction such as the EU. Blank =
                  https://&lt;account id&gt;.r2.cloudflarestorage.com.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdvanced(true)}
                className="justify-self-start text-sm text-primary underline-offset-4 hover:underline md:col-span-2"
              >
                Bucket in the EU jurisdiction? Set its endpoint
              </button>
            )}
          </fieldset>

          <div className="flex items-start gap-3 rounded-lg border p-4">
            <Switch
              id="uploadToR2"
              checked={form.uploadToR2}
              onCheckedChange={(c) => set('uploadToR2', c)}
              disabled={busy !== null}
              className="mt-0.5"
            />
            <div className="space-y-1">
              <Label htmlFor="uploadToR2">Use R2 for new uploads</Label>
              <p className="text-xs text-muted-foreground">
                Saving with this on runs the connection check first. Off: new
                uploads stay on this server. Images already in R2 keep loading
                either way.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void runCheck()}
              disabled={busy !== null}
            >
              {busy === 'check' && <Loader2 className="animate-spin" />}
              {busy === 'check' ? 'Checking…' : 'Check connection'}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={busy !== null || !dirty}
            >
              {busy === 'save' && <Loader2 className="animate-spin" />}
              {busy === 'save' ? 'Saving…' : 'Save'}
            </Button>
            {saved && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive sm:ml-auto"
                onClick={() => setRemoving(true)}
                disabled={busy !== null || view.images.r2 > 0}
                title={
                  view.images.r2 > 0
                    ? 'Images in R2 load through this connection'
                    : undefined
                }
              >
                <Trash2 /> Remove connection
              </Button>
            )}
          </div>
          {saved && view.images.r2 > 0 && (
            <p className="text-xs text-muted-foreground">
              {view.images.r2} image{view.images.r2 === 1 ? ' is' : 's are'}{' '}
              stored in R2 and load through this connection, so it can&apos;t be
              removed. Turn off &ldquo;Use R2 for new uploads&rdquo; to keep new
              images on this server instead.
            </p>
          )}
          {check && <CheckSteps check={check} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bucket CORS policy</CardTitle>
          <CardDescription>
            Browsers upload straight to the bucket from{' '}
            <span className="font-mono text-xs">{view.uploadOrigin}</span>, so
            the bucket must allow it. In Cloudflare open R2, then your bucket,
            then Settings, and under CORS policy add:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-xs leading-relaxed">
            {corsPolicy(view.uploadOrigin)}
          </pre>
          <Button variant="outline" size="sm" onClick={() => void copyPolicy()}>
            <Copy /> Copy policy
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This server</CardTitle>
          <CardDescription>
            Uploads made while R2 isn&apos;t in use, kept on the API
            server&apos;s disk.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Folder</dt>
            <dd className="font-mono text-xs break-all">{view.server.dir}</dd>
            <dt className="text-muted-foreground">Free space</dt>
            <dd>
              {view.server.freeBytes !== null
                ? formatBytes(view.server.freeBytes)
                : 'Unknown'}
            </dd>
            <dt className="text-muted-foreground">Largest upload</dt>
            <dd>{formatBytes(view.maxUploadBytes)}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            Include this folder in the server&apos;s backups. These uploads pass
            through nginx, so on both stockvirtue.com and api.stockvirtue.com
            its client_max_body_size must allow at least{' '}
            {formatBytes(view.maxUploadBytes)}.
          </p>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title="Remove the Cloudflare R2 connection?"
        description={
          <p>
            New uploads will be kept on this server. The keys are deleted from
            StockVirtue; the bucket and anything in it are left as they are.
          </p>
        }
        confirmLabel="Remove connection"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
