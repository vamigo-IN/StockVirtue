/// One place that turns a position + mark price into money figures, shared by
/// the portfolio, room and leaderboard maths so they can never disagree.
///
/// Three kinds of position exist:
///   • cash long (equity, options, legacy futures) — the full cost left the
///     wallet at fill, so the position is worth its market value.
///   • leveraged long (futures on margin) — only margin was BLOCKED (it still
///     sits in wallet.balanceP), so the position adds just its mark-to-market
///     P&L to equity; "invested" is the blocked margin.
///   • short (legacy F&O shorts) — sale proceeds were credited at open, so the
///     position is a liability of its market value.

export interface ValuablePosition {
  quantity: number; // signed
  avgPriceP: bigint;
  marginP: bigint;
  leveraged: boolean;
}

export interface PositionValuation {
  /** Capital deployed: cost basis, or the blocked margin when leveraged. */
  investedP: bigint;
  /** Display value: market value, or margin + P&L when leveraged. */
  currentP: bigint;
  unrealizedP: bigint;
  /** Signed amount this position adds to total equity beyond the wallet. */
  equityP: bigint;
  /** Full contract value at the mark (always ≥ 0) — the real exposure. */
  exposureP: bigint;
}

export function valuePosition(
  p: ValuablePosition,
  ltpP: bigint | null,
): PositionValuation {
  const absQty = BigInt(Math.abs(p.quantity));
  const isShort = p.quantity < 0;
  const costAbs = p.avgPriceP * absQty;
  // No quote → mark at cost so equity neither jumps nor collapses.
  const markAbs = ltpP !== null ? ltpP * absQty : costAbs;
  if (p.leveraged && !isShort) {
    const pnl = markAbs - costAbs;
    return {
      investedP: p.marginP,
      currentP: p.marginP + pnl,
      unrealizedP: pnl,
      equityP: pnl,
      exposureP: markAbs,
    };
  }
  if (isShort) {
    return {
      investedP: costAbs,
      currentP: markAbs,
      unrealizedP: costAbs - markAbs,
      equityP: -markAbs,
      exposureP: markAbs,
    };
  }
  return {
    investedP: costAbs,
    currentP: markAbs,
    unrealizedP: markAbs - costAbs,
    equityP: markAbs,
    exposureP: markAbs,
  };
}
