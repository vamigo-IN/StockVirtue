'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, History, Pencil, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState, PageHeader, QueryError, RowsSkeleton } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { invalidateSiteContent, qk, useSiteItem, useSiteRevision, useSiteRevisions } from '@/portal/queries';
import {
  CHANGE_LABELS,
  canWriteKind,
  editorHref,
  friendly,
  isPrivacyKey,
  personName,
  restoreRevision,
  shortDate,
} from '@/portal/site-content';
import type { SiteItemKind, SiteRevisionInfo } from '@/portal/types';
import { fieldChanges } from './changes';
import { designedForm } from './designed-forms';
import { CHROME_LABEL_FORM, CUSTOM_FORM, LEGAL_HEAD_FORM, WONT_DO_FORM } from './form-schemas';
import { docText } from './plain-text';
import type { FormSchema } from './SchemaForm';
import { SiteConfirm } from './SiteConfirm';
import { ChangedLines, TextDiff } from './TextDiff';

/**
 * History, compare and restore (W7 addendum §8.6), after the article
 * history: the published revisions, newest first; each compared with the one
 * before it or any other; a "Draft vs live" tab; and "Restore rev N into the
 * draft", which never publishes. Documents compare on their plain text with
 * the live values as rendered; structured items field by field, with labels.
 */

const bodyOf = (c: unknown) => (c as { body?: unknown } | null)?.body;

function schemaFor(kind: SiteItemKind | undefined, key: string): FormSchema | null {
  if (kind === 'DESIGNED') return designedForm(key);
  if (kind === 'SHARED') return WONT_DO_FORM;
  if (kind === 'LEGAL') return LEGAL_HEAD_FORM;
  if (kind === 'CUSTOM') return CUSTOM_FORM;
  if (kind === 'CHROME') return CHROME_LABEL_FORM;
  return null;
}

/** "Rev 3 · Material · 2027-09 · 14 Sep 2027 · Meera Iyer" (§8.6). */
function revisionLine(r: SiteRevisionInfo): string {
  const parts = [`Rev ${r.number}`, CHANGE_LABELS[r.change] ?? r.change];
  if (r.noticeVersion) parts.push(r.noticeVersion);
  parts.push(shortDate(r.publishedAt));
  const by = personName(r.publishedBy);
  if (by && by !== 'seed') parts.push(by);
  return parts.join(' · ');
}

