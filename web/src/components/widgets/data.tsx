'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useSyncExternalStore,
} from 'react';

/**
 * Where widgets get market data, and a tiny shared store: every widget on a
 * page asking for the same address shares one request and one refresh timer
 * (the shortest interval any of them wants), refreshes pause while the tab is
 * hidden, and nothing is fetched twice at once.
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

class MarketStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly mode: WidgetMode) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        // Back on the tab: refresh anything due.
        for (const [path, e] of this.entries) {
          const every = this.every(e);
          if (every && Date.now() - e.loadedAt > every * 1000)
            void this.load(path);
        }
      });
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
    if (!e.loadedAt && !e.inFlight) void this.load(path);
    else this.schedule(path);
    return () => {
      const cur = this.entries.get(path);
      if (!cur) return;
      cur.listeners.delete(listener);
      cur.intervals.delete(id);
      if (cur.listeners.size === 0) {
        if (cur.timer) clearTimeout(cur.timer);
        this.entries.delete(path);
      } else {
        this.schedule(path);
      }
    };
  }

  private schedule(path: string) {
    const e = this.entries.get(path);
    if (!e) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = null;
    const every = this.every(e);
    if (!every) return;
    const wait = Math.max(0, e.loadedAt + every * 1000 - Date.now());
    e.timer = setTimeout(() => {
      if (document.visibilityState === 'hidden') return this.schedule(path);
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
