'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeContent } from '@/lib/site-content/merge';
import { ApiError } from '@/portal/api';
import { invalidateSiteContent, qk, useSiteItem } from '@/portal/queries';
import {
  canonicalJson,
  discardDraft,
  fieldErrors,
  isStale,
  saveDraft,
  siteError,
} from '@/portal/site-content';
import type { SiteFieldError, SiteItemView } from '@/portal/types';

/** Pause after the last change before a background save (W7 addendum §8.3). */
export const AUTOSAVE_MS = 10_000;

export type SaveState =
  | { kind: 'saved'; at: string | null }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'conflict' };

/** A custom page's starting content (§3.12). */
export const CUSTOM_EMPTY = {
  title: '',
  intro: '',
  body: { type: 'doc', content: [{ type: 'paragraph' }] },
  seo: { title: '', description: '', noindex: false },
  showUpdated: true,
};

/** Whether a document has a block the API keeps (it drops empty paragraphs). */
function hasBlocks(doc: unknown): boolean {
  const nodes = (doc as { content?: unknown } | null)?.content;
  if (!Array.isArray(nodes)) return false;
  return nodes.some((n: { type?: string; content?: unknown }) => n?.type !== 'paragraph' || (Array.isArray(n.content) && n.content.length > 0));
}

/**
 * Why the API would refuse this draft outright, so the autosave waits instead
 * of showing an error while someone is still writing: a page or legal
 * document whose text is empty ("The document is empty."). A new page starts
 * like that. Saving by hand still asks the API and shows its words.
 */
export function autosaveHold(kind: string | undefined, content: unknown): string | null {
  if (kind !== 'CUSTOM' && kind !== 'LEGAL') return null;
  const body = (content as { body?: unknown } | null)?.body;
  return hasBlocks(body) ? null : 'Add some page text, and it saves as a draft.';
}

/**
 * One item's draft, saved like the article editor saves a story: optimistic
 * locking on `draftVersion` (409 → "Changed elsewhere"), an autosave 10 s
 * after the last change, Ctrl+S, a beforeunload guard, and a flush when the
 * editor closes. The draft starts as draft ?? live ?? the built-in default,
 * with missing fields filled from the default.
 */
