'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useInView } from '@/lib/hooks/useInView';
import { applyQuotes, type LiveView, type QuotesEvent } from '@/market/live';
import { marketPath } from '@/market/paths';
import type {
  MarketQuote,
  QuotesData,
  Snapshot as MarketSnapshot,
} from '@/market/types';

/**
 * Where widgets and market modules get market data, and a tiny shared store:
 * every widget on a page asking for the same address shares one request and
 * one refresh timer (the shortest interval any of them wants), polling
 * pauses while the tab is hidden (`document.hidden`, spec §5.15), and
 * nothing is fetched twice at once. On the website the snapshot and ticker
 * come live from the price stream instead, while the tab is visible; polling
 * takes over whenever the stream goes quiet.
 *
 * Build every address with `marketPath` (src/market/paths.ts): the proxy and
 * the API cache by exact address (spec §7.0 rule 1).
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
type StreamedPath = (typeof STREAMED)[number];
/** The stream counts as working while it has spoken this recently. */
const STREAM_FRESH_MS = 25_000;
/** A connecting stream gets this long to answer before the first fetch. */
const STREAM_GRACE_MS = 2_500;
const isStreamed = (path: string) => (STREAMED as readonly string[]).includes(path);

interface Live {
  source: EventSource;
  view: LiveView | null;
  heardAt: number;
}

/** Whether a streamed move changes what a reader sees for that quote. */
function moves(q: MarketQuote, m: QuotesEvent['quotes'][number]) {
  return (
    q.ltp !== m.ltp ||
    q.change !== m.change ||
    q.changePct !== m.changePct ||
    q.label !== m.label
  );
}

/** Whether any quote in `ev` changes a value in `list`. */
function listMoved(list: MarketQuote[], ev: QuotesEvent) {
  if (!ev.quotes.length || !list.length) return false;
  const byRef = new Map(list.map((q) => [q.ref, q]));
  return ev.quotes.some((m) => {
    const q = byRef.get(m.ref);
    return !!q && moves(q, m);
  });
}

class MarketStore {
  private readonly entries = new Map<string, Entry>();
  private live: Live | null = null;
  /** Stream moves per streamed list (never counting an `init`). */
  private readonly pulses: Record<StreamedPath, number> = {
    snapshot: 0,
    ticker: 0,
  };
  private readonly pulseListeners = new Set<() => void>();

