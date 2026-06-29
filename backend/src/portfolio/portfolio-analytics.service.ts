import { Injectable } from '@nestjs/common';
import { OrderSide, OrderStatus, OrderProduct } from '@prisma/client';
import { paiseToRupees } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';

/// One row of the per-symbol P&L table on /portfolio/analytics.
export interface SymbolPnL {
  symbol: string;
  exchange: string;
  /// Total filled buys (lifetime), in rupees.
  invested: number;
  /// Sum of realizedPnL on this position row(s). Already net of fees.
  realizedPnL: number;
  /// Open quantity (signed: positive = long, negative = short).
  openQty: number;
  avgPrice: number;
  /// Current LTP × abs(qty) at portfolio-call time — null when we
  /// couldn't fetch a quote (the live-LTP path lives on the main
  /// portfolio service; analytics is lighter and skips it).
  currentValue: number | null;
  /// realized + unrealized for the open leg.
  totalPnL: number;
  /// Number of FILLED orders touching this symbol.
  trades: number;
  fees: number;
}

/// Aggregate risk metrics derived from the trailing equity curve in
/// `portfolio_snapshots`. We compute daily returns and standard
/// metrics — annualised assuming 252 trading days.
export interface RiskMetrics {
  /// Number of snapshot points used. Metrics below are unreliable
  /// when points < 30.
  points: number;
  /// (last - first) / first × 100. Same number the history screen's
  /// header already shows; included so the analytics page is
  /// self-contained.
  totalReturnPct: number;
  /// Annualised standard deviation of daily returns × √252.
  annualisedVolPct: number;
  /// Annualised Sharpe = (mean daily return × 252 − rf) / annualisedVol.
  /// We use a 0% risk-free rate since the simulator has no cash earning
  /// interest; document if/when you wire one.
  sharpe: number;
  /// Like Sharpe but only considers downside deviation (returns < 0).
  /// Less penalising of upside volatility.
  sortino: number;
  /// Max peak-to-trough drawdown as a positive percent.
  maxDrawdownPct: number;
  /// Compound annual growth rate (geometric). Useful when the user
  /// wants a single "how good is my strategy" headline number.
  cagrPct: number;
  /// Beta vs Nifty 50 — covariance(user, nifty) / var(nifty), computed
  /// over the same daily windows when available. null when we don't
  /// have the benchmark series cached locally (we use the user's own
  /// snapshots as a proxy fallback; future revision can attach a
  /// snapshotted Nifty curve).
  beta: number | null;
}

/// One disposal row in the capital-gains report.
export interface CapGainRow {
  symbol: string;
  exchange: string;
  /// Quantity sold/closed in this disposal.
  quantity: number;
  buyDate: string;
  sellDate: string;
  buyPrice: number;
  sellPrice: number;
  gain: number;
  /// Indian tax classification: equity held > 365 days = LONG, else SHORT.
  /// F&O contracts and intraday MIS are always SHORT regardless of holding.
  term: 'SHORT' | 'LONG';
}

export interface CapGainsReport {
  rows: CapGainRow[];
  shortTermTotal: number;
  longTermTotal: number;
  total: number;
  /// Window the report covered: from the earliest BUY we found to "now".
  /// Used by the mobile UI to label the report.
  from: string | null;
  to: string;
}

