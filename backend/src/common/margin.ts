// Per-underlying margin model for F&O shorts. Real SPAN+exposure varies by
// instrument volatility; this table approximates Zerodha/Upstox retail rates.
// Index F&O carry lower margin than single-stock F&O.

import { commoditySpec } from './contract-specs';

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
  return (
    instrumentType.startsWith('OPT') ||
    instrumentType.startsWith('FUT')
  );
}

/** Futures (index, stock, commodity) — traded on margin, not full value. */
export function isFutureInstrumentType(instrumentType: string): boolean {
  return instrumentType.startsWith('FUT');
}

// Initial margin for a LONG futures position, as a share of contract value.
// Mirrors exchange SPAN + exposure margin at retail brokers: index futures
// ≈ 12%, single-stock futures ≈ 20%, commodities per contract (see
// contract-specs). Rounded teaching values, not live SPAN files.
const INDEX_FUTURES_BPS = 1200n;
const STOCK_FUTURES_BPS = 2000n;
const COMMODITY_DEFAULT_BPS = 1200n;

export function futuresMarginBps(exchange: string, underlying: string): bigint {
  if (exchange === 'MCX' || exchange === 'NCO') {
    const spec = commoditySpec(exchange, underlying);
    return spec ? BigInt(spec.marginBps) : COMMODITY_DEFAULT_BPS;
  }
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
