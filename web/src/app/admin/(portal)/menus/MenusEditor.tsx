'use client';

import { ArrowDown, ArrowUp, Link2, Lock, Pin, Plus, RotateCcw, Save, Send, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, QueryError, RowsSkeleton } from '@/components/portal/common';
import { SiteConfirm } from '@/components/portal/site-content/SiteConfirm';
import { usePortalMe } from '@/components/portal/PortalShell';
import { fieldChanges } from '@/components/portal/site-content/changes';
import {
  chromeProblems,
  isNewsLink,
  LIST_RULES,
  newLinkId,
  primaryWidthPx,
  PRIMARY_BUDGET_PX,
  type ChromeProblem,
} from '@/components/portal/site-content/chrome-rules';
import { lintContent } from '@/components/portal/site-content/copy-lint';
import { ConflictAlert, EditorBar, UnsavedBar } from '@/components/portal/site-content/EditorBar';
import { CHROME_LABEL_FORM, CHROME_TEXTS_FORM } from '@/components/portal/site-content/form-schemas';
import { LinkPicker, targetText, type PickerCategory, type PickerPage } from '@/components/portal/site-content/LinkPicker';
import { PreviewPane } from '@/components/portal/site-content/PreviewPane';
import { PublishDialog } from '@/components/portal/site-content/PublishDialog';
import { SchemaForm } from '@/components/portal/site-content/SchemaForm';
import { statusOf } from '@/components/portal/site-content/status';
import { useItemEditor } from '@/components/portal/site-content/useItemEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { textLength } from '@/content/site/limits';
import type { ChromeContent, MenuLink, MenuTarget } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { useCategories, useSiteContentList, useSiteContentTypes } from '@/portal/queries';
import { canEditLocked, canWriteKind, friendly, historyHref, publishItem, siteError } from '@/portal/site-content';
import type { SiteFieldError } from '@/portal/types';

/**
 * Menus & footer (W7 addendum §6, §8.7): the header menu with its width
 * meter and the pinned News link, the phone menu, the footer's four fixed
 * columns and lines, and the 404 page. One item (`chrome`), with the same
 * save, publish and history as every page. The API checks every rule again.
 */

type ListRule = { count: readonly [number, number]; label: readonly [number, number]; name: string };

const within = (errPath: string, base: string) =>
  errPath === base || errPath.startsWith(`${base}.`) || errPath.startsWith(`${base}[`);

interface Ctx {
  pages: PickerPage[];
  categories: PickerCategory[];
  categoriesNote: string | null;
  disabled: boolean;
  problems: (ChromeProblem | SiteFieldError)[];
}

