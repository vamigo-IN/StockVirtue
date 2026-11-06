'use client';

import { Archive, ArrowLeft, EyeOff, Languages, Lock, Pencil, RotateCcw, Save, Send, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, QueryError, RowsSkeleton } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { docChangeSummary, factIdsIn, fieldChanges } from '@/components/portal/site-content/changes';
import { lintContent } from '@/components/portal/site-content/copy-lint';
import { ConflictAlert, EditorBar, UnsavedBar } from '@/components/portal/site-content/EditorBar';
import { CUSTOM_FORM, LEGAL_HEAD_FORM, WONT_DO_FORM } from '@/components/portal/site-content/form-schemas';
import { LegalDocEditor } from '@/components/portal/site-content/LegalDocEditor';
import { LintPanel } from '@/components/portal/site-content/LintPanel';
import { NoticePublishDialog } from '@/components/portal/site-content/NoticePublishDialog';
import { PreviewPane } from '@/components/portal/site-content/PreviewPane';
import { PublishDialog } from '@/components/portal/site-content/PublishDialog';
import { useReturnFocus } from '@/components/portal/site-content/return-focus';
import { SchemaForm, type FormSchema } from '@/components/portal/site-content/SchemaForm';
import { SiteConfirm } from '@/components/portal/site-content/SiteConfirm';
import { SizeMeter } from '@/components/portal/site-content/SizeMeter';
import { factsSnapshotFor, slugProblem, statusOf } from '@/components/portal/site-content/status';
import { useItemEditor, type ItemEditor } from '@/components/portal/site-content/useItemEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LEGAL_PROFILES, type DocProfile, type LegalKey } from '@/content/site/types';
import { useSiteContentTypes, useSiteRevisions } from '@/portal/queries';
import {
  archivePage,
  canEditLocked,
  canPublishMaterial,
  canWriteKind,
  contentBytes,
  friendly,
  historyHref,
  isPrivacyKey,
  liveHref,
  publishItem,
  siteError,
  termsMinNoticeDays,
  unpublishPage,
  updateCustomPage,
  type PublishBody,
} from '@/portal/site-content';
import type { SiteContentItem, SiteFieldError } from '@/portal/types';

type Kind = SiteContentItem['kind'];

/** Where each item shows, in the editor's header. */
function whereItShows(item: SiteContentItem): string {
  if (item.kind === 'SHARED') return 'Shown on the home page (compact, on phones) and on /features, in full.';
  if (item.kind === 'CUSTOM') return item.slug ? `Shown at stockvirtue.com/${item.slug} once published.` : 'A page of your own.';
  return item.path ? `Shown at stockvirtue.com${item.path === '/' ? '' : item.path}.` : '';
}

const bodyOf = (c: unknown) => (c as { body?: unknown } | null)?.body;
const isBodyPath = (p: string) => p === 'body' || p.startsWith('body.') || p.startsWith('body[');

/** The form of the item's structured fields (the body is the document editor). */
function formFor(kind: Kind): FormSchema | null {
  if (kind === 'SHARED') return WONT_DO_FORM;
  if (kind === 'LEGAL') return LEGAL_HEAD_FORM;
  if (kind === 'CUSTOM') return CUSTOM_FORM;
  return null;
}

