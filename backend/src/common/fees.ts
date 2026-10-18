// Indian discount-broker fee schedules (Zerodha-style), per market segment.
// All math in BigInt paise; every rate below is applied to the order's
// notional (price × quantity — for options that's the premium turnover).
//
//   EQUITY delivery (CNC): ₹0 brokerage, STT 0.1% both sides, stamp 0.015% buy.
//   EQUITY intraday (MIS): brokerage min(₹20, 0.03%), STT 0.025% sell,
//                          stamp 0.003% buy.
//   FUTURES (index/stock): brokerage min(₹20, 0.03%), STT 0.05% sell (rate
//                          from 1 Apr 2026), exchange 0.00173%, stamp 0.002% buy.
//   OPTIONS:               flat ₹20 brokerage, STT 0.15% of premium on sell
//                          (from 1 Apr 2026), exchange 0.03503%, stamp 0.003% buy.
//   COMMODITY futures:     brokerage min(₹20, 0.03%), CTT 0.01% sell (non-agri),
//                          MCX 0.0021%, stamp 0.002% buy.
//   COMMODITY options:     flat ₹20, CTT 0.05% sell, MCX 0.0418%, stamp 0.003% buy.
//
// SEBI turnover fee ₹10/crore everywhere; GST 18% on brokerage + exchange +
// SEBI. Derivatives charge the same whether carried (NRML) or intraday (MIS).

export interface FeeBreakdown {
  brokerage: bigint;
  stt: bigint;
  exchange: bigint;
  sebi: bigint;
  stampDuty: bigint;
  gst: bigint;
  total: bigint;
}

export type FeeSegment =
  | 'EQUITY'
  | 'FUTURES'
  | 'OPTIONS'
  | 'COMMODITY_FUTURES'
  | 'COMMODITY_OPTIONS';

interface ComputeArgs {
  side: 'BUY' | 'SELL';
  exchange: string;
  notionalP: bigint;
  intraday?: boolean;
  /** Defaults to EQUITY — pass feeSegmentFor(...) for derivatives. */
  segment?: FeeSegment;
}

const BROKERAGE_CAP_P = 2000n; // ₹20 in paise

function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/**
 * Segment from what is stored on an order/position row. F&O tradingsymbols
 * end in CE / PE (options) or FUT (futures); cash scrips never do on NFO/BFO/
 * MCX, and NSE/BSE rows are always cash equity.
 */
export function feeSegmentFor(
  exchange: string,
  tradingsymbol: string,
): FeeSegment {
  const sym = tradingsymbol.toUpperCase();
  const isOption = sym.endsWith('CE') || sym.endsWith('PE');
  if (exchange === 'MCX' || exchange === 'NCO') {
    return isOption ? 'COMMODITY_OPTIONS' : 'COMMODITY_FUTURES';
  }
  if (exchange === 'NFO' || exchange === 'BFO' || exchange === 'CDS') {
    return isOption ? 'OPTIONS' : 'FUTURES';
  }
  return 'EQUITY';
}

/** `rate` expressed as numerator / denominator, applied to notional. */
function pct(notionalP: bigint, num: bigint, den: bigint): bigint {
  return (notionalP * num) / den;
}

export function computeFees({
  side,
  exchange,
  notionalP,
  intraday = false,
  segment = 'EQUITY',
}: ComputeArgs): FeeBreakdown {
  const isBuy = side === 'BUY';
  const sebi = notionalP / 1_000_000n; // ₹10 / crore = 0.0001%

  let brokerage: bigint;
  let stt: bigint;
  let exchangeCharge: bigint;
  let stampDuty: bigint;
  switch (segment) {
    case 'FUTURES':
      brokerage = bigintMin(pct(notionalP, 3n, 10_000n), BROKERAGE_CAP_P);
      stt = isBuy ? 0n : pct(notionalP, 5n, 10_000n); // 0.05%
      exchangeCharge =
        exchange === 'BFO' ? 0n : pct(notionalP, 173n, 10_000_000n); // 0.00173%
      stampDuty = isBuy ? pct(notionalP, 2n, 100_000n) : 0n; // 0.002%
      break;
    case 'OPTIONS':
      brokerage = bigintMin(notionalP, BROKERAGE_CAP_P);
      stt = isBuy ? 0n : pct(notionalP, 15n, 10_000n); // 0.15%
      exchangeCharge =
        exchange === 'BFO'
          ? pct(notionalP, 325n, 1_000_000n) // 0.0325%
          : pct(notionalP, 3503n, 10_000_000n); // 0.03503%
      stampDuty = isBuy ? pct(notionalP, 3n, 100_000n) : 0n; // 0.003%
      break;
    case 'COMMODITY_FUTURES':
      brokerage = bigintMin(pct(notionalP, 3n, 10_000n), BROKERAGE_CAP_P);
      stt = isBuy ? 0n : pct(notionalP, 1n, 10_000n); // CTT 0.01%
      exchangeCharge = pct(notionalP, 21n, 1_000_000n); // 0.0021%
      stampDuty = isBuy ? pct(notionalP, 2n, 100_000n) : 0n; // 0.002%
      break;
    case 'COMMODITY_OPTIONS':
      brokerage = bigintMin(notionalP, BROKERAGE_CAP_P);
      stt = isBuy ? 0n : pct(notionalP, 5n, 10_000n); // CTT 0.05%
      exchangeCharge = pct(notionalP, 418n, 1_000_000n); // 0.0418%
      stampDuty = isBuy ? pct(notionalP, 3n, 100_000n) : 0n; // 0.003%
      break;
    case 'EQUITY':
    default: {
      const exchangeRate = exchange === 'BSE' ? 375n : 297n;
      exchangeCharge = (notionalP * exchangeRate) / 10_000_000n;
      if (intraday) {
        brokerage = bigintMin(pct(notionalP, 3n, 10_000n), BROKERAGE_CAP_P);
        stt = isBuy ? 0n : pct(notionalP, 25n, 100_000n);
        stampDuty = isBuy ? pct(notionalP, 3n, 100_000n) : 0n;
      } else {
        brokerage = 0n;
        stt = pct(notionalP, 10n, 10_000n);
        stampDuty = isBuy ? pct(notionalP, 15n, 100_000n) : 0n;
      }
    }
  }
  const gstBase = brokerage + exchangeCharge + sebi;
  const gst = (gstBase * 18n) / 100n;
  const total = brokerage + stt + exchangeCharge + sebi + stampDuty + gst;
  return {
    brokerage,
    stt,
    exchange: exchangeCharge,
    sebi,
    stampDuty,
    gst,
    total,
  };
}
