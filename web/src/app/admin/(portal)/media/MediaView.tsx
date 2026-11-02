'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Copy, ImageIcon, Loader2, Search, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { uploadFiles } from '@/components/portal/MediaPicker';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatBytes, formatDateTime } from '@/portal/format';
import { IMAGE_TYPES } from '@/portal/media-upload';
import { useMedia } from '@/portal/queries';
import type { MediaAsset } from '@/portal/types';

function Details({
  asset,
  onClose,
}: {
  asset: MediaAsset;
  onClose: () => void;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const [alt, setAlt] = useState(asset.alt);
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [credit, setCredit] = useState(asset.credit ?? '');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mayChange = asset.uploadedBy?.id === me.id || can(me, 'media.manage');

  async function save() {
    setBusy(true);
    try {
      await api(`staff/media/${asset.id}`, {
        method: 'PATCH',
        body: { alt, caption, credit },
      });
      void qc.invalidateQueries({ queryKey: ['media'] });
      toast.success('Image details saved.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">
            {asset.originalName ?? 'Image'}
          </SheetTitle>
          <SheetDescription>
            {asset.width}×{asset.height} · {formatBytes(asset.bytes)} · uploaded
            by {asset.uploadedBy?.displayName ?? 'someone'} on{' '}
            {formatDateTime(asset.createdAt)}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {asset.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={asset.url}
              alt={asset.alt}
              className="w-full rounded-lg border bg-muted"
            />
          )}
          <div className="space-y-2">
            <Label htmlFor="m-alt">Alt text</Label>
            <Textarea
              id="m-alt"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe what the image shows, for people using screen readers"
              rows={2}
              maxLength={300}
              disabled={!mayChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-caption">Default caption</Label>
            <Input
              id="m-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={500}
              disabled={!mayChange}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-credit">Credit</Label>
            <Input
              id="m-credit"
              value={credit}
              onChange={(e) => setCredit(e.target.value)}
              placeholder="e.g. Reuters / NSE"
              maxLength={200}
              disabled={!mayChange}
            />
          </div>
          {asset.url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(asset.url!);
                toast.success('Image address copied.');
              }}
            >
              <Copy /> Copy image address
            </Button>
          )}
        </div>
        {mayChange && (
          <SheetFooter className="flex-row justify-between border-t">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleting(true)}
            >
              <Trash2 /> Delete
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save details'}
            </Button>
          </SheetFooter>
        )}
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title="Delete this image?"
          description="It is removed from the library and storage. Images used in articles can't be deleted."
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            await api(`staff/media/${asset.id}`, { method: 'DELETE' });
            void qc.invalidateQueries({ queryKey: ['media'] });
            toast.success('Image deleted.');
            onClose();
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export function MediaView() {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [open, setOpen] = useState<MediaAsset | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const media = useMedia(q);
  const items = media.data?.pages.flatMap((p) => p.items) ?? [];
  const first = media.data?.pages[0];
  const enabled = first?.enabled ?? true;

  async function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const done = await uploadFiles(
      files,
      (n) => setUploading((u) => [...u, n]),
      (n) => setUploading((u) => u.filter((x) => x !== n)),
    );
    if (done.length) {
      void qc.invalidateQueries({ queryKey: ['media'] });
      toast.success(
        `Uploaded ${done.length} image${done.length === 1 ? '' : 's'}.`,
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Media library"
        description="Images for stories. Each upload is checked, cleaned of location and camera details, and resized for fast pages."
        actions={
          <>
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={!enabled}
            >
              <Upload /> Upload images
            </Button>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept={IMAGE_TYPES.join(',')}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        }
      />
      {!enabled && (
        <Alert className="mb-4">
          <ImageIcon />
          <AlertDescription>
            Media uploads aren&apos;t set up yet. Ask an admin to configure
            Cloudflare R2 (MEDIA_STORAGE_DRIVER=r2 and the R2 keys).
          </AlertDescription>
        </Alert>
      )}
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search alt text, captions, file names"
          className="pl-9"
          aria-label="Search images"
        />
      </div>
      <div
        onDragOver={(e) => {
          if (!enabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (enabled) void onFiles(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-xl transition-colors',
          dragging && 'bg-primary/5 ring-2 ring-primary ring-dashed',
        )}
      >
        {media.error ? (
          <QueryError
            error={media.error}
            onRetry={() => void media.refetch()}
          />
        ) : media.isPending ? (
          <RowsSkeleton rows={4} />
        ) : items.length === 0 && uploading.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title={q ? 'No images match that search' : 'No images yet'}
          >
            {enabled && !q && 'Drop images here or use Upload images.'}
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {uploading.map((name) => (
              <div
                key={name}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl border bg-muted/40 p-2 text-center text-xs text-muted-foreground"
              >
                <Loader2 className="size-5 animate-spin" />
                <span className="line-clamp-2 break-all">{name}</span>
              </div>
            ))}
            {items.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setOpen(a)}
                className="group overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:ring-2 hover:ring-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {a.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.thumbUrl}
                    alt={a.alt}
                    loading="lazy"
                    className="aspect-[4/3] w-full bg-muted object-cover"
                  />
                )}
                <span className="block px-2.5 py-2">
                  <span
                    className={cn(
                      'block truncate text-xs font-medium',
                      !a.alt && 'text-warning',
                    )}
                  >
                    {a.alt || 'No alt text yet'}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {a.width}×{a.height} · {formatBytes(a.bytes)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {media.hasNextPage && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="outline"
            onClick={() => void media.fetchNextPage()}
            disabled={media.isFetchingNextPage}
          >
            {media.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
      {open && (
        <Details key={open.id} asset={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
