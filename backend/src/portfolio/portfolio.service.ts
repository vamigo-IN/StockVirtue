import { Injectable } from '@nestjs/common';
import { Position, Wallet } from '@prisma/client';
import { commoditySpec } from '../common/contract-specs';
import { Exchange } from '../common/exchange';
import { paiseToRupees, rupeesToPaise } from '../common/money';
import { valuePosition } from '../common/valuation';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';
import { WalletService } from '../wallet/wallet.service';

interface PositionWithLive {
  position: Position;
  ltp: number | null;
}

export interface TotalsP {
  totalEquityP: bigint;
  investedP: bigint;
  realizedPnLP: bigint;
  unrealizedPnLP: bigint;
  balanceP: bigint;
  marginReservedP: bigint;
}

/// SmartAPI's multi-quote accepts at most 50 tokens per request.
const QUOTE_BATCH = 50;

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly smartapi: SmartApiService,
    private readonly scripMaster: ScripMasterService,
    private readonly directory: CompanyDirectoryService,
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
    let equityP = wallet.balanceP;
    const positions = enriched.map(({ position, ltp }) => {
      const v = valuePosition(
        position,
        ltp !== null ? rupeesToPaise(ltp) : null,
      );
      investedP += v.investedP;
      currentP += position.quantity < 0 ? -v.currentP : v.currentP;
      unrealizedP += v.unrealizedP;
      equityP += v.equityP;
      const inst = this.scripMaster.getByToken(
        position.exchange as Exchange,
        position.symboltoken,
      );
      const spec = commoditySpec(position.exchange, position.symbol);
      return {
        symbol: position.symbol,
        tradingsymbol: position.tradingsymbol,
        symboltoken: position.symboltoken,
        exchange: position.exchange,
        companyName:
          position.exchange === 'NSE' || position.exchange === 'BSE'
            ? this.directory.nameFor(position.symbol)
            : null,
        // Contract lot size (1 for cash) — lets the client constrain F&O
        // square-off quantity to whole lots, like the buy flow.
        lotSize: inst?.lotSize ?? 1,
        quoteUnit: spec?.quoteUnit ?? null,
        product: position.product,
        quantity: position.quantity, // signed
        isShort: position.quantity < 0,
        // Futures held on margin: `invested` is the blocked margin and the
        // position adds only its P&L to equity (see common/valuation).
        leveraged: position.leveraged,
        reservedQty: position.reservedQty,
        availableQty: position.quantity - position.reservedQty,
        avgPrice: paiseToRupees(position.avgPriceP),
        invested: paiseToRupees(v.investedP),
        margin: paiseToRupees(position.marginP),
        contractValue: paiseToRupees(v.exposureP),
        ltp,
        currentValue: paiseToRupees(v.currentP),
        unrealizedPnL: paiseToRupees(v.unrealizedP),
        unrealizedPnLPct:
          v.investedP === 0n
            ? 0
            : (Number(v.unrealizedP) / Number(v.investedP)) * 100,
        realizedPnL: paiseToRupees(position.realizedPnLP),
        openedAt: position.openedAt.toISOString(),
      };
    });

    const totalRealizedP = allPositions.reduce(
      (acc, p) => acc + p.realizedPnLP,
      0n,
    );

    const [feesAgg, creditsAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: { userId, status: 'FILLED' },
        _sum: { feesP: true },
      }),
      this.prisma.walletCredit.aggregate({
        where: { userId },
        _sum: { amountP: true },
      }),
    ]);
    const totalFeesP = feesAgg._sum.feesP ?? 0n;
    const totalCreditsP = creditsAgg._sum.amountP ?? 0n;

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
        totalEquity: paiseToRupees(equityP),
        // Referral bonuses & promos received — money in, not trading profit.
        totalCredits: paiseToRupees(totalCreditsP),
        positionsCount: positions.length,
      },
    };
  }

  /// Paise-level totals reused by the snapshot writer, rooms and the
  /// leaderboard. The keys match the PortfolioSnapshot columns exactly.
  async computeTotalsP(userId: string): Promise<TotalsP> {
    const map = await this.computeTotalsForUsersP([userId]);
    return map.get(userId)!;
  }

  /// Batched variant: one wallet query, one positions query and ONE set of
  /// multi-quote calls for every user — a room leaderboard with 40 members
  /// no longer fans out into 40 separate quote round-trips.
  async computeTotalsForUsersP(
    userIds: string[],
  ): Promise<Map<string, TotalsP>> {
    const unique = [...new Set(userIds)];
    const out = new Map<string, TotalsP>();
    if (unique.length === 0) return out;

    const [wallets, allPositions] = await Promise.all([
      this.prisma.wallet.findMany({ where: { userId: { in: unique } } }),
      this.prisma.position.findMany({ where: { userId: { in: unique } } }),
    ]);
    const walletByUser = new Map<string, Wallet>(
      wallets.map((w) => [w.userId, w]),
    );
    // A user who has never traded may not have a wallet row yet.
    for (const id of unique) {
      if (!walletByUser.has(id)) {
        walletByUser.set(id, await this.wallet.get(id));
      }
    }

    const open = allPositions.filter((p) => p.quantity !== 0);
    const ltpByKey = await this.fetchLtpMap(open);

    for (const id of unique) {
      const w = walletByUser.get(id)!;
      out.set(id, {
        totalEquityP: w.balanceP,
        investedP: 0n,
        realizedPnLP: 0n,
        unrealizedPnLP: 0n,
        balanceP: w.balanceP,
        marginReservedP: w.marginReservedP,
      });
    }
    for (const p of allPositions) {
      const t = out.get(p.userId);
      if (!t) continue;
      t.realizedPnLP += p.realizedPnLP;
      if (p.quantity === 0) continue;
      const ltp = ltpByKey.get(`${p.exchange}:${p.symboltoken}`);
      const v = valuePosition(p, ltp !== undefined ? rupeesToPaise(ltp) : null);
      t.investedP += v.investedP;
      t.unrealizedPnLP += v.unrealizedP;
      t.totalEquityP += v.equityP;
    }
    return out;
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
    const ltpMap = await this.fetchLtpMap(positions);
    return positions.map((p) => ({
      position: p,
      ltp: ltpMap.get(`${p.exchange}:${p.symboltoken}`) ?? null,
    }));
  }

  /// `exchange:token` → LTP for every distinct contract, in ≤50-token
  /// multi-quote batches. Best-effort: a failed batch just leaves its
  /// contracts unpriced (valued at cost) rather than failing the caller.
  private async fetchLtpMap(
    positions: { exchange: string; symboltoken: string }[],
  ): Promise<Map<string, number>> {
    const tokens = new Map<string, Set<string>>();
    for (const p of positions) {
      let set = tokens.get(p.exchange);
      if (!set) tokens.set(p.exchange, (set = new Set()));
      set.add(p.symboltoken);
    }
    const flat: { exchange: string; token: string }[] = [];
    for (const [exchange, set] of tokens) {
      for (const token of set) flat.push({ exchange, token });
    }
    const ltpByKey = new Map<string, number>();
    for (let i = 0; i < flat.length; i += QUOTE_BATCH) {
      const batch: Record<string, string[]> = {};
      for (const { exchange, token } of flat.slice(i, i + QUOTE_BATCH)) {
        (batch[exchange] ??= []).push(token);
      }
      try {
        const fetched = await this.smartapi.getMultiQuote(batch, 'LTP');
        for (const q of fetched) {
          ltpByKey.set(`${q.exchange}:${q.symbolToken}`, q.ltp);
        }
      } catch {
        // leave this batch unpriced
      }
    }
    return ltpByKey;
  }
}