function Compare({
  itemKey,
  kind,
  before,
  after,
  beforeValues,
  afterValues,
  beforeName,
  afterName,
}: {
  itemKey: string;
  kind: SiteItemKind;
  before: unknown;
  after: unknown;
  beforeValues?: Record<string, string> | null;
  afterValues?: Record<string, string> | null;
  beforeName: string;
  afterName: string;
}) {
  const schema = schemaFor(kind, itemKey);
  const fields = fieldChanges(before, after, schema);
  const doc = kind === 'LEGAL' || kind === 'CUSTOM';
  const a = doc ? docText(bodyOf(before), beforeValues) : '';
  const b = doc ? docText(bodyOf(after), afterValues) : '';
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        <span className="rounded-sm bg-destructive/10 px-1 text-destructive">Removed</span> from {beforeName},{' '}
        <span className="rounded-sm bg-success/15 px-1 text-success">added</span> in {afterName}.
      </p>
      {fields.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">
            {kind === 'CUSTOM' ? 'Title, intro and search' : kind === 'LEGAL' ? 'Title, summary and search' : 'Fields'}
          </h3>
          <ul className="space-y-3">
            {fields.map((f) => (
              <li key={f.path} className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{f.label}</p>
                <TextDiff before={f.before} after={f.after} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {doc && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">The text</h3>
          {a === b ? (
            <p className="text-sm text-muted-foreground">The text is the same.</p>
          ) : (
            <ChangedLines before={a} after={b} max={40} />
          )}
        </section>
      )}
      {!fields.length && (!doc || a === b) && <p className="text-sm text-muted-foreground">No differences in the text.</p>}
    </div>
  );
}

export function HistoryCompare({ itemKey, builtIn }: { itemKey: string; builtIn: unknown | null }) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const item = useSiteItem(itemKey);
  const revisions = useSiteRevisions(itemKey);
  const list = revisions.data?.items ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const [against, setAgainst] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<SiteRevisionInfo | null>(null);
  const [tab, setTab] = useState('revisions');

  useEffect(() => {
    if (!selected && list.length) setSelected(list[0].id);
  }, [list, selected]);
  const index = list.findIndex((r) => r.id === selected);
  const sel = index >= 0 ? list[index] : null;
  const other = against ?? (index >= 0 && index + 1 < list.length ? list[index + 1].id : null);
  const otherInfo = list.find((r) => r.id === other) ?? null;
  const a = useSiteRevision(itemKey, other);
  const b = useSiteRevision(itemKey, selected);

  const view = item.data;
  const kind = view?.item.kind;
  const canWrite = kind ? canWriteKind(me, kind) : false;
  const currentVersion = view?.live?.revision.noticeVersion ?? null;
  const title = view?.item.key === 'privacy-hi' ? 'गोपनीयता सूचना' : (view?.item.title ?? 'Page');
  const liveContent = view?.live?.content ?? builtIn;

  const draftCompare = useMemo(() => {
    if (!view) return null;
    return { draft: view.draft, live: liveContent };
  }, [view, liveContent]);

  if (item.error || revisions.error) {
    return (
      <>
        <PageHeader title="History" />
        <QueryError error={friendly(item.error ?? revisions.error)} onRetry={() => void Promise.all([item.refetch(), revisions.refetch()])} />
      </>
    );
  }
  if (!view || !revisions.data) return <RowsSkeleton rows={6} />;

  async function restore(r: SiteRevisionInfo) {
    try {
      const fresh = await item.refetch();
      const version = fresh.data?.draftVersion ?? view!.draftVersion;
      await restoreRevision(itemKey, r.id, version);
    } catch (err) {
      throw friendly(err);
    }
    invalidateSiteContent(qc, itemKey);
    void qc.invalidateQueries({ queryKey: qk.siteItem(itemKey) });
    toast.success(`Rev ${r.number} is in the draft. Check it in the editor, then publish when it’s right.`);
    setTab('draft');
  }

  const restoreNote =
    restoring && isPrivacyKey(itemKey) && restoring.noticeVersion && restoring.noticeVersion !== currentVersion
      ? `This text belongs to notice version ${restoring.noticeVersion}. Publishing it again is a material change.`
      : null;

  return (
    <>
      <PageHeader
        title={`History: ${title}`}
        description="Every published revision is kept. Compare any two, or restore one into the draft; nothing is published until you publish it from the editor."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/admin/pages">
                <ArrowLeft /> All pages
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={editorHref(view.item)}>
                <Pencil /> Editor
              </Link>
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="revisions">Published revisions ({list.length})</TabsTrigger>
          <TabsTrigger value="draft">Draft vs live</TabsTrigger>
        </TabsList>
        <TabsContent value="revisions" className="mt-4">
          {list.length === 0 ? (
            <EmptyState icon={History} title="Nothing published yet">
              The site shows the built-in text. The first publish becomes revision 1.
            </EmptyState>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
              <ol className="space-y-2" aria-label="Revisions, newest first">
                {list.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(r.id);
                        setAgainst(null);
                      }}
                      aria-current={r.id === selected ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        r.id === selected && 'border-primary bg-accent/40',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {revisionLine(r)}
                        {r.live && (
                          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                            Live
                          </Badge>
                        )}
                      </span>
                      {r.summary && <span className="mt-0.5 block text-xs text-muted-foreground">{r.summary}</span>}
                      {r.summaryHi && (
                        <span className="mt-0.5 block text-xs text-muted-foreground" lang="hi">
                          {r.summaryHi}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
              <section aria-label="Comparison" className="min-w-0 rounded-xl border bg-card p-4">
                {sel && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">Rev {sel.number}</h2>
                    <span className="text-sm text-muted-foreground">compared with</span>
                    {list.length > 1 ? (
                      <Select value={other ?? ''} onValueChange={(v) => setAgainst(v)}>
                        <SelectTrigger className="h-8 w-auto min-w-36" aria-label="Compare with">
                          <SelectValue placeholder="Choose a revision" />
                        </SelectTrigger>
                        <SelectContent>
                          {list
                            .filter((r) => r.id !== sel.id)
                            .map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                Rev {r.number} · {shortDate(r.publishedAt)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm">nothing (the first revision)</span>
                    )}
                    <div className="flex-1" />
                    {canWrite && !sel.live && (
                      <Button size="sm" variant="outline" onClick={() => setRestoring(sel)}>
                        <RotateCcw /> Restore rev {sel.number} into the draft
                      </Button>
                    )}
                  </div>
                )}
                {!sel ? null : !b.data || (other && !a.data) ? (
                  b.error || a.error ? (
                    <QueryError error={friendly(b.error ?? a.error)} />
                  ) : (
                    <RowsSkeleton rows={4} />
                  )
                ) : (
                  <Compare
                    itemKey={itemKey}
                    kind={view.item.kind}
                    before={other ? a.data?.content : builtIn}
                    after={b.data.content}
                    beforeValues={a.data?.revision.liveValues}
                    afterValues={b.data.revision.liveValues}
                    beforeName={otherInfo ? `rev ${otherInfo.number}` : builtIn !== null ? 'the built-in text' : 'nothing'}
                    afterName={`rev ${sel.number}`}
                  />
                )}
              </section>
            </div>
          )}
        </TabsContent>
        <TabsContent value="draft" className="mt-4">
          <section className="rounded-xl border bg-card p-4">
            {!draftCompare?.draft ? (
              <p className="text-sm text-muted-foreground">
                There is no draft: the editor shows the published text{view.live ? '' : ' (the built-in one)'}.
              </p>
            ) : (
              <Compare
                itemKey={itemKey}
                kind={view.item.kind}
                before={draftCompare.live}
                after={draftCompare.draft}
                beforeValues={view.live?.revision.liveValues}
                afterValues={view.live?.revision.liveValues}
                beforeName={view.live ? `the live text (rev ${view.live.revision.number})` : 'the built-in text'}
                afterName="the draft"
              />
            )}
          </section>
        </TabsContent>
      </Tabs>
      <SiteConfirm
        open={!!restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        title={restoring ? `Restore rev ${restoring.number} into the draft?` : 'Restore?'}
        description={
          <>
            <p>The draft becomes this revision’s text. Nothing is lost: every published revision stays in the history.</p>
            <p>Nothing changes on the site until you publish it from the editor.</p>
            {restoreNote && <p className="font-medium text-warning">{restoreNote}</p>}
          </>
        }
        confirmLabel="Restore into the draft"
        onConfirm={() => restore(restoring!)}
      />
    </>
  );
}