function Problems({ items }: { items: { message: string }[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-0.5 text-xs text-destructive" role="alert">
      {[...new Set(items.map((p) => p.message))].map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function LinkRow({
  link,
  index,
  count,
  base,
  rule,
  ctx,
  pinned,
  allowUrl,
  allowCurrentOn,
  onChange,
  onMove,
  onRemove,
  minReached,
}: {
  link: MenuLink;
  index: number;
  count: number;
  base: string;
  rule: ListRule;
  ctx: Ctx;
  pinned: boolean;
  allowUrl: boolean;
  allowCurrentOn: boolean;
  onChange: (next: MenuLink) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  minReached: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const path = `${base}[${index}]`;
  // The same id the copy checks link to ("primary[1].label" → "f-primary-1-label").
  const id = `f-${`${path}.label`.replace(/[^a-zA-Z0-9]+/g, '-')}`;
  const n = textLength(link.label ?? '');
  const bad = n < rule.label[0] || n > rule.label[1];
  const mine = ctx.problems.filter((p) => within(p.path, path));
  const name = link.label || `Link ${index + 1}`;
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className="mt-2 w-5 font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              Label
            </Label>
            <span className={cn('text-xs tabular-nums text-muted-foreground', bad && 'font-medium text-destructive')}>
              {n} / {rule.label[1]}
            </span>
          </div>
          <Input
            id={id}
            value={link.label ?? ''}
            onChange={(e) => onChange({ ...link, label: e.target.value })}
            disabled={ctx.disabled}
            lang={link.lang}
            aria-invalid={bad || undefined}
            className="h-8"
          />
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            {pinned ? <Pin className="size-3.5 text-muted-foreground" aria-hidden /> : <Link2 className="size-3.5 text-muted-foreground" aria-hidden />}
            {pinned ? (
              <span className="min-w-0 flex-1 text-muted-foreground">
                <span className="font-mono">/news</span> · Pinned: the header always links the news front page. You can rename it.
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-muted-foreground" title={targetText(link.target, ctx.pages, ctx.categories)}>
                {targetText(link.target, ctx.pages, ctx.categories)}
              </span>
            )}
            {pinned ? null : (
              !ctx.disabled && (
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setPicking(true)}>
                  Change link…
                </Button>
              )
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Label language
              <select
                value={link.lang ?? ''}
                onChange={(e) => {
                  const next = { ...link };
                  if (e.target.value === 'hi' || e.target.value === 'en') next.lang = e.target.value;
                  else delete next.lang;
                  onChange(next);
                }}
                disabled={ctx.disabled}
                className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
              >
                <option value="">English (page language)</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
            {allowCurrentOn && (
              <label className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-muted-foreground">
                Also lit on
                <Input
                  value={(link.alsoCurrentOn ?? []).join(', ')}
                  onChange={(e) => {
                    const list = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const next = { ...link };
                    if (list.length) next.alsoCurrentOn = list;
                    else delete next.alsoCurrentOn;
                    onChange(next);
                  }}
                  placeholder="no other paths"
                  disabled={ctx.disabled}
                  className="h-7 min-w-32 flex-1 font-mono text-xs placeholder:font-sans placeholder:text-muted-foreground/70"
                  aria-label={`Other paths that light ${name}, separated by commas (at most three)`}
                />
              </label>
            )}
          </div>
          <Problems items={mine} />
        </div>
        {!ctx.disabled && (
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${name} up`}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onMove(1)} disabled={index === count - 1} aria-label={`Move ${name} down`}>
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={onRemove}
              disabled={pinned || minReached}
              aria-label={pinned ? `${name} can’t be removed` : `Remove ${name}`}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      <LinkPicker
        open={picking}
        onOpenChange={setPicking}
        value={link.target ?? null}
        onPick={(t) => onChange({ ...link, target: t })}
        allowUrl={allowUrl}
        pages={ctx.pages}
        categories={ctx.categories}
        categoriesNote={ctx.categoriesNote}
      />
    </li>
  );
}

function LinkList({
  base,
  links,
  rule,
  ctx,
  onChange,
  allowUrl = true,
  allowCurrentOn = false,
  pinNews = false,
}: {
  base: string;
  links: MenuLink[];
  rule: ListRule;
  ctx: Ctx;
  onChange: (next: MenuLink[]) => void;
  allowUrl?: boolean;
  allowCurrentOn?: boolean;
  pinNews?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [min, max] = rule.count;
  const own = ctx.problems.filter((p) => p.path === base);
  const move = (i: number, d: -1 | 1) => {
    const next = links.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground tabular-nums">
        {links.length} {min === max ? `(exactly ${min})` : `(${min}–${max})`} · labels {rule.label[0]}–{rule.label[1]} characters
      </p>
      <ol className="space-y-2">
        {links.map((l, i) => (
          <LinkRow
            key={`${l.id}-${i}`}
            link={l}
            index={i}
            count={links.length}
            base={base}
            rule={rule}
            ctx={ctx}
            pinned={pinNews && isNewsLink(l)}
            allowUrl={allowUrl}
            allowCurrentOn={allowCurrentOn}
            onChange={(x) => onChange(links.map((y, j) => (j === i ? x : y)))}
            onMove={(d) => move(i, d)}
            onRemove={() => onChange(links.filter((_, j) => j !== i))}
            minReached={links.length <= min}
          />
        ))}
      </ol>
      <Problems items={own} />
      {!ctx.disabled && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)} disabled={links.length >= max}>
            <Plus /> Add a link
          </Button>
          <LinkPicker
            open={adding}
            onOpenChange={setAdding}
            value={null}
            onPick={(t: MenuTarget) => {
              const label = t.type === 'page' ? (ctx.pages.find((p) => p.id === t.pageId)?.title ?? 'New link') : 'New link';
              const short = label.slice(0, rule.label[1]);
              onChange([...links, { id: newLinkId(links, short), label: short, target: t }]);
            }}
            allowUrl={allowUrl}
            pages={ctx.pages}
            categories={ctx.categories}
            categoriesNote={ctx.categoriesNote}
          />
        </>
      )}
    </div>
  );
}

function WidthMeter({ px }: { px: number }) {
  const share = Math.min(1, px / PRIMARY_BUDGET_PX);
  const over = px > PRIMARY_BUDGET_PX;
  return (
    <div className="space-y-1" aria-live="polite">
      <p className={cn('text-sm', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
        Header at 768 px: {px} of {PRIMARY_BUDGET_PX} px
        {over ? ' (too wide: shorten a label or remove a link)' : ''}
      </p>
      <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn('h-full rounded-full', over ? 'bg-destructive' : share >= 0.95 ? 'bg-warning' : 'bg-primary')} style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

const COLUMN_NOTES: Record<string, string> = {
  news: 'On news pages and the rest of the site.',
  app: 'The app’s pages.',
  company: 'About us and Contact.',
  legal: 'Stays open on phones and holds Cookie settings. It must link /privacy and /terms.',
};

export function MenusEditor({ builtIn }: { builtIn: ChromeContent }) {
  const me = usePortalMe();
  const ed = useItemEditor('chrome', builtIn);
  const types = useSiteContentTypes();
  const list = useSiteContentList();
  const cats = useCategories();
  const [tab, setTab] = useState('header');
  const [publishing, setPublishing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saving, setSaving] = useState(false);

  const pages: PickerPage[] = useMemo(
    () =>
      (list.data?.items ?? [])
        .filter((i) => i.kind === 'CUSTOM')
        .map((i) => ({ id: i.key, title: i.title, slug: i.slug ?? null, live: i.status === 'LIVE' })),
    [list.data],
  );
  const categories: PickerCategory[] = useMemo(
    () => (cats.data ?? []).map((c) => ({ slug: c.slug, name: c.name, isActive: c.isActive })),
    [cats.data],
  );
  const c = ed.content as ChromeContent | undefined;
  const cJson = JSON.stringify(c ?? null);
  const liveSlugs = useMemo(() => new Set(pages.filter((p) => p.live && p.slug).map((p) => p.slug as string)), [pages]);
  const problems = useMemo(
    () => (c ? chromeProblems(c, { pages, categories, liveSlugs }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cJson, pages, categories, liveSlugs],
  );
  const warnings = useMemo(
    () => (c ? lintContent(c, { limitsKey: 'chrome', itemKey: 'chrome', kind: 'CHROME', live: ed.live }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cJson],
  );

  if (ed.query.error) {
    return (
      <>
        <PageHeader title="Menus & footer" />
        <QueryError error={friendly(ed.query.error)} onRetry={() => void ed.query.refetch()} />
      </>
    );
  }
  if (!ed.view || !c) return <RowsSkeleton rows={8} />;

  const item = ed.view.item;
  const canWrite = canWriteKind(me, 'CHROME');
  const editable = canWrite && ed.state.kind !== 'conflict';
  const set = (next: ChromeContent) => ed.setContent(next);
  const blocking = problems.filter((p) => !('publishOnly' in p && p.publishOnly));
  const publishOnly = problems.filter((p) => 'publishOnly' in p && p.publishOnly);
  const all: (ChromeProblem | SiteFieldError)[] = [...problems, ...ed.errors];
  const ctx: Ctx = {
    pages,
    categories,
    categoriesNote: cats.error ? 'The news categories couldn’t be loaded (they need the news.read permission). Use the Path tab: /news/category/<name>.' : null,
    disabled: !editable,
    problems: all,
  };
  const changes = [...new Set(fieldChanges(ed.live, c, CHROME_LABEL_FORM).map((x) => x.label.replace(/ \(\d+(\.\d+)*\)$/, '')))];
  const tabProblems = (prefixes: string[]) => all.filter((p) => prefixes.some((x) => within(p.path, x))).length;
  const nothingNew = !!item.live && !ed.differsFromLive && !item.hasDraft;

  async function saveNow() {
    setSaving(true);
    try {
      await ed.save();
      toast.success('Draft saved. The menus on the site change only when you publish.');
    } catch (err) {
      if ((err as { code?: string }).code !== 'stale_draft') toast.error(siteError(err));
    } finally {
      setSaving(false);
    }
  }

  const tabLabel = (label: string, n: number) => (
    <>
      {label}
      {n > 0 && (
        <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 text-xs text-destructive tabular-nums" aria-label={`${n} problems`}>
          {n}
        </span>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title="Menus & footer"
        description="The header menu, the phone menu, the footer and the 404 page, on every page of the site. The layout stays as designed; these are the words and the links."
      />
      <EditorBar state={ed.state} onRetry={() => void saveNow()} badges={statusOf(item)} historyHref={historyHref('chrome')} liveHref="/">
        {canWrite && (
          <>
            <Button variant="outline" size="sm" onClick={() => void saveNow()} disabled={saving || ed.state.kind === 'conflict'}>
              <Save /> Save draft
            </Button>
            <Button size="sm" onClick={() => setPublishing(true)} disabled={ed.state.kind === 'conflict' || nothingNew || blocking.length > 0}>
              <Send /> Publish…
            </Button>
          </>
        )}
      </EditorBar>
      {ed.state.kind === 'conflict' && <ConflictAlert onReload={() => void ed.reload()} />}
      {!canWrite && (
        <Alert className="mb-4">
          <Lock />
          <AlertDescription>You can read the menus. Changing them needs the site.manage permission.</AlertDescription>
        </Alert>
      )}
      {(blocking.length > 0 || publishOnly.length > 0) && (
        <Alert variant={blocking.length ? 'destructive' : 'default'} className={cn('mb-4', !blocking.length && 'border-warning/40 bg-warning/5')}>
          <TriangleAlert className={blocking.length ? undefined : 'text-warning'} />
          <AlertTitle>{blocking.length ? 'Fix these before publishing' : 'Before you publish'}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {[...new Set([...blocking, ...publishOnly].map((p) => p.message))].slice(0, 10).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {ed.warnings.length > 0 && (
        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <TriangleAlert className="text-warning" />
          <AlertTitle>The server saved the draft, with a warning</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {ed.warnings.slice(0, 8).map((w) => (
                <li key={`${w.path}|${w.message}`}>{w.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="header">{tabLabel('Header', tabProblems(['primary']))}</TabsTrigger>
              <TabsTrigger value="phone">{tabLabel('Phone menu', tabProblems(['drawerMore', 'drawerLegal']))}</TabsTrigger>
              <TabsTrigger value="footer">{tabLabel('Footer', tabProblems(['footer']))}</TabsTrigger>
              <TabsTrigger value="notfound">{tabLabel('404 page', tabProblems(['notFound']))}</TabsTrigger>
            </TabsList>

            <TabsContent value="header" className="mt-4">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Header menu</CardTitle>
                  <CardDescription>
                    The links in the header from 768 px, the phone menu’s first rows, and the 404 page’s header. Three to five,
                    exactly one of them the news front page, all pages of this site.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <WidthMeter px={primaryWidthPx(c)} />
                  <LinkList
                    base="primary"
                    links={c.primary}
                    rule={LIST_RULES.primary}
                    ctx={ctx}
                    allowUrl={false}
                    allowCurrentOn
                    pinNews
                    onChange={(primary) => set({ ...c, primary })}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="phone" className="mt-4 space-y-4">
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">More</CardTitle>
                  <CardDescription>The phone menu’s list under the header links (48 px rows). Up to six.</CardDescription>
                </CardHeader>
                <CardContent>
                  <LinkList base="drawerMore" links={c.drawerMore} rule={LIST_RULES.drawerMore} ctx={ctx} onChange={(drawerMore) => set({ ...c, drawerMore })} />
                </CardContent>
              </Card>
              <Card className="gap-4">
                <CardHeader>
                  <CardTitle className="text-base">Legal row</CardTitle>
                  <CardDescription>One small row at the bottom of the phone menu. One to four links.</CardDescription>
                </CardHeader>
                <CardContent>
                  <LinkList base="drawerLegal" links={c.drawerLegal} rule={LIST_RULES.drawerLegal} ctx={ctx} onChange={(drawerLegal) => set({ ...c, drawerLegal })} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="footer" className="mt-4 space-y-4">
              {c.footer.columns.map((col, ci) => {
                const base = `footer.columns[${ci}]`;
                const titleId = `f-footer-columns-${ci}-title`;
                const n = textLength(col.title ?? '');
                return (
                  <Card key={col.key} className="gap-4">
                    <CardHeader>
                      <CardTitle className="text-base">Column {ci + 1} ({col.key === 'legal' ? 'Legal' : col.key === 'app' ? 'The app' : col.key === 'news' ? 'News' : 'Company'})</CardTitle>
                      <CardDescription>{COLUMN_NOTES[col.key]}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={titleId}>Title</Label>
                          <span className={cn('text-xs tabular-nums text-muted-foreground', (n < 3 || n > 20) && 'font-medium text-destructive')}>{n} / 20</span>
                        </div>
                        <Input
                          id={titleId}
                          value={col.title}
                          onChange={(e) =>
                            set({ ...c, footer: { ...c.footer, columns: c.footer.columns.map((x, j) => (j === ci ? { ...x, title: e.target.value } : x)) } })
                          }
                          disabled={!editable}
                          className="h-8 max-w-xs"
                        />
                        <Problems items={all.filter((p) => p.path === `${base}.title`)} />
                      </div>
                      <LinkList
                        base={`${base}.links`}
                        links={col.links}
                        rule={LIST_RULES.column}
                        ctx={ctx}
                        onChange={(links) =>
                          set({ ...c, footer: { ...c.footer, columns: c.footer.columns.map((x, j) => (j === ci ? { ...x, links } : x)) } })
                        }
                      />
                    </CardContent>
                  </Card>
                );
              })}
              <SchemaForm
                schema={CHROME_TEXTS_FORM}
                only={['footer-lines']}
                value={c}
                onChange={(next) => set(next as ChromeContent)}
                live={ed.live}
                errors={ed.errors}
                disabled={!editable}
                canEditLocked={canEditLocked(me)}
                overrides={types.data?.items.chrome?.limits}
              />
            </TabsContent>

            <TabsContent value="notfound" className="mt-4">
              <SchemaForm
                schema={CHROME_TEXTS_FORM}
                only={['not-found']}
                value={c}
                onChange={(next) => set(next as ChromeContent)}
                live={ed.live}
                errors={ed.errors}
                disabled={!editable}
                canEditLocked={canEditLocked(me)}
                overrides={types.data?.items.chrome?.limits}
              />
            </TabsContent>
          </Tabs>
          {canWrite && (
            <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={!editable}>
                <RotateCcw /> Reset to built-in text
              </Button>
            </div>
          )}
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <PreviewPane itemKey="chrome" content={c} widths={[390, 768, 1280]} />
        </aside>
      </div>

      {canWrite && ed.dirty && ed.state.kind !== 'conflict' && (
        <UnsavedBar busy={ed.state.kind === 'saving'} onSave={() => void saveNow()} note={ed.held} />
      )}
      {canWrite && (
        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          itemKey="chrome"
          kind="CHROME"
          title="the menus and footer"
          url={null}
          firstPublish={!item.live}
          changes={changes}
          warnings={warnings}
          termsMinDays={0}
          onPublish={async (body) => {
            const v = await ed.ensureSaved();
            await publishItem('chrome', { ...body, draftVersion: v });
            await ed.afterServerChange();
            toast.success('Published. Every page shows the new menus within a few seconds.');
          }}
        />
      )}
      <SiteConfirm
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Load the built-in menus?"
        description="The draft is replaced with the menus and footer the site was built with. Nothing changes on the site until you publish."
        confirmLabel="Load the built-in menus"
        onConfirm={async () => {
          ed.resetToBuiltIn();
        }}
      />
    </>
  );
}
