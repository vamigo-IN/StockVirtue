'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useSyncExternalStore,
} from 'react';
import { applyQuotes, type LiveView, type QuotesEvent } from '@/market/live';

/**
 * Where widgets get market data, and a tiny shared store: every widget on a
 * page asking for the same address shares one request and one refresh timer
 * (the shortest interval any of them wants), refreshes pause while the tab is
 * hidden, and nothing is fetched twice at once. On the website the snapshot
 * and ticker come live from the price stream instead, while the tab is
 * visible; polling takes over whenever the stream goes quiet.
 *
 *   public  — the website, through its own /api/market proxy;
 *   preview — the portal's editor, through the staff preview API, which may
 *             quote any listed stock (an unpublished story's widgets too).
 */
export type WidgetMode = 'public' | 'preview';

interface Snapshot<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

interface Entry {
  snapshot: Snapshot<unknown>;
  listeners: Set<() => void>;
  intervals: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  loadedAt: number;
}

const EMPTY: Snapshot<never> = { loading: true };

/** Addresses the website's live stream keeps current. */
const STREAMED = ['snapshot', 'ticker'] as const;
/** The stream counts as working while it has spoken this recently. */
const STREAM_FRESH_MS = 25_000;
/** A connecting stream gets this long to answer before the first fetch. */
const STREAM_GRACE_MS = 2_500;

interface Live {
  source: EventSource;
  view: LiveView | null;
  heardAt: number;
}

class MarketStore {
  private readonly entries = new Map<string, Entry>();
  private live: Live | null = null;

