import { DepthLevel, ParsedTick, SubscriptionMode } from './tick.types';

// SmartAPI WS V2 binary tick layout. All multi-byte ints are little-endian.
//
//   Header (51 bytes, present in every mode):
//     0     : subscription_mode      (uint8)
//     1     : exchange_type          (uint8)
//     2-26  : token (25b ASCII, NUL-padded)
//     27-34 : sequence_number        (int64)
//     35-42 : exchange_timestamp     (int64, ms epoch)
//     43-50 : last_traded_price      (int64, paise)
//
//   Mode 2 (Quote) — 123 bytes total:
//     51-58 : last_traded_qty        (int64)
//     59-66 : avg_traded_price       (int64, paise)
//     67-74 : volume_for_day         (int64)
//     75-82 : total_buy_qty          (double)
//     83-90 : total_sell_qty         (double)
//     91-98 : open                   (int64, paise)
//     99-106: high                   (int64, paise)
//    107-114: low                    (int64, paise)
//    115-122: close                  (int64, paise)
//
//   Mode 3 (SnapQuote) — 379 bytes total:
//    123-130: last_traded_timestamp  (int64)
//    131-138: open_interest          (int64)
//    139-146: oi_change_percentage   (int64)
//    147-246: best 5 buy levels  (5 × 20 bytes: flag h, qty q, price q, n_orders h)
//    247-346: best 5 sell levels (same layout)
//    347-354: upper_circuit          (int64, paise)
//    355-362: lower_circuit          (int64, paise)
//    363-370: 52w_high               (int64, paise)
//    371-378: 52w_low                (int64, paise)

const HEADER_LEN = 51;
const MODE2_LEN = 123;
const MODE3_LEN = 379;
const DEPTH_ROW_LEN = 20;

export function parseTick(buf: Buffer): ParsedTick | null {
  if (buf.length < HEADER_LEN) return null;
  const mode = buf.readUInt8(0) as SubscriptionMode;
  if (mode < 1 || mode > 4) return null;

  const exchangeType = buf.readUInt8(1);
  const rawToken = buf.subarray(2, 27).toString('ascii');
  const token = rawToken.replace(/\0+$/, '').trim();

  const ts = Number(buf.readBigInt64LE(35));
  const ltp = Number(buf.readBigInt64LE(43)) / 100;

  const tick: ParsedTick = { mode, exchangeType, token, ltp, ts };

  if (mode >= 2 && buf.length >= MODE2_LEN) {
    tick.lastTradedQty = Number(buf.readBigInt64LE(51));
    tick.avgTradedPrice = Number(buf.readBigInt64LE(59)) / 100;
    tick.volume = Number(buf.readBigInt64LE(67));
    tick.open = Number(buf.readBigInt64LE(91)) / 100;
    tick.high = Number(buf.readBigInt64LE(99)) / 100;
    tick.low = Number(buf.readBigInt64LE(107)) / 100;
    tick.close = Number(buf.readBigInt64LE(115)) / 100;
  }

  if (mode >= 3 && buf.length >= MODE3_LEN) {
    tick.openInterest = Number(buf.readBigInt64LE(131));
    tick.bids = parseDepth(buf, 147);
    tick.asks = parseDepth(buf, 247);
    tick.upperCircuit = Number(buf.readBigInt64LE(347)) / 100;
    tick.lowerCircuit = Number(buf.readBigInt64LE(355)) / 100;
    tick.yearHigh = Number(buf.readBigInt64LE(363)) / 100;
    tick.yearLow = Number(buf.readBigInt64LE(371)) / 100;
  }

  return tick;
}

function parseDepth(buf: Buffer, baseOffset: number): DepthLevel[] {
  const levels: DepthLevel[] = [];
  for (let i = 0; i < 5; i++) {
    const o = baseOffset + i * DEPTH_ROW_LEN;
    // bytes o..o+1 are the buy/sell flag — we already know from baseOffset
    const quantity = Number(buf.readBigInt64LE(o + 2));
    const price = Number(buf.readBigInt64LE(o + 10)) / 100;
    const orders = buf.readInt16LE(o + 18);
    levels.push({ quantity, price, orders });
  }
  return levels;
}
