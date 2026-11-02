'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  FolderTree,
  Info,
  type LucideIcon,
  Newspaper,
  Plus,
  Smartphone,
  Star,
  Trash2,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { cn } from '@/lib/utils';
import { api, ApiError, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { qk, useHomepage } from '@/portal/queries';
import type {
  HomeSectionConfig,
  HomeSectionType,
  HomepageView as HomepageData,
} from '@/portal/types';

const TYPES: Record<
  HomeSectionType,
  { label: string; icon: LucideIcon; description: string; single: boolean }
> = {
  breaking: {
    label: 'Breaking news banner',
    icon: Zap,
    description:
      'Stories marked Breaking in the last 24 hours, in a strip across the top.',
    single: true,
  },
  featured: {
    label: 'Featured stories',
    icon: Star,
    description:
      'A lead story with a column beside it. Stories marked Featured come first, topped up with the latest.',
    single: true,
  },
  latest: {
    label: 'Top stories',
    icon: Newspaper,
    description: 'The newest stories not already shown above.',
    single: true,
  },
  category: {
    label: 'Category',
    icon: FolderTree,
    description: 'The latest stories from one category and its sub-categories.',
    single: false,
  },
  trending: {
    label: 'Trending',
    icon: TrendingUp,
    description:
      'Most read today and yesterday. Stays hidden until stories have readers.',
    single: true,
  },
  app_promo: {
    label: 'App promotion',
    icon: Smartphone,
    description:
      'A banner for the StockVirtue app, using the Google Play link from Site settings.',
    single: true,
  },
};

const DEFAULT_TITLES: Record<HomeSectionType, string> = {
  breaking: 'Breaking',
  featured: 'Featured',
  latest: 'Top stories',
  category: 'Category',
  trending: 'Trending',
  app_promo: 'Practise with StockVirtue',
};

function sameLayout(a: HomeSectionConfig[], b: HomeSectionConfig[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function freeId(base: string, taken: Set<string>) {
  const root = base.replace(/[^a-z0-9-]+/g, '-').slice(0, 32) || 'section';
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

export function HomepageView() {
  const qc = useQueryClient();
  const query = useHomepage();
  const [sections, setSections] = useState<HomeSectionConfig[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.data && !sections) setSections(query.data.sections);
  }, [query.data, sections]);

  const dirty = useMemo(
    () =>
      !!sections && !!query.data && !sameLayout(sections, query.data.sections),
    [sections, query.data],
  );

  if (query.error) {
    return (
      <>
        <PageHeader title="News homepage" />
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!sections || !query.data) {
    return (
      <>
        <PageHeader title="News homepage" />
        <RowsSkeleton rows={6} />
      </>
    );
  }
  const data = query.data;

  const update = (i: number, patch: Partial<HomeSectionConfig>) =>
    setSections((list) =>
      list ? list.map((s, j) => (j === i ? { ...s, ...patch } : s)) : list,
    );
  const move = (i: number, by: -1 | 1) =>
    setSections((list) => {
      if (!list) return list;
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item);
      return next;
    });
  const remove = (i: number) =>
    setSections((list) => (list ? list.filter((_, j) => j !== i) : list));

  function add(type: HomeSectionType) {
    setSections((list) => {
      if (!list) return list;
      const ids = new Set(list.map((s) => s.id));
      if (type !== 'category') {
        return [
          ...list,
          {
            id: freeId(type.replace('_', '-'), ids),
            type,
            enabled: true,
            title: DEFAULT_TITLES[type],
          },
        ];
      }
      const used = new Set(list.map((s) => s.categorySlug));
      const cat = data.categories.find((c) => c.isActive && !used.has(c.slug));
      return [
        ...list,
        {
          id: freeId(cat?.slug ?? 'category', ids),
          type,
          enabled: true,
          title: cat?.name ?? 'Category',
          ...(cat ? { categorySlug: cat.slug } : {}),
        },
      ];
    });
  }

  async function save() {
    if (!sections) return;
    const untitled = sections.find((s) => !s.title.trim());
    if (untitled) {
      toast.error(`Give the ${TYPES[untitled.type].label} section a title.`);
      return;
    }
    const noCategory = sections.find(
      (s) => s.type === 'category' && !s.categorySlug,
    );
    if (noCategory) {
      toast.error(`Choose a category for “${noCategory.title}”.`);
      return;
    }
    setBusy(true);
    try {
      const next = await api<HomepageData>('staff/site/homepage', {
        method: 'PUT',
        body: {
          version: data.version,
          sections: sections.map((s) => ({ ...s, title: s.title.trim() })),
        },
      });
      qc.setQueryData(qk.homepage, next);
      setSections(next.sections);
      void qc.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Saved. The news homepage updates within a few seconds.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(errorMessage(err), {
          action: {
            label: 'Reload',
            onClick: () => {
              setSections(null);
              void query.refetch();
            },
          },
        });
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const present = new Set(sections.map((s) => s.type));
  const addable = (Object.keys(TYPES) as HomeSectionType[]).filter(
    (t) => !TYPES[t].single || !present.has(t),
  );
  const categoryLabel = (slug: string) => {
    const c = data.categories.find((x) => x.slug === slug);
    if (!c) return null;
    return `${c.parent ? `${c.parent.name} › ` : ''}${c.name}${c.isActive ? '' : ' (switched off)'}`;
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="News homepage"
        description={
          <>
            Which sections stockvirtue.com/news shows, and in what order.
            {data.updatedAt ? (
              <span title={formatDateTime(data.updatedAt)}>
                {' '}
                Last saved {timeAgo(data.updatedAt)}
                {data.updatedBy ? ` by ${data.updatedBy.displayName}` : ''}.
              </span>
            ) : null}
          </>
        }
        actions={
          <Button variant="outline" asChild>
            <a href="/news" target="_blank" rel="noopener">
              <ExternalLink /> Open the homepage
            </a>
          </Button>
        }
      />

      {data.version === 0 && (
        <Alert className="mb-6">
          <Info />
          <AlertDescription>
            The homepage is using the default layout. Your first save makes it
            yours.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sections, top to bottom</CardTitle>
          <CardDescription>
            Sections with no stories to show stay hidden automatically, so an
            empty category never leaves a gap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={busy}>
            <ol className="space-y-3">
              {sections.map((s, i) => {
                const meta = TYPES[s.type];
                const Icon = meta.icon;
                const label = s.categorySlug
                  ? categoryLabel(s.categorySlug)
                  : null;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      'rounded-lg border p-4 transition-opacity',
                      !s.enabled && 'bg-muted/40',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-6 font-mono text-sm text-muted-foreground tabular-nums">
                        {i + 1}
                      </span>
                      <Icon
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium">{meta.label}</span>
                      {!s.enabled && <Badge variant="outline">Hidden</Badge>}
                      <div className="flex-1" />
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`show-${s.id}`}
                          className="text-sm font-normal text-muted-foreground"
                        >
                          Show
                        </Label>
                        <Switch
                          id={`show-${s.id}`}
                          checked={s.enabled}
                          onCheckedChange={(v) => update(i, { enabled: v })}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(i, -1)}
                        disabled={i === 0}
                        aria-label={`Move ${s.title} up`}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => move(i, 1)}
                        disabled={i === sections.length - 1}
                        aria-label={`Move ${s.title} down`}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(i)}
                        aria-label={`Remove ${s.title}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    <p className="mt-1 ml-8 text-xs text-muted-foreground">
                      {meta.description}
                    </p>
                    <div className="mt-3 ml-8 grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_auto_minmax(0,16rem)]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`title-${s.id}`} className="text-xs">
                          Heading
                        </Label>
                        <Input
                          id={`title-${s.id}`}
                          value={s.title}
                          maxLength={60}
                          onChange={(e) => update(i, { title: e.target.value })}
                        />
                      </div>
                      {s.type !== 'app_promo' && (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Stories</Label>
                          <Select
                            value={String(
                              s.limit ?? data.defaultLimits[s.type],
                            )}
                            onValueChange={(v) =>
                              update(i, { limit: Number(v) })
                            }
                          >
                            <SelectTrigger
                              className="w-24"
                              aria-label={`Stories in ${s.title}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 12 }, (_, n) => n + 1).map(
                                (n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {s.type === 'category' && (
                        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                          <Label className="text-xs">Category</Label>
                          <Select
                            value={s.categorySlug ?? ''}
                            onValueChange={(v) =>
                              update(i, { categorySlug: v })
                            }
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-label={`Category for ${s.title}`}
                            >
                              <SelectValue placeholder="Choose a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {s.categorySlug && !label && (
                                <SelectItem value={s.categorySlug}>
                                  {s.categorySlug} (doesn&rsquo;t exist yet)
                                </SelectItem>
                              )}
                              {data.categories.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>
                                  {categoryLabel(c.slug)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {s.type === 'category' && s.categorySlug && !label && (
                      <p className="mt-3 ml-8 flex items-start gap-2 text-xs text-warning">
                        <AlertTriangle className="mt-px size-3.5 shrink-0" />
                        There is no category with the address “{s.categorySlug}”
                        yet. Create it in Categories &amp; tags, or pick
                        another; until then this section stays hidden.
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
            {sections.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sections: the homepage would be empty. Add one below.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={sections.length >= 20}>
                    <Plus /> Add a section
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  {addable.map((t) => {
                    const Icon = TYPES[t].icon;
                    return (
                      <DropdownMenuItem key={t} onSelect={() => add(t)}>
                        <Icon /> {TYPES[t].label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <p className="text-xs text-muted-foreground">
                Market widgets and the ticker join this list with the
                market-data module.
              </p>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/90 backdrop-blur animate-in fade-in slide-in-from-bottom-4 lg:left-64">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="text-sm text-muted-foreground">
              You have unsaved changes.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSections(data.sections)}
                disabled={busy}
              >
                Discard
              </Button>
              <Button onClick={() => void save()} disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
