import { Exchange } from '../common/exchange';
import { InstrumentKind, UniverseEntry } from './feed.universe';

/** A universe entry once its live Angel One token has been resolved. */
export interface ResolvedFeedInstrument extends UniverseEntry {
  token: string;
  /** Exchange trading symbol — "GOLD05FEB26FUT", "Nifty 50", … */
  tradingSymbol: string;
  /** Contract expiry (DDMMMYYYY) for futures; null for indices. */
  expiry: string | null;
}

/**
 * The wire shape FinCalc renders.
 *
 * This is a published contract: add fields freely, but never rename or remove
 * one — a shipped app version cannot be asked to redeploy.
 */
export interface FeedQuote {
  id: string;
  name: string;
  kind: InstrumentKind;
  exchange: Exchange;
  /** Last traded price, rupees. */
  ltp: number;
  open: number;
  high: number;
  low: number;
  /** Previous session's close — the base for `change`. */
  prevClose: number;
  change: number;
  changePct: number;
  /** Day volume. Always 0 for indices, which do not themselves trade. */
  volume: number;
  /** Quote unit for commodities ("10 g"); null for indices. */
  unit: string | null;
  /** Front-month contract symbol for commodities; null for indices. */
  contract: string | null;
  /** Contract expiry (DDMMMYYYY) for commodities; null for indices. */
  expiry: string | null;
  /** Exchange timestamp of the last price move, ms epoch. 0 = not priced yet. */
  ts: number;
}

/** Advisory session flags so the client can label prices "live" vs "closed". */
export interface FeedMarketStatus {
  equity: boolean;
  commodity: boolean;
}

/** Emitted once on connect, and on request. */
export interface FeedSnapshotFrame {
  ts: number;
  marketOpen: FeedMarketStatus;
  /** Whether the upstream broker feed is currently connected. */
  live: boolean;
  data: FeedQuote[];
}

/** Emitted every broadcast window, carrying only what changed. */
export interface FeedUpdateFrame {
  ts: number;
  data: FeedQuote[];
}
