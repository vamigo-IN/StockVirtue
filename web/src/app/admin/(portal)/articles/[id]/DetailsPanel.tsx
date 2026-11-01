'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Newspaper, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RelatedDialog } from '@/components/editor/EditorDialogs';
import { MediaPicker } from '@/components/portal/MediaPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/portal/api';
import {
  invalidateArticles,
  qk,
  useAuthors,
  useCategories,
  useTags,
} from '@/portal/queries';
import type { ArticleDetail, Category, Tag } from '@/portal/types';
import type { Draft, DraftKey } from './draft';

const SECTORS = [
  'Banking',
  'Financial Services',
  'IT',
  'Auto',
  'Pharma',
  'FMCG',
  'Energy',
  'Oil & Gas',
  'Metals',
  'Realty',
  'Telecom',
  'Infrastructure',
  'Capital Goods',
  'Consumer Durables',
  'Chemicals',
  'Media',
  'PSU',
];

type Change = <K extends DraftKey>(key: K, value: Draft[K]) => void;

function categoryPath(c: Category, all: Category[]): string {
  const parent = c.parentId ? all.find((x) => x.id === c.parentId) : null;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

function TagInput({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; name: string }[];
  onChange: (tags: { id: string; name: string }[]) => void;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const tags = useTags(text.trim());
  const suggestions = (tags.data ?? [])
    .filter((t) => !value.some((v) => v.id === t.id))
    .slice(0, 6);
  const exact = (tags.data ?? []).some(
    (t) => t.name.toLowerCase() === text.trim().toLowerCase(),
  );

  function add(t: { id: string; name: string }) {
    if (value.length >= 15) return toast.error('Up to 15 tags per article.');
    onChange([...value, { id: t.id, name: t.name }]);
    setText('');
  }

  async function create() {
    const name = text.trim();
    if (!name) return;
    try {
      const t = await api<Tag>('staff/tags', {
        method: 'POST',
        body: { name },
      });
      void qc.invalidateQueries({ queryKey: ['taxonomy', 'tags'] });
      add(t);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1 pr-1">
              {t.name}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v.id !== t.id))}
                  className="rounded-sm p-0.5 hover:bg-foreground/10"
                  aria-label={`Remove tag ${t.name}`}
                >
                  <X className="size-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
      {!disabled && (
        <div className="relative">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (
                  suggestions[0] &&
                  suggestions[0].name.toLowerCase() ===
                    text.trim().toLowerCase()
                ) {
                  add(suggestions[0]);
                } else if (text.trim()) void create();
              }
            }}
            placeholder="Add a tag (Enter)"
            aria-label="Add a tag"
          />
          {text.trim() && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {suggestions.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => add(t)}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {t.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t.articleCount}
                  </span>
                </button>
              ))}
              {!exact && (
                <button
                  type="button"
                  onClick={() => void create()}
                  className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-primary hover:bg-accent"
                >
                  <Plus className="size-3.5" /> Create “{text.trim()}”
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DetailsPanel({
  article,
  draft,
  change,
  editable,
  onArticle,
}: {
  article: ArticleDetail;
  draft: Draft;
  change: Change;
  editable: boolean;
  onArticle: (next: ArticleDetail) => void;
}) {
  const qc = useQueryClient();
  const categories = useCategories();
  const authors = useAuthors();
  const [pickImage, setPickImage] = useState(false);
  const [pickRelated, setPickRelated] = useState(false);
  const [sector, setSector] = useState('');
  const cats = useMemo(
    () =>
      (categories.data ?? [])
        .filter((c) => c.isActive || c.id === draft.categoryId)
        .map((c) => ({
          id: c.id,
          label: categoryPath(c, categories.data ?? []),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories.data, draft.categoryId],
  );

  async function setFlag(flag: 'isFeatured' | 'isBreaking', value: boolean) {
    try {
      const next = await api<ArticleDetail>(
        `staff/articles/${article.id}/flags`,
        {
          method: 'PUT',
          body: { [flag]: value },
        },
      );
      onArticle(next);
      qc.setQueryData(qk.article(article.id), next);
      invalidateArticles(qc);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function addSector(raw: string) {
    const s = raw.trim();
    if (!s || draft.sectors.includes(s)) return setSector('');
    if (draft.sectors.length >= 10) return toast.error('Up to 10 sectors.');
    change('sectors', [...draft.sectors, s]);
    setSector('');
  }

  return (
    <div className="space-y-4">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Story details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={draft.categoryId ?? 'none'}
              onValueChange={(v) =>
                change('categoryId', v === 'none' ? null : v)
              }
              disabled={!editable}
            >
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Byline</Label>
            <Select
              value={draft.authorId ?? 'none'}
              onValueChange={(v) => change('authorId', v === 'none' ? null : v)}
              disabled={!editable}
            >
              <SelectTrigger className="w-full" aria-label="Byline">
                <SelectValue placeholder="Choose a byline" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  No byline (StockVirtue Desk)
                </SelectItem>
                {(authors.data ?? [])
                  .filter((a) => a.isActive || a.id === draft.authorId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <TagInput
              value={draft.tags}
              onChange={(t) => change('tags', t)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sector-input">Sectors</Label>
            {draft.sectors.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {draft.sectors.map((s) => (
                  <Badge key={s} variant="outline" className="gap-1 pr-1">
                    {s}
                    {editable && (
                      <button
                        type="button"
                        onClick={() =>
                          change(
                            'sectors',
                            draft.sectors.filter((x) => x !== s),
                          )
                        }
                        className="rounded-sm p-0.5 hover:bg-foreground/10"
                        aria-label={`Remove sector ${s}`}
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            {editable && (
              <>
                <Input
                  id="sector-input"
                  list="sector-options"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSector(sector);
                    }
                  }}
                  placeholder="e.g. Banking (Enter)"
                  maxLength={40}
                />
                <datalist id="sector-options">
                  {SECTORS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
            <Label
              htmlFor="ai-flag"
              className="flex-col items-start gap-0.5 text-sm font-normal"
            >
              AI helped write this
              <span className="text-xs text-muted-foreground">
                Shown to readers as a label.
              </span>
            </Label>
            <Switch
              id="ai-flag"
              checked={draft.isAiGenerated}
              onCheckedChange={(v) => change('isAiGenerated', v)}
              disabled={!editable}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Featured image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {draft.featuredImage?.thumbUrl ? (
            <div className="overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.featuredImage.thumbUrl}
                alt={draft.featuredImage.alt}
                className="aspect-video w-full bg-muted object-cover"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Shown at the top of the story and when it is shared.
            </p>
          )}
          {editable && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPickImage(true)}
              >
                <ImagePlus /> {draft.featuredImage ? 'Change' : 'Choose image'}
              </Button>
              {draft.featuredImage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => change('featuredImage', null)}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
          {draft.featuredImage && (
            <Input
              value={draft.featuredImageCaption}
              onChange={(e) => change('featuredImageCaption', e.target.value)}
              placeholder="Caption"
              aria-label="Featured image caption"
              disabled={!editable}
              maxLength={500}
            />
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Related stories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.related.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Listed under the story. Up to 6.
            </p>
          )}
          {draft.related.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <Newspaper
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    change(
                      'related',
                      draft.related.filter((x) => x.id !== r.id),
                    )
                  }
                  className="rounded-sm p-0.5 text-muted-foreground hover:bg-accent"
                  aria-label={`Remove ${r.title}`}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {editable && draft.related.length < 6 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPickRelated(true)}
            >
              <Plus /> Add related story
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {draft.sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Credit where facts came from (exchange filings, agencies). Shown
              to readers.
            </p>
          )}
          {draft.sources.map((s, i) => (
            <div key={i} className="space-y-1.5 rounded-md border p-2">
              <div className="flex gap-1.5">
                <Input
                  value={s.name}
                  onChange={(e) =>
                    change(
                      'sources',
                      draft.sources.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder="Source, e.g. NSE filing"
                  aria-label="Source name"
                  disabled={!editable}
                  maxLength={120}
                />
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      change(
                        'sources',
                        draft.sources.filter((_, j) => j !== i),
                      )
                    }
                    aria-label="Remove source"
                  >
                    <X />
                  </Button>
                )}
              </div>
              <Input
                value={s.url ?? ''}
                onChange={(e) =>
                  change(
                    'sources',
                    draft.sources.map((x, j) =>
                      j === i ? { ...x, url: e.target.value } : x,
                    ),
                  )
                }
                placeholder="https://"
                aria-label="Source link"
                disabled={!editable}
                maxLength={500}
              />
            </div>
          ))}
          {editable && draft.sources.length < 10 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                change('sources', [...draft.sources, { name: '', url: '' }])
              }
            >
              <Plus /> Add source
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-sm">Internal notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={draft.editorialNotes}
            onChange={(e) => change('editorialNotes', e.target.value)}
            placeholder="For the newsroom only: embargoes, legal checks, follow-ups."
            rows={3}
            disabled={!editable}
            maxLength={5000}
          />
        </CardContent>
      </Card>

      {article.can.feature && (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-sm">Placement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="flag-featured" className="font-normal">
                Featured story
              </Label>
              <Switch
                id="flag-featured"
                checked={article.isFeatured}
                onCheckedChange={(v) => void setFlag('isFeatured', v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="flag-breaking" className="font-normal">
                Breaking news
              </Label>
              <Switch
                id="flag-breaking"
                checked={article.isBreaking}
                onCheckedChange={(v) => void setFlag('isBreaking', v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <MediaPicker
        open={pickImage}
        onOpenChange={setPickImage}
        title="Featured image"
        onPick={(asset) => {
          change('featuredImage', asset);
          if (!draft.featuredImageCaption && asset.caption) {
            change('featuredImageCaption', asset.caption);
          }
        }}
      />
      <RelatedDialog
        open={pickRelated}
        onOpenChange={setPickRelated}
        excludeId={article.id}
        title="Add a related story"
        onPick={(a) => {
          if (!draft.related.some((r) => r.id === a.id)) {
            change('related', [...draft.related, a]);
          }
        }}
      />
    </div>
  );
}
