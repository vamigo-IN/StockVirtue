'use client';

import { EyeOff, Loader2, MonitorSmartphone, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ApiError } from '@/portal/api';
import { contentBytes, createPreview, isMissingEndpoint, siteError, updatePreview } from '@/portal/site-content';

/**
 * The live preview (W7 addendum §8.3, §8.9): an iframe of the staff-only
 * /preview/<token> route, which renders the real page components with the
 * unsaved draft (the portal can't load the public CSS itself).
 *
 * Contract: POST staff/site/previews { key, content } → { token, url }; PUT
 * staff/site/previews/:token { content } at most once every 2 s, 1.2 s after
 * typing stops; the iframe reloads when the PUT returns, also at most once
 * every 2 s, and only while the pane is open and the tab visible. The page
 * may post { docHeight, foldShare } to its parent (same origin only) for the
 * layout meters (M7.4b). Until the route ships, the pane says so.
 *
 * Views are widths (the frame as tall as the box allows) or fixed viewports
 * (Home's 1366 × 657, scaled to fit both ways). `query` is added to the
 * frame's address (Home's `gate=off`). `onPreview` tells the layout meters
 * the preview's address each time it holds a newer version, so their own
 * measuring frames can load it.
 */

const DEBOUNCE_MS = 1_200;
const MIN_GAP_MS = 2_000;

type PaneState =
  | { kind: 'starting' }
  | { kind: 'ready'; url: string }
  | { kind: 'unavailable' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string };

export interface PreviewMeasure {
  docHeight?: number;
  foldShare?: number;
}

/** A width button: the frame `width` px wide, and `height` px tall when fixed. */
export interface PreviewView {
  width: number;
  height?: number;
  label?: string;
}

/** The preview's address, and a count that grows each time it holds a newer version. */
export interface PreviewTarget {
  url: string;
  rev: number;
}