export function useItemEditor(key: string, builtIn: unknown | null) {
  const qc = useQueryClient();
  const query = useSiteItem(key);
  const view = query.data;
  const [epoch, setEpoch] = useState(0);
  const [content, setContentState] = useState<unknown>(undefined);
  const [state, setState] = useState<SaveState>({ kind: 'saved', at: null });
  const [errors, setErrors] = useState<SiteFieldError[]>([]);
  /** What the last save allowed but a publish would refuse (a menu link to a draft page). */
  const [warnings, setWarnings] = useState<SiteFieldError[]>([]);
  const versionRef = useRef(0);
  const contentRef = useRef<unknown>(undefined);
  const savedRef = useRef('');
  const renameRef = useRef(false);
  const inflight = useRef<Promise<number | null> | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const initFor = useRef<string>('');

  const kind = view?.item.kind;
  const kindRef = useRef(kind);
  kindRef.current = kind;
  const itemTitle = view?.item.title ?? '';
  const fill = useCallback(
    (v: unknown) => {
      if (builtIn) return mergeContent(builtIn, v ?? builtIn);
      if (kind === 'CUSTOM') {
        const base = { ...CUSTOM_EMPTY, title: itemTitle };
        return mergeContent(base, v ?? base);
      }
      return v;
    },
    [builtIn, kind, itemTitle],
  );

  /** What the live site shows now: the live revision, else the built-in default. */
  const live = view ? (view.live ? fill(view.live.content) : builtIn ?? null) : undefined;

  // Start (and restart after a reload) from the server's answer.
  useEffect(() => {
    if (!view) return;
    const tag = `${epoch}`;
    if (initFor.current === tag) return;
    initFor.current = tag;
    const start = fill(view.draft ?? view.live?.content ?? null);
    versionRef.current = view.draftVersion ?? 0;
    contentRef.current = start;
    savedRef.current = canonicalJson(start);
    setContentState(start);
    setErrors([]);
    setWarnings([]);
    setState({ kind: 'saved', at: view.item.draftUpdatedAt });
  }, [view, epoch, fill]);

  const persist = useCallback(
    async (autosave: boolean): Promise<number | null> => {
      if (inflight.current) await inflight.current.catch(() => null);
      const body = contentRef.current;
      const json = canonicalJson(body);
      if (json === savedRef.current && autosave) return versionRef.current;
      if (autosave && autosaveHold(kindRef.current, body)) return versionRef.current;
      const run = (async () => {
        setState({ kind: 'saving' });
        try {
          const res = await saveDraft(key, {
            draftVersion: versionRef.current,
            content: body,
            autosave,
            ...(renameRef.current ? { renameIds: true } : {}),
          });
          versionRef.current = res.draftVersion;
          savedRef.current = json;
          renameRef.current = false;
          setErrors([]);
          setWarnings(Array.isArray(res.warnings) ? res.warnings : []);
          const now = res.savedAt ?? new Date().toISOString();
          setState(canonicalJson(contentRef.current) === json ? { kind: 'saved', at: now } : { kind: 'dirty' });
          const cached = qc.getQueryData<SiteItemView>(qk.siteItem(key));
          if (cached) {
            qc.setQueryData<SiteItemView>(qk.siteItem(key), {
              ...cached,
              draft: body,
              draftVersion: res.draftVersion,
              item: { ...cached.item, hasDraft: true, draftUpdatedAt: now },
            });
          }
          invalidateSiteContent(qc);
          return res.draftVersion;
        } catch (err) {
          const message = siteError(err, new TextEncoder().encode(json).length);
          if (isStale(err)) setState({ kind: 'conflict' });
          else {
            setErrors(fieldErrors(err));
            setState({ kind: 'error', message });
          }
          if (!autosave) throw err instanceof ApiError ? new ApiError(err.status, message, err.code, err.body) : err;
          return null;
        } finally {
          inflight.current = null;
        }
      })();
      inflight.current = run;
      return run;
    },
    [key, qc],
  );

  const setContent = useCallback(
    (next: unknown) => {
      contentRef.current = next;
      setContentState(next);
      setState((s) => (s.kind === 'conflict' ? s : { kind: 'dirty' }));
      window.clearTimeout(timer.current);
      if (!autosaveHold(kindRef.current, next)) timer.current = window.setTimeout(() => void persist(true), AUTOSAVE_MS);
    },
    [persist],
  );

  /** Save now (Ctrl+S, "Save draft"). Throws the API's error. */
  const save = useCallback(async () => {
    window.clearTimeout(timer.current);
    return persist(false);
  }, [persist]);

  /**
   * Before publishing: the draft on the server is exactly what's on screen.
   * A built-in item without a row is saved once, so its first publish
   * creates revision 1 (§2.3).
   */
  const ensureSaved = useCallback(async (): Promise<number> => {
    window.clearTimeout(timer.current);
    const unsaved = canonicalJson(contentRef.current) !== savedRef.current;
    const noDraft = !(qc.getQueryData<SiteItemView>(qk.siteItem(key))?.item.hasDraft ?? false);
    if (unsaved || noDraft || inflight.current) {
      if (inflight.current) await inflight.current.catch(() => null);
      if (canonicalJson(contentRef.current) !== savedRef.current || noDraft) {
        savedRef.current = '';
        const v = await persist(false);
        if (v === null) throw new ApiError(409, siteError(new ApiError(409, '', 'stale_draft')), 'stale_draft');
        return v;
      }
    }
    return versionRef.current;
  }, [key, persist, qc]);

  const reload = useCallback(async () => {
    window.clearTimeout(timer.current);
    await query.refetch();
    setEpoch((e) => e + 1);
  }, [query]);

  /** The draft is gone: back to the live text (or the built-in one). Throws on failure. */
  const discard = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current.catch(() => null);
    const res = await discardDraft(key, versionRef.current);
    versionRef.current = res.draftVersion;
    invalidateSiteContent(qc, key);
    await reload();
  }, [key, qc, reload]);

  /** Load the built-in text into the draft (not saved until the autosave or Save). */
  const resetToBuiltIn = useCallback(() => {
    if (builtIn) setContent(structuredClone(builtIn));
  }, [builtIn, setContent]);

  /** After a publish or a restore: the server has a new state. */
  const afterServerChange = useCallback(async () => {
    invalidateSiteContent(qc, key);
    await reload();
  }, [key, qc, reload]);

  // Don't lose work: warn before leaving, and flush when the editor closes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (canonicalJson(contentRef.current) !== savedRef.current || inflight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.clearTimeout(timer.current);
      if (contentRef.current !== undefined && canonicalJson(contentRef.current) !== savedRef.current) {
        void persist(true).catch(() => undefined);
      }
    };
  }, [persist]);

  // Ctrl+S / Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save().catch(() => undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const dirty = content !== undefined && canonicalJson(content) !== savedRef.current;
  /**
   * What the unsaved bar says instead of "saved in a few seconds": the autosave
   * waits for something the API needs (see autosaveHold), or the last save failed.
   */
  const held =
    (content !== undefined ? autosaveHold(kind, content) : null) ??
    (state.kind === 'error' ? 'The last save didn’t go through: fix what it says, then save again.' : null);
  const differsFromLive = content !== undefined && live !== undefined && canonicalJson(content) !== canonicalJson(live);

  return {
    query,
    view,
    content,
    setContent,
    live,
    state,
    errors,
    warnings,
    dirty,
    held,
    differsFromLive,
    draftVersion: () => versionRef.current,
    save,
    ensureSaved,
    discard,
    reload,
    resetToBuiltIn,
    afterServerChange,
    markRenameIds: () => {
      renameRef.current = true;
    },
  };
}

export type ItemEditor = ReturnType<typeof useItemEditor>;
