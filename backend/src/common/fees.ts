// Indian discount-broker fee schedules. Two flavours:
//   DELIVERY (CNC): T+1 settlement, full STT both sides, ₹0 brokerage,
//                   0.015% stamp duty on buy.
//   INTRADAY (MIS): square-off same day, 0.025% STT sell-side only,
//                   0.003% stamp duty on buy, brokerage = min(₹20, 0.03%).
// All math in BigInt paise.

export interface FeeBreakdown {
  brokerage: bigint;
  stt: bigint;
  exchange: bigint;
  sebi: bigint;
  stampDuty: bigint;
  gst: bigint;
  total: bigint;
}

interface ComputeArgs {
  side: 'BUY' | 'SELL';
  exchange: string;
  notionalP: bigint;
  intraday?: boolean;
}

const BROKERAGE_CAP_P = 2000n; // ₹20 in paise

function bigintMin(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function computeFees({
  side,
  exchange,
  notionalP,
  intraday = false,
}: ComputeArgs): FeeBreakdown {
  const exchangeRate = exchange === 'BSE' ? 375n : 297n;
  const exchangeCharge = (notionalP * exchangeRate) / 10_000_000n;
  const sebi = notionalP / 1_000_000n;

  let brokerage: bigint;
  let stt: bigint;
  let stampDuty: bigint;
  if (intraday) {
    brokerage = bigintMin((notionalP * 3n) / 10_000n, BROKERAGE_CAP_P);
    stt = side === 'SELL' ? (notionalP * 25n) / 100_000n : 0n;
    stampDuty = side === 'BUY' ? (notionalP * 3n) / 100_000n : 0n;
  } else {
    brokerage = 0n;
    stt = (notionalP * 10n) / 10_000n;
    stampDuty = side === 'BUY' ? (notionalP * 15n) / 100_000n : 0n;
  }
  const gstBase = brokerage + exchangeCharge + sebi;
  const gst = (gstBase * 18n) / 100n;
  const total = brokerage + stt + exchangeCharge + sebi + stampDuty + gst;
  return { brokerage, stt, exchange: exchangeCharge, sebi, stampDuty, gst, total };
}
