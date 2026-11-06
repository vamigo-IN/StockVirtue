'use client';

import { useEffect, useState } from 'react';
import { useMarket } from '@/components/widgets/data';
import { useInView } from '@/lib/hooks/useInView';

/** Market modules start loading this far before they scroll into view. */
export const IN_VIEW_MARGIN = '200px';

export interface InViewMarket<T> {
  /** Put on the module's root (any element with a box). */
  ref: (el: Element | null) => void;
  /** The latest answer for `path`, or the last one kept while out of view. */
  data?: T;
  /** The last refresh failed ('unavailable' or 'not_found'); `data` is older. */
  error?: string;
  /** Nothing to show yet: render the skeleton at the final height. */
  loading: boolean;
}

/**
 * A polled market address (movers, sectors, heatmap, chart, quotes, IPOs)
 * that loads only once the module comes within 200 px of the viewport
 * (spec §4.10, §5.15 rule 5), and polls only while it is there. Scrolled
 * away, it stops polling but keeps its subscription, its last answer and
 * any answer still on its way, so scrolling back shows the old values (with
 * their old stamp) at once and refreshes them when they are due. Inside a
 * closed disclosure the module has no box, so nothing loads until it opens
 * (spec §8.1 item 5); a hidden tab panel likewise stops polling.
 *
 * The server render and hydration see `{ loading: true }` with no data, so
 * polled modules render their skeleton in the HTML (constraints map §6.3).
 * Build `path` with `marketPath` (src/market/paths.ts); null = nothing to
 * ask (for example a licence that can't serve it). `refresh` in seconds;
 * 0 = load once per mount and path.
 */
export function useInViewMarket<T>(
  path: string | null,
  refresh: number,
): InViewMarket<T> {
  const [ref, inView] = useInView<Element>({ rootMargin: IN_VIEW_MARGIN });
  // The path this module has asked for while in view: kept when it scrolls
  // away. A path never seen in view isn't asked for.
  const [seen, setSeen] = useState<string | null>(null);
  useEffect(() => {
    if (inView && path) setSeen(path);
  }, [inView, path]);
  const ask = path && (inView || seen === path) ? path : null;
  const res = useMarket<T>(ask, inView ? refresh : 0);
  const [kept, setKept] = useState<{ path: string; data: T } | null>(null);
  useEffect(() => {
    if (path && res.data !== undefined) setKept({ path, data: res.data });
  }, [path, res.data]);
  const last = kept && kept.path === path ? kept.data : undefined;
  const data = res.data ?? last;
  const error = ask ? res.error : undefined;
  return {
    ref,
    data,
    error,
    loading: data === undefined && !error,
  };
}
