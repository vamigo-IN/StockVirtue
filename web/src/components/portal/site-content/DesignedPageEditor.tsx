'use client';

import { ArrowLeft, Lock, RotateCcw, Save, Send, Trash2, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, QueryError, RowsSkeleton } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { APP_FACTS, type FactId } from '@/content/app';
import type { DesignedKey } from '@/content/site/types';
import { useSiteContentTypes } from '@/portal/queries';
import {
  canEditLocked,
  canWriteKind,
  friendly,
  historyHref,
  liveHref,
  publishItem,
  siteError,
  type PublishBody,
} from '@/portal/site-content';
import type { SiteFieldError } from '@/portal/types';
import { factIdsIn, fieldChanges } from './changes';
import { lintContent } from './copy-lint';
import { DESIGNED_FORMS } from './designed-forms';
import { ConflictAlert, EditorBar, UnsavedBar } from './EditorBar';
import { LayoutMeters, layoutNotes, type LayoutReadings } from './LayoutMeters';
import { LintPanel } from './LintPanel';
import { PreviewPane, type PreviewTarget, type PreviewView } from './PreviewPane';
import { PublishDialog } from './PublishDialog';
import { SchemaForm } from './SchemaForm';
import { SiteConfirm } from './SiteConfirm';
import { changedFacts, factsSnapshotFor, statusOf } from './status';
import { useItemEditor } from './useItemEditor';

/**
 * The editor of the six designed pages (W7 addendum §8.3; M7.6b): the
 * page's form (its schema's sections in page order, fact chips, the copy
 * checks), the live preview of the real page with the unsaved draft, and
 * the layout meters under it (phone length on every page, the hero figure
 * above the fold on Home). "Edit content, keep design": the layout, the
 * data modules and every interface string stay in code.
 */

const WIDTHS: PreviewView[] = [{ width: 390 }, { width: 834 }, { width: 1280 }];
/** Home adds the fold viewport, scaled to fit (spec §5.1.1). */
const HOME_VIEWS: PreviewView[] = [...WIDTHS, { width: 1366, height: 657, label: '1366 × 657' }];

function ErrorList({ items }: { items: SiteFieldError[] }) {
  if (!items.length) return null;
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>The server couldn’t save this</AlertTitle>
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

export function DesignedPageEditor({ itemKey, builtIn }: { itemKey: DesignedKey; builtIn: unknown }) {
  const me = usePortalMe();
  const ed = useItemEditor(itemKey, builtIn);
  const types = useSiteContentTypes();
  const schema = DESIGNED_FORMS[itemKey];
  const home = itemKey === 'home';
  const [publishing, setPublishing] = useState(false);
  const [confirm, setConfirm] = useState<'reset' | 'discard' | null>(null);
  const [saving, setSaving] = useState(false);
  const [gateOff, setGateOff] = useState(false);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);
  const [readings, setReadings] = useState<LayoutReadings | null>(null);
  const query = home && gateOff ? 'gate=off' : '';
  const onPreview = useCallback((p: PreviewTarget | null) => setPreview(p), []);
  const onReadings = useCallback((r: LayoutReadings) => setReadings(r), []);

  const view = ed.view;
  const item = view?.item;
  const content = ed.content;
  const contentJson = useMemo(() => JSON.stringify(content ?? null), [content]);
  const warnings = useMemo(
    () => (content === undefined ? [] : lintContent(content, { limitsKey: itemKey, itemKey, kind: 'DESIGNED', live: ed.live })),
    // The lint reads the text only: re-run it when the text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentJson, itemKey],
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

  const canWrite = canWriteKind(me, 'DESIGNED');
  const editable = canWrite && ed.state.kind !== 'conflict';
  const live = liveHref(item);
  const nothingNew = !!item.live && !ed.differsFromLive && !item.hasDraft;
  const changes = fieldChanges(ed.live, content, schema).map((c) => c.label);
  const factsMoved = changedFacts(item);
  const notes = layoutNotes(itemKey, readings);
  const where = item.path ? `Shown at stockvirtue.com${item.path === '/' ? '' : item.path}.` : '';

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
    const v = await ed.ensureSaved();
    const facts = factsSnapshotFor(factIdsIn(content));
    await publishItem(itemKey, { ...body, draftVersion: v, ...(facts ? { factsSnapshot: facts } : {}) });
    await ed.afterServerChange();
    toast.success('Published. The site shows it within a few seconds.');
  }

  const gateSwitch = home ? (
    <div className="mr-1 flex items-center gap-1.5">
      <Switch id="pv-gate-off" checked={gateOff} onCheckedChange={setGateOff} />
      <Label htmlFor="pv-gate-off" className="text-xs font-normal">
        Gate off
      </Label>
    </div>
  ) : undefined;

  return (
    <>
      <PageHeader
        title={item.title || 'Edit page'}
        description={`${where} The layout and the live data stay as designed; this edits the words.`}
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
        liveHref={live}
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
          <AlertDescription>You can read this page. Changing it needs the site.manage permission.</AlertDescription>
        </Alert>
      )}
      {factsMoved.length > 0 && (
        <Alert className="mb-4 border-warning/40 bg-warning/5">
          <TriangleAlert className="text-warning" />
          <AlertTitle>Facts changed since the last publish: {factsMoved.join(', ')}</AlertTitle>
          <AlertDescription>
            <p>
              The app’s facts were updated after this page was published. Check the fields tagged with them:{' '}
              {factsMoved
                .map((f) => APP_FACTS[f as FactId]?.text)
                .filter(Boolean)
                .join(' · ')}
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Listed here as well as under each field: some paths have no field of their own (a chapter's fixed id). */}
      <ErrorList items={ed.errors} />

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-6">
          <SchemaForm
            schema={schema}
            value={content}
            onChange={ed.setContent}
            live={ed.live}
            errors={ed.errors}
            disabled={!editable}
            canEditLocked={canEditLocked(me)}
            overrides={types.data?.items[itemKey]?.limits}
            onRenameIds={ed.markRenameIds}
          />
          <LintPanel warnings={warnings} />
          {canWrite && (
            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirm('reset')} disabled={!editable}>
                <RotateCcw /> Reset to built-in text
              </Button>
              {item.hasDraft && (
                <Button variant="outline" size="sm" onClick={() => setConfirm('discard')} disabled={!editable}>
                  <Trash2 /> Discard the draft
                </Button>
              )}
            </div>
          )}
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          {canWrite ? (
            <PreviewPane
              itemKey={itemKey}
              content={content}
              views={home ? HOME_VIEWS : WIDTHS}
              query={query}
              toolbar={gateSwitch}
              onPreview={onPreview}
              footer={<LayoutMeters pageKey={itemKey} preview={preview} query={query} onReadings={onReadings} />}
            />
          ) : (
            // The API makes previews for people who may edit the page only (403 otherwise).
            <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
              The live preview and the layout meters need the site.manage permission. “View live” shows the published
              page.
            </p>
          )}
        </aside>
      </div>

      {canWrite && ed.dirty && ed.state.kind !== 'conflict' && (
        <UnsavedBar busy={ed.state.kind === 'saving'} onSave={() => void saveNow()} note={ed.held} />
      )}

      {canWrite && (
        <PublishDialog
          open={publishing}
          onOpenChange={setPublishing}
          itemKey={itemKey}
          kind="DESIGNED"
          title={item.title || 'this page'}
          url={item.path}
          firstPublish={!item.live}
          changes={changes}
          warnings={warnings}
          layoutNotes={notes}
          termsMinDays={0}
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