/** `url` with `query` ("gate=off") added. */
export function withQuery(url: string, query?: string): string {
  if (!query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

export function PreviewPane({
  itemKey,
  content,
  widths = [390, 834, 1280],
  views,
  query,
  toolbar,
  onMeasure,
  onPreview,
  footer,
}: {
  itemKey: string;
  content: unknown;
  widths?: number[];
  /** Instead of `widths`: widths and fixed viewports. */
  views?: PreviewView[];
  /** Added to the frame's address ("gate=off"). */
  query?: string;
  /** More controls in the pane's bar (Home's "Gate off" switch). */
  toolbar?: React.ReactNode;
  onMeasure?: (m: PreviewMeasure) => void;
  /** The preview's address after each version it takes; null while there is none. */
  onPreview?: (p: PreviewTarget | null) => void;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const list: PreviewView[] = views?.length ? views : widths.map((w) => ({ width: w }));
  const [sel, setSel] = useState(0);
  const current = list[Math.min(sel, list.length - 1)];
  const width = current.width;
  const [state, setState] = useState<PaneState>({ kind: 'starting' });
  const [frameKey, setFrameKey] = useState(0);
  /** Set when the server refused the latest version: the frame still shows the last one it took. */
  const [refused, setRefused] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 400, h: 640 });
  const boxRef = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const token = useRef<string | null>(null);
  const latest = useRef(content);
  latest.current = content;
  const lastPut = useRef(0);
  const lastReload = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const pending = useRef(false);
  const rev = useRef(0);
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const tell = useCallback((url: string | null) => {
    if (url) rev.current += 1;
    onPreviewRef.current?.(url ? { url, rev: rev.current } : null);
  }, []);

  const start = useCallback(async () => {
    setState({ kind: 'starting' });
    try {
      const p = await createPreview(itemKey, latest.current);
      token.current = p.token;
      const res = await fetch(p.url, { cache: 'no-store', credentials: 'same-origin' });
      void res.body?.cancel();
      if (res.status === 404) {
        setState({ kind: 'unavailable' });
        tell(null);
        return;
      }
      lastReload.current = Date.now();
      setState({ kind: 'ready', url: p.url });
      tell(p.url);
    } catch (err) {
      token.current = null;
      tell(null);
      if (isMissingEndpoint(err)) setState({ kind: 'unavailable' });
      else if (err instanceof ApiError && err.code === 'preview_busy') setState({ kind: 'busy' });
      else setState({ kind: 'error', message: siteError(err) });
    }
  }, [itemKey, tell]);

  const push = useCallback(async () => {
    if (!token.current || busy.current) {
      pending.current = true;
      return;
    }
    if (document.visibilityState !== 'visible') {
      pending.current = true;
      return;
    }
    const wait = lastPut.current + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void push(), wait);
      return;
    }
    busy.current = true;
    pending.current = false;
    lastPut.current = Date.now();
    try {
      await updatePreview(token.current, latest.current);
      setRefused(null);
      tell(`/preview/${token.current}`);
      const gap = lastReload.current + MIN_GAP_MS - Date.now();
      window.setTimeout(() => {
        lastReload.current = Date.now();
        setFrameKey((k) => k + 1);
      }, Math.max(0, gap));
      setState((s) => (s.kind === 'busy' ? { kind: 'ready', url: `/preview/${token.current}` } : s));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.code === 'preview_expired')) {
        token.current = null;
        void start();
      } else if (err instanceof ApiError && err.code === 'preview_busy') {
        setState({ kind: 'busy' });
        pending.current = true;
      } else {
        setRefused(siteError(err, contentBytes(latest.current)));
      }
    } finally {
      busy.current = false;
      if (pending.current) {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void push(), MIN_GAP_MS);
      }
    }
  }, [start, tell]);

  // Start when the pane opens; nothing while it's closed.
  useEffect(() => {
    if (!open) return;
    void start();
    return () => {
      window.clearTimeout(timer.current);
      token.current = null;
      tell(null);
    };
  }, [open, start, tell]);

  // Each change: 1.2 s after typing stops, then the 2 s gap.
  useEffect(() => {
    if (!open) return;
    if (!token.current) {
      pending.current = true;
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void push(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [content, open, push]);

  // Changes made while the preview was starting.
  useEffect(() => {
    if (state.kind === 'ready' && pending.current) void push();
  }, [state.kind, push]);

  // Catch up when the tab becomes visible again.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && pending.current) void push();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [push]);

  // The preview page's measurements (same origin, our own frame only).
  useEffect(() => {
    if (!onMeasure) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as PreviewMeasure | null;
      if (d && (typeof d.docHeight === 'number' || typeof d.foldShare === 'number')) onMeasure(d);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMeasure]);

  // The frame box fits the window (it sits under the portal's sticky header),
  // so the scaled page fills whatever height the box has.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [open]);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MonitorSmartphone /> Show the preview
      </Button>
    );
  }

  const fixed = current.height;
  const scale = Math.min(1, box.w / width, fixed ? box.h / fixed : 1);
  return (
    <section aria-label="Preview" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {/* With extra controls (Home's "Gate off") the bar keeps to one line; the section is labelled anyway. */}
        <span className={cn('px-1 text-sm font-medium', toolbar && 'sr-only')}>Preview</span>
        <div className="flex-1" />
        {toolbar}
        <div role="group" aria-label="Preview width" className="flex items-center gap-0.5">
          {list.map((v, i) => {
            const on = v === current;
            return (
              <Button
                key={`${v.width}x${v.height ?? ''}`}
                type="button"
                variant={on ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs tabular-nums"
                aria-pressed={on}
                aria-label={`${v.label ?? v.width} pixels${v.height ? '' : ' wide'}`}
                onClick={() => setSel(i)}
              >
                {v.label ?? v.width}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Reload the preview"
          onClick={() => (state.kind === 'ready' ? setFrameKey((k) => k + 1) : void start())}
        >
          <RefreshCw className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label="Hide the preview" onClick={() => setOpen(false)}>
          <EyeOff className="size-3.5" />
        </Button>
      </div>
      {/* The box fits the window under the sticky header, leaving room for a footer (the layout meters). */}
      <div
        ref={boxRef}
        className={cn(
          'relative min-h-80 overflow-hidden bg-muted/30',
          footer ? 'h-[min(640px,calc(100dvh-24rem))]' : 'h-[min(640px,calc(100dvh-12rem))]',
        )}
      >
        {state.kind === 'ready' && refused && (
          <p role="status" className="absolute inset-x-0 top-0 z-10 border-b border-warning/40 bg-card px-3 py-2 text-xs text-warning">
            The preview shows the last version the server accepted. {refused}
          </p>
        )}
        {state.kind === 'ready' ? (
          <iframe
            key={frameKey}
            ref={frame}
            src={withQuery(state.url, query)}
            title="Preview of the page with your unsaved changes"
            className="absolute top-0 left-0 origin-top-left border-0 bg-white"
            style={{ width, height: fixed ?? box.h / scale, transform: `scale(${scale})` }}
          />
        ) : (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            {state.kind === 'starting' && (
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Starting the preview…
              </span>
            )}
            {state.kind === 'unavailable' && (
              <span className="max-w-xs">
                <MonitorSmartphone className="mx-auto mb-2 size-6" aria-hidden />
                The preview is available once the preview route ships. Until then, save a draft and check the page after
                publishing with “View live”.
              </span>
            )}
            {state.kind === 'busy' && <span>Preview paused for a moment.</span>}
            {state.kind === 'error' && (
              <span className="max-w-xs">
                {state.message}{' '}
                <button type="button" className="text-primary underline" onClick={() => void start()}>
                  Try again
                </button>
              </span>
            )}
          </div>
        )}
      </div>
      <div className={cn('flex flex-wrap items-center gap-3 border-t px-3 py-2', !footer && 'hidden')}>{footer}</div>
    </section>
  );
}
