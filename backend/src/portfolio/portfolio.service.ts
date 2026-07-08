import { Injectable } from '@nestjs/common';
import { Position } from '@prisma/client';
import { Exchange } from '../common/exchange';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';
import { WalletService } from '../wallet/wallet.service';

interface PositionWithLive {
  position: Position;
  ltp: number | null;
}

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly smartapi: SmartApiService,
    private readonly scripMaster: ScripMasterService,
  ) {}

  async getPortfolio(userId: string) {
    const [wallet, allPositions] = await Promise.all([
      this.wallet.get(userId),
      this.prisma.position.findMany({
        where: { userId },
        orderBy: { openedAt: 'asc' },
      }),
    ]);

    const openPositions = allPositions.filter((p) => p.quantity !== 0);
    const enriched = await this.enrichWithLtp(openPositions);

    let investedP = 0n;
    let currentP = 0n;
    let unrealizedP = 0n;
    const positions = enriched.map(({ position, ltp }) => {
      const absQty = Math.abs(position.quantity);
      const isShort = position.quantity < 0;
      const investedAbs = position.avgPriceP * BigInt(absQty);
      const currentAbs =
        ltp !== null
          ? rupeesToPaise(ltp) * BigInt(absQty)
          : investedAbs;
      // For longs: P&L = current − invested. For shorts: P&L = invested − current
      // (you receive when LTP falls below entry).
      const unrealizedAbs = isShort
        ? investedAbs - currentAbs
        : currentAbs - investedAbs;
      investedP += investedAbs;
      currentP += isShort ? -currentAbs : currentAbs;
      unrealizedP += unrealizedAbs;
      return {
        symbol: position.symbol,
        tradingsymbol: position.tradingsymbol,
        symboltoken: position.symboltoken,
        exchange: position.exchange,
        // Contract lot size (1 for cash) — lets the client constrain F&O
        // square-off quantity to whole lots, like the buy flow.
        lotSize:
          this.scripMaster.getByToken(
            position.exchange as Exchange,
            position.symboltoken,
          )?.lotSize ?? 1,
        product: position.product,
        quantity: position.quantity, // signed
        isShort,
        reservedQty: position.reservedQty,
        availableQty: position.quantity - position.reservedQty,
        avgPrice: paiseToRupees(position.avgPriceP),
        invested: paiseToRupees(investedAbs),
        margin: paiseToRupees(position.marginP),
        ltp,
        currentValue: paiseToRupees(currentAbs),
        unrealizedPnL: paiseToRupees(unrealizedAbs),
        unrealizedPnLPct:
          investedAbs === 0n
            ? 0
            : (Number(unrealizedAbs) / Number(investedAbs)) * 100,
        realizedPnL: paiseToRupees(position.realizedPnLP),
        openedAt: position.openedAt.toISOString(),
      };
    });

    const totalRealizedP = allPositions.reduce(
      (acc, p) => acc + p.realizedPnLP,
      0n,
    );

    const feesAgg = await this.prisma.order.aggregate({
      where: { userId, status: 'FILLED' },
      _sum: { feesP: true },
    });
    const totalFeesP = feesAgg._sum.feesP ?? 0n;

    return {
      wallet: {
        balance: paiseToRupees(wallet.balanceP),
        reserved: paiseToRupees(wallet.reservedP),
        marginReserved: paiseToRupees(wallet.marginReservedP),
        available: paiseToRupees(
          wallet.balanceP - wallet.reservedP - wallet.marginReservedP,
        ),
        balanceInPaise: wallet.balanceP.toString(),
        reservedInPaise: wallet.reservedP.toString(),
        marginReservedInPaise: wallet.marginReservedP.toString(),
      },
      positions,
      summary: {
        invested: paiseToRupees(investedP),
        currentValue: paiseToRupees(currentP),
        unrealizedPnL: paiseToRupees(unrealizedP),
        totalRealizedPnL: paiseToRupees(totalRealizedP),
        totalFeesPaid: paiseToRupees(totalFeesP),
        totalMarginReserved: paiseToRupees(wallet.marginReservedP),
        totalEquity: paiseToRupees(wallet.balanceP + currentP),
        positionsCount: positions.length,
      },
    };
  }

  /// Paise-level computation reused by the snapshot writer. We don't lift
  /// it into getPortfolio() because the API surface needs rupee floats and
  /// per-position breakdowns; this helper returns just the totals the
  /// daily-snapshot row holds.
  async computeTotalsP(userId: string): Promise<{
    totalEquityP: bigint;
    investedP: bigint;
    realizedPnLP: bigint;
    unrealizedPnLP: bigint;
    balanceP: bigint;
    marginReservedP: bigint;
  }> {
    const [wallet, allPositions] = await Promise.all([
      this.wallet.get(userId),
      this.prisma.position.findMany({ where: { userId } }),
    ]);
    const openPositions = allPositions.filter((p) => p.quantity !== 0);
    const enriched = await this.enrichWithLtp(openPositions);

    let investedP = 0n;
    let currentP = 0n;
    let unrealizedP = 0n;
    for (const { position, ltp } of enriched) {
      const absQty = Math.abs(position.quantity);
      const isShort = position.quantity < 0;
      const investedAbs = position.avgPriceP * BigInt(absQty);
      const currentAbs =
        ltp !== null
          ? rupeesToPaise(ltp) * BigInt(absQty)
          : investedAbs;
      const unrealizedAbs = isShort
        ? investedAbs - currentAbs
        : currentAbs - investedAbs;
      investedP += investedAbs;
      currentP += isShort ? -currentAbs : currentAbs;
      unrealizedP += unrealizedAbs;
    }
    const realizedP = allPositions.reduce(
      (acc, p) => acc + p.realizedPnLP,
      0n,
    );
    return {
      totalEquityP: wallet.balanceP + currentP,
      investedP,
      realizedPnLP: realizedP,
      unrealizedPnLP: unrealizedP,
      balanceP: wallet.balanceP,
      marginReservedP: wallet.marginReservedP,
    };
  }

  /// Reads the user's daily portfolio snapshots back as a series.
  /// `days = null` returns all snapshots; otherwise returns the trailing N.
  async getHistory(userId: string, days: number | null) {
    const rows = await this.prisma.portfolioSnapshot.findMany({
      where: {
        userId,
        ...(days != null
          ? {
              asOfDate: {
                gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
              },
            }
          : {}),
      },
      orderBy: { asOfDate: 'asc' },
    });
    return {
      points: rows.map((r) => ({
        asOfDate: r.asOfDate.toISOString().slice(0, 10),
        totalEquity: paiseToRupees(r.totalEquityP),
        invested: paiseToRupees(r.investedP),
        realizedPnL: paiseToRupees(r.realizedPnLP),
        unrealizedPnL: paiseToRupees(r.unrealizedPnLP),
        balance: paiseToRupees(r.balanceP),
        marginReserved: paiseToRupees(r.marginReservedP),
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async enrichWithLtp(
    positions: Position[],
  ): Promise<PositionWithLive[]> {
    if (positions.length === 0) return [];
    const tokensByExchange: Record<string, string[]> = {};
    for (const p of positions) {
      (tokensByExchange[p.exchange] ??= []).push(p.symboltoken);
    }
    try {
      const fetched = await this.smartapi.getMultiQuote(tokensByExchange, 'LTP');
      const ltpMap = new Map(
        fetched.map((q) => [`${q.exchange}:${q.symbolToken}`, q.ltp]),
      );
      return positions.map((p) => ({
        position: p,
        ltp: ltpMap.get(`${p.exchange}:${p.symboltoken}`) ?? null,
      }));
    } catch {
      return positions.map((p) => ({ position: p, ltp: null }));
    }
  }
}
