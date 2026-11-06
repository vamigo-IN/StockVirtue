import { computeFees } from '../common/fees';
import { paiseToRupees, rupeesToPaise } from '../common/money';

/** Shares in the home page's worked contract note (its steps say 20). */
export const NOTE_QTY = 20;

export interface NoteLeg {
  /** The price per share, in rupees (paise-exact). */
  price: number;
  /** price × quantity. */
  value: number;
}

/** A contract note's charge lines, in rupees: both legs added together. */
export interface NoteCharges {
  brokerage: number;
  stt: number;
  /** The exchange's transaction charges and SEBI's turnover fee. */
  exchangeAndSebi: number;
  stampDuty: number;
  gst: number;
  total: number;
}

export interface IntradayNote {
  qty: number;
  product: 'INTRADAY';
  buy: NoteLeg;
  sell: NoteLeg;
  charges: NoteCharges;
  /** sold − bought − every charge: what the round trip does to the balance. */
  net: number;
}

/**
 * An intraday round trip of `qty` shares on `exchange`, bought at `buy` and
 * sold at `sell` (rupees), charged exactly as the order engine charges it:
 * each leg's notional is rupeesToPaise(price) × qty, as orders.service.ts
 * works it out, and its fees come from computeFees (common/fees.ts) with
 * the same segment and product, the function the engine debits and
 * order.serializer.ts itemises. All sums in paise; rupees only at the end.
 */
export function intradayNote(
  exchange: string,
  buy: number,
  sell: number,
  qty: number,
): IntradayNote {
  const buyPriceP = rupeesToPaise(buy);
  const sellPriceP = rupeesToPaise(sell);
  const buyP = buyPriceP * BigInt(qty);
  const sellP = sellPriceP * BigInt(qty);
  const legFees = (side: 'BUY' | 'SELL', notionalP: bigint) =>
    computeFees({
      side,
      exchange,
      notionalP,
      intraday: true,
      segment: 'EQUITY',
    });
  const b = legFees('BUY', buyP);
  const s = legFees('SELL', sellP);
  const totalP = b.total + s.total;
  return {
    qty,
    product: 'INTRADAY',
    buy: { price: paiseToRupees(buyPriceP), value: paiseToRupees(buyP) },
    sell: { price: paiseToRupees(sellPriceP), value: paiseToRupees(sellP) },
    charges: {
      brokerage: paiseToRupees(b.brokerage + s.brokerage),
      stt: paiseToRupees(b.stt + s.stt),
      exchangeAndSebi: paiseToRupees(b.exchange + b.sebi + s.exchange + s.sebi),
      stampDuty: paiseToRupees(b.stampDuty + s.stampDuty),
      gst: paiseToRupees(b.gst + s.gst),
      total: paiseToRupees(totalP),
    },
    net: paiseToRupees(sellP - buyP - totalP),
  };
}
