'use client';

import { useCallback, useMemo } from 'react';
import { useQuotes, useSnapshot } from '@/components/widgets/data';
import { useInView } from '@/lib/hooks/useInView';
import type { DataRight, MarketQuote, Snapshot } from '@/market/types';

/** One stock a story names (`NewsArticle.stocks`). */
export type StoryStock = { exchange: string; symbol: string; name: string | null };

/** "NSE:TCS": the story's own exchange (a BSE-tagged stock is priced on BSE). */
export function storyRef(stock: StoryStock): string {
  return `${stock.exchange}:${stock.symbol}`.trim().toUpperCase();
}

/** Non-curated quotes poll this often while their module is near the screen. */
const POLL_S = 30;

export interface StoryQuote {
  quote: MarketQuote;
  /** From live data (a poll or the stream), not the server's snapshot. */
  live: boolean;
}

/**
 * The prices of a story's stocks, shared by the StocksStrip and the rail's
 * lead stock card (spec §5.12, §7.6): ONE `quotes?symbols=` request for the
 * whole sorted set (both modules pass the same stocks, so the market store
 * gives them one address, one request and one timer). Each caller polls
 * every 30 s while it is within 200 px of the viewport; the store keeps the
 * shortest interval any caller wants, and pauses on a hidden tab.
 *
 * A curated stock is read from the snapshot: the server's `initial` on the
 * server and during hydration (so its price is in the HTML and hydration
 * matches), then the streamed one. Everything else comes from the quotes
 * answer, which the browser fetches; there is no server-side quote request
 * on a story (spec §7.6, §7.12).
 */
export function useStoryQuotes(stocks: StoryStock[], initial: Snapshot | null) {
  const [viewRef, inView] = useInView<HTMLDivElement>({ rootMargin: '200px' });
  const refs = useMemo(() => stocks.map(storyRef), [stocks]);
  const res = useQuotes(refs, inView ? POLL_S : 0);
  const live = useSnapshot(15);
  const snap = live.data ?? initial;

  const quoteFor = useCallback(
    (ref: string): StoryQuote | undefined => {
      const REF = ref.toUpperCase();
      const answered = res.data?.quotes.find((q) => q.ref.toUpperCase() === REF);
      if (answered) return { quote: answered, live: true };
      const curated = snap?.instruments.find(
        (q) => q.kind === 'STOCK' && q.ref.toUpperCase() === REF,
      );
      return curated ? { quote: curated, live: !!live.data } : undefined;
    },
    [res.data, snap, live.data],
  );

  const right: DataRight | undefined = res.data?.right ?? snap?.right;
  return {
    viewRef,
    quoteFor,
    attribution: res.data?.attribution ?? snap?.attribution,
    right,
    delayMinutes: snap?.delayMinutes,
    /** No quotes answer yet and no failure: still loading. */
    loading: !res.data && !res.error,
    /** The last quotes request failed (no answer, or a 4xx/5xx). */
    failed: !!res.error,
    /** A quotes answer arrived. */
    answered: !!res.data,
  };
}
