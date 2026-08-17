import { Exchange } from '../common/exchange';

/**
 * The complete, fixed set of instruments the public FinCalc feed will ever
 * stream.
 *
 * Hard-coded on purpose — this is the feed's most important security property.
 * A client cannot ask for an arbitrary Angel One token, so the endpoint can
 * never be turned into a free market-data proxy for the whole exchange, and the
 * upstream subscription cost stays a known constant (10 tokens) regardless of
 * how many apps or devices connect.
 *
 * `lookup` is resolved through ScripMasterService. Indices resolve by their
 * short name (Angel ships `symbol: "Nifty 50"`, `name: "NIFTY"`, and the
 * scrip-master indexes both); commodities resolve to the front-month MCX
 * future, which rolls monthly and is therefore re-resolved on a timer.
 */

export type InstrumentKind = 'index' | 'commodity';

export interface UniverseEntry {
  /** Stable public id. This is the client contract — never rename one. */
  id: string;
  /** Display name shown in FinCalc. */
  name: string;
  kind: InstrumentKind;
  exchange: Extract<Exchange, 'NSE' | 'BSE' | 'MCX'>;
  /** Scrip-master lookup key. */
  lookup: string;
  /** Quote unit, commodities only (gold is quoted per 10 grams, etc.). */
  unit?: string;
}

// Kept one-instrument-per-line: this is a table, and it reads as one.
// prettier-ignore
export const FEED_UNIVERSE: readonly UniverseEntry[] = [
  // ── Indices ─────────────────────────────────────────────────────────────
  { id: 'NIFTY50', name: 'Nifty 50', kind: 'index', exchange: 'NSE', lookup: 'NIFTY' },
  { id: 'BANKNIFTY', name: 'Bank Nifty', kind: 'index', exchange: 'NSE', lookup: 'BANKNIFTY' },
  { id: 'FINNIFTY', name: 'Nifty Financial', kind: 'index', exchange: 'NSE', lookup: 'FINNIFTY' },
  { id: 'NIFTYNXT50', name: 'Nifty Next 50', kind: 'index', exchange: 'NSE', lookup: 'NIFTYNXT50' },
  { id: 'SENSEX', name: 'Sensex', kind: 'index', exchange: 'BSE', lookup: 'SENSEX' },
  { id: 'BANKEX', name: 'BSE Bankex', kind: 'index', exchange: 'BSE', lookup: 'BANKEX' },

  // ── Commodities (MCX front-month futures) ───────────────────────────────
  { id: 'GOLD', name: 'Gold', kind: 'commodity', exchange: 'MCX', lookup: 'GOLD', unit: '10 g' },
  { id: 'SILVER', name: 'Silver', kind: 'commodity', exchange: 'MCX', lookup: 'SILVER', unit: '1 kg' },
  { id: 'CRUDEOIL', name: 'Crude Oil', kind: 'commodity', exchange: 'MCX', lookup: 'CRUDEOIL', unit: '1 bbl' },
  { id: 'NATURALGAS', name: 'Natural Gas', kind: 'commodity', exchange: 'MCX', lookup: 'NATURALGAS', unit: '1 mmBtu' },
];

export const FEED_UNIVERSE_IDS: readonly string[] = FEED_UNIVERSE.map(
  (e) => e.id,
);

const BY_ID = new Map(FEED_UNIVERSE.map((e) => [e.id, e]));

export function isFeedInstrumentId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}