  constructor(private readonly mode: WidgetMode) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.syncLive();
        if (document.visibilityState !== 'visible') return;
        // Back on the tab: refresh anything due.
        for (const [path, e] of this.entries) {
          const every = this.every(e);
          if (
            every &&
            Date.now() - e.loadedAt > every * 1000 &&
            !this.streaming(path)
          )
            void this.load(path);
        }
      });
    }
  }

  /** Whether the live stream is keeping `path` current right now. */
  private streaming(path: string) {
    return (
      !!this.live?.view &&
      (STREAMED as readonly string[]).includes(path) &&
      Date.now() - this.live.heardAt < STREAM_FRESH_MS
    );
  }

  /** Opens the stream while a visible page shows streamed data; else closes it. */
  private syncLive() {
    const want =
      this.mode === 'public' &&
      typeof EventSource !== 'undefined' &&
      document.visibilityState === 'visible' &&
      STREAMED.some((p) => this.entries.has(p));
    if (want && !this.live) {
      const live: Live = {
        source: new EventSource('/api/market/stream'),
        view: null,
        heardAt: 0,
      };
      const on = (event: string, apply: (data: string) => void) =>
        live.source.addEventListener(event, (ev) => {
          try {
            apply((ev as MessageEvent<string>).data);
          } catch {
            return;
          }
          live.heardAt = Date.now();
          this.publishLive();
        });
      on('init', (data) => (live.view = JSON.parse(data) as LiveView));
      on('quotes', (data) => {
        if (live.view)
          live.view = applyQuotes(live.view, JSON.parse(data) as QuotesEvent);
      });
      on('ping', () => undefined);
      this.live = live;
    } else if (!want && this.live) {
      this.live.source.close();
      this.live = null;
    }
  }

  /** Hands the stream's latest picture to whoever shows it. */
  private publishLive() {
    const view = this.live?.view;
    if (!view) return;
    for (const path of STREAMED) {
      const e = this.entries.get(path);
      if (!e) continue;
      e.snapshot = {
        data: path === 'snapshot' ? view.snapshot : view.ticker,
        loading: false,
      };
      e.loadedAt = Date.now();
      e.listeners.forEach((l) => l());
    }
  }

  private url(path: string) {
    return this.mode === 'public'
      ? `/api/market/${path}`
      : `/admin/api/staff/market/preview/${path}`;
  }

  private every(e: Entry): number {
    const positive = [...e.intervals.values()].filter((s) => s > 0);
    return positive.length ? Math.min(...positive) : 0;
  }

  read(path: string): Snapshot<unknown> {
    return this.entries.get(path)?.snapshot ?? EMPTY;
  }

  subscribe(path: string, id: string, refresh: number, listener: () => void) {
    let e = this.entries.get(path);
    if (!e) {
      e = {
        snapshot: EMPTY,
        listeners: new Set(),
        intervals: new Map(),
        timer: null,
        inFlight: false,
        loadedAt: 0,
      };
      this.entries.set(path, e);
    }
    e.listeners.add(listener);
    e.intervals.set(id, refresh);
    this.syncLive();
    if (!e.loadedAt && this.streaming(path)) this.publishLive();
    if (e.loadedAt || e.inFlight) this.schedule(path);
    else if (this.live && (STREAMED as readonly string[]).includes(path))
      this.schedule(path, STREAM_GRACE_MS);
    else void this.load(path);
    return () => {
      const cur = this.entries.get(path);
      if (!cur) return;
      cur.listeners.delete(listener);
      cur.intervals.delete(id);
      if (cur.listeners.size === 0) {
        if (cur.timer) clearTimeout(cur.timer);
        this.entries.delete(path);
        this.syncLive();
      } else {
        this.schedule(path);
      }
    };
  }

  private schedule(path: string, after?: number) {
    const e = this.entries.get(path);
    if (!e) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    const every = this.every(e);
    if (!every && after === undefined) return;
    const wait = after ?? Math.max(0, e.loadedAt + every * 1000 - Date.now());
    e.timer = setTimeout(() => {
      // A hidden tab, or the stream has it: look again in a while.
      if (document.visibilityState === 'hidden' || this.streaming(path)) {
        if (every) this.schedule(path, every * 1000);
        return;
      }
      void this.load(path);
    }, wait);
  }

  private async load(path: string) {
    const e = this.entries.get(path);
    if (!e || e.inFlight) return;
    e.inFlight = true;
    let next: Snapshot<unknown>;
    try {
      const res = await fetch(this.url(path), {
        headers: this.mode === 'preview' ? { 'x-sv-portal': '1' } : {},
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as unknown;
      next = res.ok
        ? { data: body, loading: false }
        : {
            data: e.snapshot.data,
            loading: false,
            error: res.status === 404 ? 'not_found' : 'unavailable',
          };
    } catch {
      // Keep showing the last good values; the stamp shows their age.
      next = { data: e.snapshot.data, loading: false, error: 'unavailable' };
    }
    e.inFlight = false;
    e.loadedAt = Date.now();
    if (!this.entries.has(path)) return;
    e.snapshot = next;
    e.listeners.forEach((l) => l());
    this.schedule(path);
  }
}

const stores: Partial<Record<WidgetMode, MarketStore>> = {};
const storeFor = (mode: WidgetMode) => (stores[mode] ??= new MarketStore(mode));

const ModeContext = createContext<WidgetMode>('public');

export function WidgetDataProvider({
  mode,
  children,
}: {
  mode: WidgetMode;
  children: React.ReactNode;
}) {
  return <ModeContext.Provider value={mode}>{children}</ModeContext.Provider>;
}

export function useWidgetMode() {
  return useContext(ModeContext);
}

/**
 * Market data at `path` (e.g. "snapshot", "quotes?symbols=NSE:INFY"),
 * refreshed every `refresh` seconds (0 = once). Null path = nothing yet.
 */
export function useMarket<T>(
  path: string | null,
  refresh: number,
): Snapshot<T> {
  const store = storeFor(useContext(ModeContext));
  const id = useId();
  const subscribe = useCallback(
    (listener: () => void) =>
      path ? store.subscribe(path, id, refresh, listener) : () => {},
    [store, path, id, refresh],
  );
  const read = useCallback(
    () => (path ? store.read(path) : EMPTY),
    [store, path],
  );
  return useSyncExternalStore(subscribe, read, () => EMPTY) as Snapshot<T>;
}
