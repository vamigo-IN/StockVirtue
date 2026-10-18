import { Order } from '@prisma/client';
import { computeFees, feeSegmentFor } from '../common/fees';
import { futuresMarginP } from '../common/margin';
import { paiseToRupees } from '../common/money';

export function serializeOrder(o: Order) {
  const fillPrice = o.fillPriceP !== null ? paiseToRupees(o.fillPriceP) : null;
  const limitPrice =
    o.limitPriceP !== null ? paiseToRupees(o.limitPriceP) : null;
  const triggerPrice =
    o.triggerPriceP !== null ? paiseToRupees(o.triggerPriceP) : null;
  const trailAmount =
    o.trailAmountP !== null ? paiseToRupees(o.trailAmountP) : null;
  const referenceP = o.fillPriceP ?? o.limitPriceP ?? o.triggerPriceP;
  const notional =
    referenceP !== null
      ? paiseToRupees(referenceP * BigInt(o.quantity))
      : null;

  // Recompute breakdown from stored notional + side + exchange so the API
  // exposes each line item. Only meaningful for FILLED orders.
  let feesBreakdown:
    | {
        brokerage: number;
        stt: number;
        exchange: number;
        sebi: number;
        stampDuty: number;
        gst: number;
        total: number;
      }
    | null = null;
  if (o.fillPriceP !== null) {
    const breakdown = computeFees({
      side: o.side,
      exchange: o.exchange,
      notionalP: o.fillPriceP * BigInt(o.quantity),
      intraday: o.product === 'INTRADAY',
      segment: feeSegmentFor(o.exchange, o.tradingsymbol),
    });
    feesBreakdown = {
      brokerage: paiseToRupees(breakdown.brokerage),
      stt: paiseToRupees(breakdown.stt),
      exchange: paiseToRupees(breakdown.exchange),
      sebi: paiseToRupees(breakdown.sebi),
      stampDuty: paiseToRupees(breakdown.stampDuty),
      gst: paiseToRupees(breakdown.gst),
      total: paiseToRupees(breakdown.total),
    };
  }

  return {
    id: o.id,
    symbol: o.symbol,
    tradingsymbol: o.tradingsymbol,
    symboltoken: o.symboltoken,
    exchange: o.exchange,
    side: o.side,
    type: o.type,
    product: o.product,
    origin: o.origin,
    quantity: o.quantity,
    // Futures on margin: the contract value (notional) isn't what left the
    // wallet — only the initial margin was blocked.
    leveraged: o.leveraged,
    margin:
      o.leveraged && referenceP !== null
        ? paiseToRupees(
            futuresMarginP(referenceP * BigInt(o.quantity), o.exchange, o.symbol),
          )
        : null,
    limitPrice,
    triggerPrice,
    trailAmount,
    fillPrice,
    notional,
    fees: paiseToRupees(o.feesP),
    feesBreakdown,
    status: o.status,
    rejectReason: o.rejectReason,
    createdAt: o.createdAt.toISOString(),
    filledAt: o.filledAt?.toISOString() ?? null,
  };
}
