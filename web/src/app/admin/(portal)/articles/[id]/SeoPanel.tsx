'use client';

import { Lock } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ArticleDetail } from '@/portal/types';
import type { Draft, DraftKey } from './draft';

type Change = <K extends DraftKey>(key: K, value: Draft[K]) => void;

function Count({ n, ideal }: { n: number; ideal: number }) {
  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        n > ideal ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {n}/{ideal}
    </span>
  );
}

const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export function SeoPanel({
  article,
  draft,
  change,
  editable,
}: {
  article: ArticleDetail;
  draft: Draft;
  change: Change;
  editable: boolean;
}) {
  const seo = draft.seo;
  const title = seo.title?.trim() || draft.title;
  const description = seo.description?.trim() || draft.summary;
  const slugLocked = !!article.firstPublishedAt;
  const set = (patch: Partial<Draft['seo']>) =>
    change('seo', { ...seo, ...patch });

  return (
    <div className="space-y-4">
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-sm">Search result preview</CardTitle>
          <CardDescription>Roughly how Google shows the story.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-background p-3">
            <p className="truncate text-xs text-muted-foreground">
              stockvirtue.com › news › {draft.slug}
            </p>
            <p className="mt-0.5 line-clamp-2 text-base leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
              {title || 'Headline'}
            </p>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {description || 'The summary or meta description appears here.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Search & sharing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seo-slug" className="flex items-center gap-1.5">
              Web address{' '}
              {slugLocked && (
                <Lock className="size-3 text-muted-foreground" aria-hidden />
              )}
            </Label>
            <div className="flex items-center rounded-md border bg-muted/40 pl-2.5 text-sm">
              <span className="shrink-0 text-muted-foreground">/news/</span>
              <Input
                id="seo-slug"
                value={draft.slug}
                onChange={(e) => change('slug', slugify(e.target.value))}
                disabled={!editable || slugLocked}
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
            {slugLocked && (
              <p className="text-xs text-muted-foreground">
                Locked after first publishing so links keep working.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-title">SEO title</Label>
              <Count n={(seo.title ?? '').length} ideal={60} />
            </div>
            <Input
              id="seo-title"
              value={seo.title ?? ''}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={draft.title}
              disabled={!editable}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="seo-desc">Meta description</Label>
              <Count n={(seo.description ?? '').length} ideal={160} />
            </div>
            <Textarea
              id="seo-desc"
              value={seo.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={draft.summary || 'Defaults to the summary.'}
              rows={3}
              disabled={!editable}
              maxLength={320}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo-canonical">Canonical URL</Label>
            <Input
              id="seo-canonical"
              value={seo.canonicalUrl ?? ''}
              onChange={(e) => set({ canonicalUrl: e.target.value })}
              placeholder="Only if this story first ran elsewhere"
              disabled={!editable}
              maxLength={500}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="seo-noindex" className="font-normal">
              Hide from search engines
            </Label>
            <Switch
              id="seo-noindex"
              checked={!!seo.noIndex}
              onCheckedChange={(v) => set({ noIndex: v })}
              disabled={!editable}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
