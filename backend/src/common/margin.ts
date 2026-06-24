// Per-underlying margin model for F&O shorts. Real SPAN+exposure varies by
// instrument volatility; this table approximates Zerodha/Upstox retail rates.
// Index F&O carry lower margin than single-stock F&O.

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
