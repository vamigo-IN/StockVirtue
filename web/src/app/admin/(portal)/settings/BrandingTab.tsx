'use client';

import { ImageIcon, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { MediaPicker } from '@/components/portal/MediaPicker';
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
import { cn } from '@/lib/utils';
import type { SiteConfigView, SiteImageRef } from '@/portal/types';
import { SaveRow, useGroupForm } from './config-form';

type Slot = 'logoMediaId' | 'faviconMediaId' | 'shareImageMediaId';

const SLOTS: {
  key: Slot;
  title: string;
  hint: string;
  fallback: string;
  preview: string;
}[] = [
  {
    key: 'logoMediaId',
    title: 'Logo',
    hint: 'Shown in the website header and the menu. The dark footer uses the built-in light version. A wide PNG with a transparent background works best (about 300 × 64 px).',
    fallback: '/logo.png',
    preview: 'h-12 w-auto max-w-full',
  },
  {
    key: 'faviconMediaId',
    title: 'Favicon',
    hint: 'The icon in browser tabs, bookmarks and phone home screens. Use a square PNG of at least 512 × 512 px.',
    fallback: '/icon.png',
    preview: 'size-16 rounded-md',
  },
  {
    key: 'shareImageMediaId',
    title: 'Social share image',
    hint: 'Shown when a page without its own picture is shared on WhatsApp, X, LinkedIn or Facebook. Use 1200 × 630 px.',
    fallback: '/og.png',
    preview: 'aspect-[1200/630] w-full max-w-sm rounded-md object-cover',
  },
];

export function BrandingTab({
  view,
  canEdit,
}: {
  view: SiteConfigView;
  canEdit: boolean;
}) {
  const g = useGroupForm(view, 'branding');
  // Images picked in this session, before the save resolves them.
  const [picked, setPicked] = useState<Record<string, SiteImageRef>>({});
  const [picking, setPicking] = useState<Slot | null>(null);
  const imageFor = (id: string | null) =>
    id ? (picked[id] ?? view.images[id] ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        {SLOTS.map((slot) => {
          const id = g.form[slot.key];
          const image = imageFor(id);
          return (
            <Card key={slot.key}>
              <CardHeader>
                <CardTitle>{slot.title}</CardTitle>
                <CardDescription>{slot.hint}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex min-h-28 items-center justify-center rounded-lg border bg-muted/40 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image?.url ?? slot.fallback}
                    alt=""
                    className={cn('object-contain', slot.preview)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {image
                    ? `From the media library${image.width ? `, ${image.width} × ${image.height} px` : ''}.`
                    : 'The built-in image.'}
                </p>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPicking(slot.key)}
                      disabled={g.busy}
                    >
                      <ImageIcon /> Choose image
                    </Button>
                    {id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => g.set(slot.key, null)}
                        disabled={g.busy}
                      >
                        <RotateCcw /> Use built-in
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Theme colour</CardTitle>
          <CardDescription>
            Colours the browser&apos;s address bar on phones and the installed
            web app. Leave it blank to keep the site&apos;s own colours.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Theme colour"
            value={g.form.themeColor || '#16a34a'}
            onChange={(e) => g.set('themeColor', e.target.value)}
            disabled={!canEdit || g.busy}
            className="h-9 w-14 cursor-pointer rounded-md border bg-background p-1 disabled:cursor-not-allowed"
          />
          <div className="w-36 space-y-1">
            <Label htmlFor="themeColor" className="sr-only">
              Colour code
            </Label>
            <Input
              id="themeColor"
              value={g.form.themeColor}
              onChange={(e) => g.set('themeColor', e.target.value.trim())}
              placeholder="#16a34a"
              maxLength={7}
              disabled={!canEdit || g.busy}
              className="font-mono"
            />
          </div>
          {canEdit && g.form.themeColor && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => g.set('themeColor', '')}
              disabled={g.busy}
            >
              <RotateCcw /> Use the site&apos;s own
            </Button>
          )}
        </CardContent>
      </Card>

      <SaveRow
        canEdit={canEdit}
        permission="settings.update"
        dirty={g.dirty}
        busy={g.busy}
        onSave={() =>
          void g.save('Saved. The website shows the new branding now.')
        }
        onDiscard={g.reset}
      />

      <MediaPicker
        open={picking !== null}
        onOpenChange={(o) => !o && setPicking(null)}
        title={
          picking
            ? `Choose the ${SLOTS.find((s) => s.key === picking)?.title.toLowerCase()}`
            : ''
        }
        onPick={(asset) => {
          if (!picking || !asset.url) return;
          setPicked((p) => ({
            ...p,
            [asset.id]: {
              id: asset.id,
              url: asset.url!,
              width: asset.width,
              height: asset.height,
            },
          }));
          g.set(picking, asset.id);
          setPicking(null);
        }}
      />
    </div>
  );
}