  constructor(private readonly mode: WidgetMode) {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.syncLive();
        if (document.hidden) return;
        // Back on the tab: refresh anything due.
        for (const [path, e] of this.entries) {
          const every = this.every(e);
          if (
            !every ||
            Date.now() - e.loadedAt <= every * 1000 ||
            this.streaming(path)
          )
            continue;
          // syncLive() has just reopened the stream, whose first picture is
          // on its way: a streamed list waits for it, as on first load,
          // instead of a poll that could land after it with older data.
          if (this.live && isStreamed(path)) this.schedule(path, STREAM_GRACE_MS);
          else void this.load(path);
        }
      });
    }
  }

  /** Whether the live stream is keeping `path` current right now. */
  private streaming(path: string) {
    return (
      !!this.live?.view &&
      isStreamed(path) &&
      Date.now() - this.live.heardAt < STREAM_FRESH_MS
    );
  }

  /** Opens the stream while a visible page shows streamed data; else closes it. */
  private syncLive() {
    const want =
      this.mode === 'public' &&
      typeof EventSource !== 'undefined' &&
      !document.hidden &&
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
        if (!live.view) return;
        const ev = JSON.parse(data) as QuotesEvent;
        const before = live.view;
        live.view = applyQuotes(before, ev);
        this.countPulses(before, ev);
      });
      on('ping', () => undefined);
      this.live = live;
    } else if (!want && this.live) {
      this.live.source.close();
      this.live = null;
    }
  }

  /**
   * One pulse per streamed list a `quotes` event actually changed (spec
   * §6.3: never on `init`, never for a move that changes nothing shown).
   */
  private countPulses(before: LiveView, ev: QuotesEvent) {
    let moved = false;
    if (listMoved(before.snapshot.instruments, ev)) {
      this.pulses.snapshot++;
      moved = true;
    }
    if (listMoved(before.ticker.items, ev)) {
      this.pulses.ticker++;
      moved = true;
    }
    if (moved) this.pulseListeners.forEach((l) => l());
  }

  readonly subscribePulse = (listener: () => void) => {
    this.pulseListeners.add(listener);
    return () => {
      this.pulseListeners.delete(listener);
    };
  };

  pulse(path: StreamedPath): number {
    return this.pulses[path];
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
    else if (this.live && isStreamed(path))
      this.schedule(path, STREAM_GRACE_MS);
    else void this.load(path);
    return () => {
      const cur = this.entries.get(path);
      if (!cur) return;
      cur.listeners.delete(listener);
      cur.intervals.delete(id);
      if (cur.listeners.size === 0) {
        // Dropped only if nobody subscribes again at once: a component that
        // changes its refresh (a chart leaving the viewport) unsubscribes
        // and resubscribes in one commit, and keeps the address's data, its
        // timer's due time and any request in flight.
        queueMicrotask(() => {
          if (this.entries.get(path) !== cur || cur.listeners.size > 0) return;
          if (cur.timer) clearTimeout(cur.timer);
          cur.timer = null;
          // A request still out keeps the entry: a quick resubscribe adopts
          // its answer instead of asking again; load() drops the entry when
          // the answer lands with nobody listening.
          if (cur.inFlight) return;
          this.entries.delete(path);
          this.syncLive();
        });
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
      // Polling pauses on a hidden tab (the visibilitychange handler above
      // refreshes what fell due), and while the stream has the address.
      if (document.hidden || this.streaming(path)) {
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
    // The entry itself, not just the address: a replaced entry never takes
    // a dead one's answer (or has its timer re-armed by it).
    if (this.entries.get(path) !== e) return;
    if (e.listeners.size === 0) {
      // Everyone left while the request was out (see subscribe()).
      this.entries.delete(path);
      this.syncLive();
      return;
    }
    // The stream spoke while this poll was out: its picture is newer, so
    // the poll's (the proxy keeps it up to 5 s) never steps it back.
    if (this.streaming(path)) {
      this.schedule(path);
      return;
    }
    e.snapshot = next;
    e.listeners.forEach((l) => l());
    this.schedule(path);
  }
}

const stores: Partial<Record<WidgetMode, MarketStore>> = {};
const storeFor = (mode: WidgetMode) => (stores[mode] ??= new MarketStore(mode));

const ModeContext = createContext<WidgetMode>('public');

/**
 * Whether the article widget around a hook is within 200 px of the viewport
 * (spec §7.12 layer 1: polled modules fetch only near the screen). null
 * outside a widget: the market modules gate themselves (useInViewMarket).
 */
const WidgetInViewContext = createContext<boolean | null>(null);

/**
 * The box around one article widget (Widget.tsx) that tells the data hooks
 * inside it whether it is near the screen: off screen they keep their
 * subscription and last answer but stop polling; back in view they refresh
 * whatever fell due. A widget's FIRST answer still loads at mount (the
 * story's server HTML has only skeletons, and widgets-e2e reads every
 * widget without scrolling). A plain block with no padding or border, so
 * the card's margins collapse through it as before.
 */
export function WidgetView({ children }: { children: ReactNode }) {
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '200px' });
  return (
    <div ref={ref}>
      <WidgetInViewContext.Provider value={inView}>{children}</WidgetInViewContext.Provider>
    </div>
  );
}

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
 * Market data at `path` (e.g. "snapshot", "quotes?symbols=NSE%3AINFY"; build
 * it with `marketPath`), refreshed every `refresh` seconds (0 = once). Null
 * path = nothing yet. Server render and hydration see `{ loading: true }`.
 */
