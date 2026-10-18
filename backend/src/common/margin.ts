// Per-underlying margin model for F&O shorts. Real SPAN+exposure varies by
// instrument volatility; this table approximates Zerodha/Upstox retail rates.
// Index F&O carry lower margin than single-stock F&O.

import { isCommodityExchange } from './contract-specs';

const BPS_DIVISOR = 10000n;
const INDEX_MARGIN_BPS = 1500n; // 15%
const STOCK_MARGIN_BPS = 2200n; // 22%

const INDEX_UNDERLYINGS: ReadonlySet<string> = new Set([
  'NIFTY',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'SENSEX',
  'BANKEX',
  'SENSEX50',
]);

export function isFnoInstrumentType(instrumentType: string): boolean {
  return instrumentType.startsWith('OPT') || instrumentType.startsWith('FUT');
}

/** Futures contracts (index, stock or commodity). */
export function isFutureInstrumentType(instrumentType: string): boolean {
  return instrumentType.startsWith('FUT');
}

/**
 * Whether a futures BUY is traded on margin. Equity F&O futures are (like a
 * real broker); commodities are not — the simulator trades them by the unit
 * at full value (see contract-specs).
 */
export function isMarginTraded(
  instrumentType: string,
  exchange: string,
): boolean {
  return (
    isFutureInstrumentType(instrumentType) && !isCommodityExchange(exchange)
  );
}

// Initial margin for a LONG equity futures position, as a share of contract
// value. Mirrors exchange SPAN + exposure margin at retail brokers: index
// futures ≈ 12%, single-stock futures ≈ 20%. Rounded teaching values.
const INDEX_FUTURES_BPS = 1200n;
const STOCK_FUTURES_BPS = 2000n;

export function futuresMarginBps(
  _exchange: string,
  underlying: string,
): bigint {
  return INDEX_UNDERLYINGS.has(underlying.toUpperCase())
    ? INDEX_FUTURES_BPS
    : STOCK_FUTURES_BPS;
}

/** Initial margin (paise) a futures BUY of `notionalP` contract value blocks. */
export function futuresMarginP(
  notionalP: bigint,
  exchange: string,
  underlying: string,
): bigint {
  if (notionalP <= 0n) return 0n;
  return (notionalP * futuresMarginBps(exchange, underlying)) / BPS_DIVISOR;
}

export function marginRateBps(underlying: string): bigint {
  return INDEX_UNDERLYINGS.has(underlying.toUpperCase())
    ? INDEX_MARGIN_BPS
    : STOCK_MARGIN_BPS;
}

/**
 * Initial margin (paise) for a short position of qty contracts at avgPrice on
 * the named underlying. Index F&O charges a lower rate than single-stock F&O
 * to reflect lower volatility / exposure.
 */
export function requiredMarginP(
  qtyAbs: number,
  avgPriceP: bigint,
  underlying: string,
): bigint {
  if (qtyAbs <= 0) return 0n;
  const notional = avgPriceP * BigInt(qtyAbs);
  return (notional * marginRateBps(underlying)) / BPS_DIVISOR;
}