function ListAlert({ title, items, tone }: { title: string; items: SiteFieldError[]; tone: 'destructive' | 'warning' }) {
  if (!items.length) return null;
  return (
    <Alert variant={tone === 'destructive' ? 'destructive' : 'default'} className={tone === 'warning' ? 'border-warning/40 bg-warning/5' : undefined}>
      <TriangleAlert className={tone === 'warning' ? 'text-warning' : undefined} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {items.slice(0, 12).map((e) => (
            <li key={`${e.path}|${e.message}`}>{e.message}</li>
          ))}
          {items.length > 12 && <li>and {items.length - 12} more</li>}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/** A custom page's address, list name and visibility (§3.12). */
function CustomPageSettings({ ed, item, canWrite }: { ed: ItemEditor; item: SiteContentItem; canWrite: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(item.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'hide' | 'archive' | null>(null);
  const problem = slugProblem(slug);
  const returnFocus = useReturnFocus(editing);

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    if (problem || slug === item.slug) return;
    setBusy(true);
    setError(null);
    try {
      const v = await ed.ensureSaved();
      await updateCustomPage(item.key, { draftVersion: v, slug });
      await ed.afterServerChange();
      toast.success(item.status === 'LIVE' ? `The page moved to /${slug}. The old address redirects to it.` : `The page’s address is now /${slug}.`);
      setEditing(false);
    } catch (err) {
      setError(siteError(err));
    } finally {
      setBusy(false);
    }
  }

  const previous = item.previousSlugs ?? [];
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">Address and visibility</CardTitle>
        <CardDescription>Your pages join the sitemap when published, unless they are hidden from search engines.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Address</span>
          <span className="font-mono">stockvirtue.com/{item.slug}</span>
          {canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSlug(item.slug ?? '');
                setError(null);
                setEditing(true);
              }}
            >
              <Pencil /> Change address…
            </Button>
          )}
        </div>
        {previous.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Old addresses that redirect here: {previous.map((s) => `/${s}`).join(', ')}
          </p>
        )}
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {item.status === 'LIVE' && (
              <Button variant="outline" size="sm" onClick={() => setConfirm('hide')}>
                <EyeOff /> Unpublish
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setConfirm('archive')}>
              <Archive /> Archive
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog open={editing} onOpenChange={(o) => !busy && setEditing(o)}>
        <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
          <form onSubmit={saveSlug} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Change the address</DialogTitle>
              <DialogDescription>
                {item.status === 'LIVE'
                  ? 'The old address keeps working: it redirects to the new one.'
                  : 'The page isn’t published yet, so nothing links to the old address.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="page-slug">Address</Label>
              <div className="flex items-center rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50">
                <span className="pl-3 font-mono text-sm text-muted-foreground">stockvirtue.com/</span>
                <input
                  id="page-slug"
                  className="h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase())}
                  aria-invalid={!!problem}
                  aria-describedby="page-slug-help"
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
              </div>
              <p id="page-slug-help" className={problem ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {problem ?? 'Lowercase letters, digits and single hyphens.'}
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !!problem || slug === item.slug}>
                {busy ? 'Saving…' : 'Change address'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SiteConfirm
        open={confirm === 'hide'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Unpublish this page?"
        description="It leaves the site and the sitemap at once. Its text and history stay here, and you can publish it again."
        confirmLabel="Unpublish"
        onConfirm={async () => {
          try {
            await unpublishPage(item.key);
          } catch (err) {
            throw friendly(err);
          }
          await ed.afterServerChange();
          toast.success('Unpublished. The page is hidden from the site.');
        }}
      />
      <SiteConfirm
        open={confirm === 'archive'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Archive this page?"
        description="It leaves the site and this list, and its address becomes free for another page. Its published revisions stay in the records."
        confirmLabel="Archive"
        destructive
        onConfirm={async () => {
          try {
            await archivePage(item.key);
          } catch (err) {
            throw friendly(err);
          }
          toast.success('Archived.');
          router.push('/admin/pages');
        }}
      />
    </Card>
  );
}

export function PageEditor({
  itemKey,
  builtIn,
  opsConsoleUrl,
}: {
  itemKey: string;
  /** The code default of a built-in item (the shared block); null otherwise. */
  builtIn: unknown | null;
  opsConsoleUrl: string;
}) {
  const me = usePortalMe();
  const ed = useItemEditor(itemKey, builtIn);
  const types = useSiteContentTypes();
  const privacy = isPrivacyKey(itemKey);
  const revisions = useSiteRevisions(itemKey, privacy && !!ed.view?.item.restoredFromId);
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);

  const view = ed.view;
  const item = view?.item;
  const kind: Kind = item?.kind ?? 'LEGAL';
  const schema = formFor(kind);
  const limitsKey = kind === 'SHARED' ? 'wont-do' : kind === 'CUSTOM' ? 'custom' : 'legal';
  const overrides =
    kind === 'LEGAL'
      ? types.data?.legal.head.limits
      : kind === 'CUSTOM'
        ? types.data?.items.custom?.limits
        : types.data?.items['wont-do']?.limits;
  const content = ed.content;
  const contentJson = useMemo(() => JSON.stringify(content ?? null), [content]);

  const warnings = useMemo(
    () => (content === undefined ? [] : lintContent(content, { limitsKey, itemKey, kind, live: ed.live })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentJson, limitsKey, itemKey, kind],
  );

  if (ed.query.error) {
    return (
      <>
        <PageHeader title="Edit page" />
        <QueryError error={friendly(ed.query.error)} onRetry={() => void ed.query.refetch()} />
      </>
    );
  }
  if (!view || !item || content === undefined) return <RowsSkeleton rows={8} />;

  const canWrite = canWriteKind(me, kind);
  const editable = canWrite && ed.state.kind !== 'conflict';
  const doc = kind === 'LEGAL' || kind === 'CUSTOM';
  const profile: DocProfile = kind === 'CUSTOM' ? 'simple' : (LEGAL_PROFILES[itemKey as LegalKey] ?? 'terms');
  const lang: 'en' | 'hi' = item.lang === 'hi' ? 'hi' : 'en';
  const live = liveHref(item);
  const bytes = doc ? contentBytes(content) : 0;
  const unplacedErrors = ed.errors.filter((e) => isBodyPath(e.path) || !schema);
  const nothingNew = !!item.live && !ed.differsFromLive && !item.hasDraft;
  const firstPublish = !item.live;
  const title = item.key === 'privacy-hi' ? 'गोपनीयता सूचना' : item.title || 'Untitled page';

  // A privacy text restored from another notice version can only go out as a material change (§5.1).
  const restoredRev = item.restoredFromId ? revisions.data?.items.find((r) => r.id === item.restoredFromId) : undefined;
  const currentVersion = view.live?.revision.noticeVersion ?? null;
  const restoredOtherVersion =
    privacy && restoredRev && restoredRev.noticeVersion && restoredRev.noticeVersion !== currentVersion ? restoredRev.noticeVersion : null;

  const changes = (() => {
    const head = fieldChanges(ed.live, content, schema).map((c) => c.label);
    if (!doc) return head;
    return [...head, ...docChangeSummary(bodyOf(ed.live), bodyOf(content))];
  })();

  async function saveNow() {
    setSaving(true);
    try {
      await ed.save();
      toast.success('Draft saved. Nothing changes on the site until you publish.');
    } catch (err) {
      if ((err as { code?: string }).code !== 'stale_draft') toast.error(siteError(err));
    } finally {
      setSaving(false);
    }
  }

  async function publish(body: Omit<PublishBody, 'draftVersion'>) {
    let v = await ed.ensureSaved();
    // A custom page's name in the Pages list follows its title.
    const pageTitle = kind === 'CUSTOM' ? String((content as { title?: unknown }).title ?? '').trim() : '';
    if (kind === 'CUSTOM' && pageTitle && pageTitle !== item!.title) {
      const res = await updateCustomPage(itemKey, { draftVersion: v, title: pageTitle });
      v = res.item.draftVersion;
    }
    const facts = factsSnapshotFor(factIdsIn(content));
    await publishItem(itemKey, { ...body, draftVersion: v, ...(facts ? { factsSnapshot: facts } : {}) });
    await ed.afterServerChange();
    toast.success(
      kind === 'CUSTOM' && firstPublish
        ? `Published at /${item!.slug}. It is on the site within a few seconds.`
        : 'Published. The site shows it within a few seconds.',
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={whereItShows(item)}
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/pages">
              <ArrowLeft /> All pages
            </Link>
          </Button>
        }
      />
      <EditorBar
        state={ed.state}
        onRetry={() => void saveNow()}
        badges={statusOf(item)}
        historyHref={historyHref(itemKey)}
        liveHref={item.kind === 'CUSTOM' && item.status !== 'LIVE' ? null : live}
      >
        {canWrite && (
          <>
            <Button variant="outline" size="sm" onClick={() => void saveNow()} disabled={saving || ed.state.kind === 'conflict'}>
              <Save /> Save draft
            </Button>
            <Button size="sm" onClick={() => setPublishing(true)} disabled={ed.state.kind === 'conflict' || nothingNew}>
              <Send /> Publish…
            </Button>
          </>
        )}
      </EditorBar>

      {ed.state.kind === 'conflict' && <ConflictAlert onReload={() => void ed.reload()} />}
      {!canWrite && (
        <Alert className="mb-4">
          <Lock />
          <AlertDescription>
            You can read this page. Changing it needs the {kind === 'LEGAL' ? 'legal.manage' : 'site.manage'} permission.
          </AlertDescription>
        </Alert>
      )}
      {privacy && (
        <Alert className="mb-4">
          <Languages />
          <AlertDescription>
            <p>
              The English and Hindi notices share one version. Publishing opens the notice dialog, which shows both languages.{' '}
              <Link
                href={`/admin/pages/${itemKey === 'privacy' ? 'privacy-hi' : 'privacy'}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {itemKey === 'privacy' ? 'Open the Hindi notice' : 'Open the English notice'}
              </Link>
            </p>
            {restoredOtherVersion && (
              <p className="mt-1 text-warning">
                This text belongs to notice version {restoredOtherVersion}. Publishing it again is a material change.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <ListAlert title="The server couldn’t save this" items={unplacedErrors} tone="destructive" />
        <ListAlert title="Before you publish" items={ed.warnings} tone="warning" />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
        <div className="min-w-0 space-y-6">
          {schema && (
            <SchemaForm
              schema={schema}
              value={content}
              onChange={ed.setContent}
              live={ed.live}
              errors={ed.errors}
              disabled={!editable}
              canEditLocked={canEditLocked(me)}
              overrides={overrides}
              onRenameIds={ed.markRenameIds}
            />
          )}
          {doc && (
            <section aria-labelledby="doc-title" className="space-y-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="doc-title" className="text-base font-semibold">
                    {kind === 'CUSTOM' ? 'Page text' : 'The document'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {kind === 'CUSTOM'
                      ? 'Headings, lists, tables and links. With two or more headings the page gets a contents list.'
                      : 'Section headings keep their link names (#anchors); live values are filled in from Site settings.'}
                  </p>
                </div>
              </div>
              <LegalDocEditor
                profile={profile}
                value={bodyOf(content)}
                onChange={(body) => ed.setContent({ ...(content as object), body })}
                editable={editable}
                lang={lang}
                label={kind === 'CUSTOM' ? 'Page text' : `${item.title} text`}
              />
              <SizeMeter bytes={bytes} />
              {kind === 'LEGAL' && (types.data?.legal.profiles[profile]?.hooks.length ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  A publish must keep: {types.data!.legal.profiles[profile].hooks.join('; ')}.
                </p>
              )}
            </section>
          )}
          <LintPanel warnings={warnings} />
          {kind === 'CUSTOM' && <CustomPageSettings ed={ed} item={item} canWrite={canWrite} />}
          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {builtIn !== null && (
                <Button variant="outline" size="sm" onClick={() => setConfirm('reset')} disabled={!editable}>
                  <RotateCcw /> Reset to built-in text
                </Button>
              )}
              {item.hasDraft && (
                <Button variant="outline" size="sm" onClick={() => setConfirm('discard')} disabled={!editable}>
                  <Trash2 /> Discard the draft
                </Button>
              )}
            </div>
          )}
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <PreviewPane itemKey={itemKey} content={content} />
        </aside>
      </div>

      {canWrite && ed.dirty && ed.state.kind !== 'conflict' && (
        <UnsavedBar busy={ed.state.kind === 'saving'} onSave={() => void saveNow()} note={ed.held} />
      )}

      {canWrite && privacy && (
        <NoticePublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          currentLang={itemKey === 'privacy-hi' ? 'hi' : 'en'}
          currentDraft={content}
          restoredOtherVersion={restoredOtherVersion}
          canMaterial={canPublishMaterial(me)}
          opsConsoleUrl={opsConsoleUrl}
          ensureSaved={ed.ensureSaved}
          onPublished={ed.afterServerChange}
        />
      )}
      {canWrite && !privacy && (
        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          itemKey={itemKey}
          kind={kind}
          title={title}
          url={item.path}
          firstPublish={firstPublish}
          changes={changes}
          warnings={warnings}
          termsMinDays={termsMinNoticeDays(types.data)}
          onPublish={publish}
        />
      )}
      <SiteConfirm
        open={confirm === 'reset'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Load the built-in text?"
        description="The draft is replaced with the text the site was built with. Nothing changes on the site until you publish."
        confirmLabel="Load the built-in text"
        onConfirm={async () => {
          ed.resetToBuiltIn();
        }}
      />
      <SiteConfirm
        open={confirm === 'discard'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Discard the draft?"
        description="Your unpublished changes are deleted. The site keeps showing what is published now."
        confirmLabel="Discard"
        destructive
        onConfirm={async () => {
          try {
            await ed.discard();
          } catch (err) {
            throw friendly(err);
          }
          toast.success('Draft discarded.');
        }}
      />
    </>
  );
}