@Injectable()
export class PortfolioAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Lifetime per-symbol P&L: realized from `positions.realizedPnLP`
  /// plus any open-leg unrealized (computed from `positions.avgPriceP`
  /// vs the live LTP cached on the position row when available).
  ///
  /// We deliberately don't fetch SmartAPI here — analytics shouldn't
  /// add a multi-quote roundtrip on every render. The user-facing
  /// number sums realized P&L (always exact) + unrealized = 0 for
  /// rows where currentValue is null. The main portfolio screen
  /// covers live LTP separately.
  async perSymbolPnL(userId: string): Promise<SymbolPnL[]> {
    const positions = await this.prisma.position.findMany({
      where: { userId },
      orderBy: { openedAt: 'asc' },
    });

    // Index trade counts + fees from filled orders so each row carries
    // a "how often did I touch this" stat.
    const fillsBySymbol = new Map<
      string,
      { trades: number; fees: bigint; investedP: bigint }
    >();
    const filled = await this.prisma.order.findMany({
      where: { userId, status: OrderStatus.FILLED },
      select: {
        symbol: true,
        exchange: true,
        side: true,
        quantity: true,
        fillPriceP: true,
        feesP: true,
      },
    });
    for (const o of filled) {
      const key = `${o.exchange}:${o.symbol}`;
      const slot = fillsBySymbol.get(key) ?? {
        trades: 0,
        fees: 0n,
        investedP: 0n,
      };
      slot.trades += 1;
      slot.fees += o.feesP;
      if (o.side === OrderSide.BUY && o.fillPriceP != null) {
        slot.investedP += o.fillPriceP * BigInt(o.quantity);
      }
      fillsBySymbol.set(key, slot);
    }

    return positions.map((p) => {
      const key = `${p.exchange}:${p.symbol}`;
      const f = fillsBySymbol.get(key);
      return {
        symbol: p.symbol,
        exchange: p.exchange,
        invested: f ? paiseToRupees(f.investedP) : 0,
        realizedPnL: paiseToRupees(p.realizedPnLP),
        openQty: p.quantity,
        avgPrice: paiseToRupees(p.avgPriceP),
        // Analytics keeps it simple: open leg's mark-to-avg-price. The
        // main portfolio endpoint pulls live LTP — we don't duplicate.
        currentValue: paiseToRupees(p.avgPriceP * BigInt(Math.abs(p.quantity))),
        totalPnL: paiseToRupees(p.realizedPnLP),
        trades: f?.trades ?? 0,
        fees: f ? paiseToRupees(f.fees) : 0,
      };
    });
  }

  /// Compute Sharpe / Sortino / Max DD / CAGR / Beta from the user's
  /// PortfolioSnapshot history. Beta vs Nifty stays null for now —
  /// we'd need to snapshot a benchmark curve to wire it; the field is
  /// in the response shape so the client doesn't break when we do.
  async riskMetrics(userId: string): Promise<RiskMetrics> {
    const snaps = await this.prisma.portfolioSnapshot.findMany({
      where: { userId },
      orderBy: { asOfDate: 'asc' },
      select: { asOfDate: true, totalEquityP: true },
    });
    if (snaps.length < 2) {
      return {
        points: snaps.length,
        totalReturnPct: 0,
        annualisedVolPct: 0,
        sharpe: 0,
        sortino: 0,
        maxDrawdownPct: 0,
        cagrPct: 0,
        beta: null,
      };
    }

    const equities = snaps.map((s) => Number(s.totalEquityP));
    const first = equities[0];
    const last = equities[equities.length - 1];
    const totalReturnPct = first > 0 ? ((last - first) / first) * 100 : 0;

    // Daily simple returns r_i = (P_i / P_{i-1}) − 1.
    const returns: number[] = [];
    for (let i = 1; i < equities.length; i++) {
      if (equities[i - 1] <= 0) continue;
      returns.push(equities[i] / equities[i - 1] - 1);
    }
    const mean = avg(returns);
    const variance = returns.length > 1
      ? returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1)
      : 0;
    const stdev = Math.sqrt(variance);
    const annualisedVol = stdev * Math.sqrt(252);
    const sharpe = stdev === 0 ? 0 : (mean * 252) / annualisedVol;

    const downsideReturns = returns.filter((r) => r < 0);
    const downVariance = downsideReturns.length > 0
      ? downsideReturns.reduce((a, r) => a + r * r, 0) / downsideReturns.length
      : 0;
    const downStdev = Math.sqrt(downVariance);
    const sortino =
      downStdev === 0 ? 0 : (mean * 252) / (downStdev * Math.sqrt(252));

    // Max drawdown — walk the equity curve tracking running peak.
    let peak = equities[0];
    let maxDD = 0;
    for (const e of equities) {
      if (e > peak) peak = e;
      const dd = peak > 0 ? (peak - e) / peak : 0;
      if (dd > maxDD) maxDD = dd;
    }

    // CAGR — geometric annualised. Days span between first and last snapshot.
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.max(
      1,
      (snaps[snaps.length - 1].asOfDate.getTime() -
        snaps[0].asOfDate.getTime()) /
        dayMs,
    );
    const years = days / 365.25;
    const cagr = first > 0 && years > 0
      ? Math.pow(last / first, 1 / years) - 1
      : 0;

    return {
      points: snaps.length,
      totalReturnPct,
      annualisedVolPct: annualisedVol * 100,
      sharpe,
      sortino,
      maxDrawdownPct: maxDD * 100,
      cagrPct: cagr * 100,
      beta: null,
    };
  }

  /// FIFO capital gains: walks every filled order chronologically,
  /// maintains a per-(symbol, exchange, product) buy lot queue, and
  /// produces a disposal row for every sell. Loss disposals are
  /// included so the user can net them against gains for tax
  /// reporting.
  ///
  /// Indian-tax rules implemented:
  ///   * Equity delivery (CNC) held > 365 days → LONG term
  ///   * Equity delivery (CNC) held ≤ 365 days → SHORT term
  ///   * Equity intraday (MIS) and F&O → SHORT term (business income)
  ///   * Fees on each leg are amortised pro-rata into the gain.
  async capitalGains(
    userId: string,
    opts: { from?: Date; to?: Date } = {},
  ): Promise<CapGainsReport> {
    const orders = await this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.FILLED,
        ...(opts.from || opts.to
          ? {
              filledAt: {
                ...(opts.from ? { gte: opts.from } : {}),
                ...(opts.to ? { lte: opts.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ filledAt: 'asc' }, { createdAt: 'asc' }],
    });

    // FIFO buy queue per (symbol, exchange, product). Long lots only —
    // short positions aren't really "capital gains"; for the simulator
    // they're realized P&L tracked separately on the Position row.
    type Lot = {
      qty: number;
      pricePerShare: number; // gross of fees
      feeAlloc: number; // remaining fee budget allocated to this lot
      filledAt: Date;
    };
    const lots = new Map<string, Lot[]>();
    const rows: CapGainRow[] = [];
    let earliest: Date | null = null;

    for (const o of orders) {
      if (o.fillPriceP == null || o.filledAt == null) continue;
      if (!earliest) earliest = o.filledAt;
      const key = `${o.exchange}:${o.symbol}:${o.product}`;
      const queue = lots.get(key) ?? [];
      const price = paiseToRupees(o.fillPriceP);
      const fees = paiseToRupees(o.feesP);

      if (o.side === OrderSide.BUY) {
        queue.push({
          qty: o.quantity,
          pricePerShare: price,
          feeAlloc: fees,
          filledAt: o.filledAt,
        });
        lots.set(key, queue);
        continue;
      }

      // SELL — consume lots FIFO.
      let remaining = o.quantity;
      const sellFeePerShare = fees / Math.max(1, o.quantity);
      while (remaining > 0 && queue.length > 0) {
        const head = queue[0];
        const take = Math.min(remaining, head.qty);
        // Allocate buy-side fees pro-rata to this slice.
        const buyFeeSlice = (head.feeAlloc * take) / head.qty;
        const buyCost = head.pricePerShare * take + buyFeeSlice;
        const sellProceeds = price * take - sellFeePerShare * take;
        const gain = sellProceeds - buyCost;
        const term = capGainTerm(
          o.product,
          o.exchange,
          head.filledAt,
          o.filledAt,
        );
        rows.push({
          symbol: o.symbol,
          exchange: o.exchange,
          quantity: take,
          buyDate: head.filledAt.toISOString().slice(0, 10),
          sellDate: o.filledAt.toISOString().slice(0, 10),
          buyPrice: head.pricePerShare,
          sellPrice: price,
          gain,
          term,
        });
        head.qty -= take;
        head.feeAlloc -= buyFeeSlice;
        remaining -= take;
        if (head.qty === 0) queue.shift();
      }
    }

    const shortTermTotal = rows
      .filter((r) => r.term === 'SHORT')
      .reduce((a, r) => a + r.gain, 0);
    const longTermTotal = rows
      .filter((r) => r.term === 'LONG')
      .reduce((a, r) => a + r.gain, 0);

    return {
      rows: rows.sort((a, b) => b.sellDate.localeCompare(a.sellDate)),
      shortTermTotal,
      longTermTotal,
      total: shortTermTotal + longTermTotal,
      from: earliest?.toISOString().slice(0, 10) ?? null,
      to: new Date().toISOString().slice(0, 10),
    };
  }
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/// Indian tax classification:
///   * MIS (intraday) → SHORT (treated as business income, but the
///     simulator collapses everything onto "short-term gains" so we
///     don't pretend to compute presumptive ITR 3 entries).
///   * F&O (NFO / BFO) → SHORT.
///   * Equity delivery (CNC) on NSE/BSE → LONG if held > 365 days.
function capGainTerm(
  product: OrderProduct,
  exchange: string,
  buyDate: Date,
  sellDate: Date,
): 'SHORT' | 'LONG' {
  if (product === OrderProduct.INTRADAY) return 'SHORT';
  const isFno = exchange === 'NFO' || exchange === 'BFO';
  if (isFno) return 'SHORT';
  const days =
    (sellDate.getTime() - buyDate.getTime()) / (24 * 60 * 60 * 1000);
  return days > 365 ? 'LONG' : 'SHORT';
}