export function useMarket<T>(
  path: string | null,
  refresh: number,
): Snapshot<T> {
  const store = storeFor(useContext(ModeContext));
  const id = useId();
  // Inside an article widget, poll only while it is near the screen.
  const every = useContext(WidgetInViewContext) === false ? 0 : refresh;
  const subscribe = useCallback(
    (listener: () => void) =>
      path ? store.subscribe(path, id, every, listener) : () => {},
    [store, path, id, every],
  );
  const read = useCallback(
    () => (path ? store.read(path) : EMPTY),
    [store, path],
  );
  return useSyncExternalStore(subscribe, read, () => EMPTY) as Snapshot<T>;
}

/** The market snapshot: streamed on the website, polled in the portal. */
export function useSnapshot(refresh: number) {
  return useMarket<MarketSnapshot>(marketPath.snapshot(), refresh);
}

/** Quote polling floors (spec §7.12 rule 5), in seconds. */
const QUOTES_MIN_S = 30;
const QUOTES_EOD_S = 300;

/** Curated quotes replaced by the snapshot's own value when it is as new. */
function withSnapshot(
  data: QuotesData | undefined,
  snap: MarketSnapshot | undefined,
): QuotesData | undefined {
  if (!data || !snap?.instruments?.length) return data;
  const curated = new Map(snap.instruments.map((q) => [q.ref, q]));
  let changed = false;
  const quotes = data.quotes.map((q) => {
    const s = curated.get(q.ref);
    if (s && s !== q && s.asOf >= q.asOf) {
      changed = true;
      return s;
    }
    return q;
  });
  return changed ? { ...data, quotes } : data;
}

/**
 * Quotes for `refs`, asked for as one canonical set (sorted, each once, at
 * most 20; `marketPath.quotes`). On the website a curated ref then shows the
 * streamed snapshot's value whenever that is at least as new, so a curated
 * price is as fresh as the ticker (spec §7.0 rule 1). Read a quote with
 * `data.quotes.find((q) => q.ref === REF)`, REF upper case.
 */
export function useQuotes(
  refs: readonly string[],
  refresh: number,
): Snapshot<QuotesData> {
  const mode = useContext(ModeContext);
  // Spec §7.12 rule 5: quotes poll at most every 30 s, and every 300 s once
  // the answer says End of day (0 still means "load once"). Curated refs
  // follow the stream through the snapshot below, whatever this interval.
  const [eod, setEod] = useState(false);
  const every =
    refresh > 0 ? Math.max(refresh, eod ? QUOTES_EOD_S : QUOTES_MIN_S) : 0;
  const res = useMarket<QuotesData>(marketPath.quotes(refs), every);
  const snap = useMarket<MarketSnapshot>(
    mode === 'public' && refs.length ? marketPath.snapshot() : null,
    refresh,
  );
  useEffect(() => {
    const qs = res.data?.quotes;
    setEod(!!qs?.length && qs.every((q) => q.label === 'EOD'));
  }, [res.data]);
  return useMemo(() => {
    const data = withSnapshot(res.data, snap.data);
    return data === res.data ? res : { ...res, data };
  }, [res, snap.data]);
}

/**
 * A counter that goes up each time the price stream changes a value shown
 * in `path`'s list: the snapshot's instruments or the ticker's items. Never
 * on the stream's first picture (`init`). 0 on the server and while the page
 * hydrates; it moves only while some module on the page shows that list
 * (the stream is open only then). PulseDot reads it.
 */
export function useStreamPulse(path: 'snapshot' | 'ticker'): number {
  const store = storeFor(useContext(ModeContext));
  const read = useCallback(() => store.pulse(path), [store, path]);
  return useSyncExternalStore(store.subscribePulse, read, () => 0);
}
