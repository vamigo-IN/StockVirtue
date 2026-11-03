import type { MarketQuote, Snapshot, TickerData } from './types';

/**
 * The live price stream (/api/market/stream): `init` carries the whole
 * picture, `quotes` only the quotes that moved, `ping` says the stream is
 * alive while prices stand still.
 */
export interface LiveView {
  snapshot: Snapshot;
  ticker: TickerData;
}

export type QuoteMove = Pick<
  MarketQuote,
  | 'ref'
  | 'ltp'
  | 'open'
  | 'high'
  | 'low'
  | 'prevClose'
  | 'change'
  | 'changePct'
  | 'label'
  | 'asOf'
>;

export interface QuotesEvent {
  generatedAt: string;
  quotes: QuoteMove[];
}

/** The view with the moved quotes applied (new objects, for React). */
export function applyQuotes(view: LiveView, ev: QuotesEvent): LiveView {
  const moved = new Map(ev.quotes.map((q) => [q.ref, q]));
  const merge = (list: MarketQuote[]) =>
    list.map((q) => {
      const m = moved.get(q.ref);
      return m ? { ...q, ...m } : q;
    });
  return {
    snapshot: {
      ...view.snapshot,
      generatedAt: ev.generatedAt,
      instruments: merge(view.snapshot.instruments),
    },
    ticker: {
      ...view.ticker,
      generatedAt: ev.generatedAt,
      items: merge(view.ticker.items),
    },
  };
}
