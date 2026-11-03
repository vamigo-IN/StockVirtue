'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/portal/api';
import { formatBytes } from '@/portal/format';
import {
  IMAGE_TYPES,
  uploadedMessage,
  uploadImage,
} from '@/portal/media-upload';
import { useMedia } from '@/portal/queries';
import type { MediaAsset } from '@/portal/types';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Upload images from a file list, one by one; returns the ones that made it. */
export async function uploadFiles(
  files: File[],
  onStart: (name: string) => void,
  onEnd: (name: string) => void,
): Promise<MediaAsset[]> {
  const done: MediaAsset[] = [];
  for (const file of files) {
    onStart(file.name);
    try {
      done.push(await uploadImage(file));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      onEnd(file.name);
    }
  }
  return done;
}

/** Choose an image from the media library, or upload one and use it. */
export function MediaPicker({
  open,
  onOpenChange,
  onPick,
  title = 'Choose an image',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (asset: MediaAsset) => void;
  title?: string;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useDebounced(text.trim(), 300);
  const media = useMedia(q, open);
  const [uploading, setUploading] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const items = media.data?.pages.flatMap((p) => p.items) ?? [];
  const first = media.data?.pages[0];

  async function onFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const done = await uploadFiles(
      files,
      (n) => setUploading((u) => [...u, n]),
      (n) => setUploading((u) => u.filter((x) => x !== n)),
    );
    if (!done.length) return;
    void qc.invalidateQueries({ queryKey: ['media'] });
    toast.success(uploadedMessage(done));
    if (done.length === 1 && files.length === 1) {
      onPick(done[0]);
      onOpenChange(false);
    }
  }

  function pick(asset: MediaAsset) {
    onPick(asset);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Pick from the media library or upload a new image (JPEG, PNG, WebP,
            GIF or AVIF{first ? `, up to ${formatBytes(first.maxBytes)}` : ''}).
            Location and camera details are removed on upload.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search by alt text, caption or file name"
              className="pl-9"
              aria-label="Search images"
            />
          </div>
          <Button type="button" onClick={() => fileInput.current?.click()}>
            <Upload /> Upload
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
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void onFiles(e.dataTransfer.files);
          }}
          className={cn(
            'max-h-[55vh] min-h-48 overflow-y-auto rounded-lg border border-dashed p-3 transition-colors',
            dragging && 'border-primary bg-primary/5',
          )}
        >
          {items.length === 0 && uploading.length === 0 ? (
            <div className="grid h-40 place-items-center text-center text-sm text-muted-foreground">
              {media.isPending
                ? 'Loading the library…'
                : q
                  ? 'No images match that search.'
                  : 'No images yet. Drop files here or use Upload.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {uploading.map((name) => (
                <div
                  key={name}
                  className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border bg-muted/40 p-2 text-center text-xs text-muted-foreground"
                >
                  <Loader2 className="size-5 animate-spin" />
                  <span className="line-clamp-2 break-all">{name}</span>
                </div>
              ))}
              {items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => pick(a)}
                  className="group overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                  <span className="block truncate px-2 py-1.5 text-xs">
                    {a.alt || a.originalName || 'Untitled image'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {media.hasNextPage && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void media.fetchNextPage()}
                disabled={media.isFetchingNextPage}
              >
                {media.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
