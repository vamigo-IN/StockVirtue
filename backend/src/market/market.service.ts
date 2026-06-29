import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Exchange } from '../common/exchange';
import { computeFees } from '../common/fees';
import { SmartApiService } from '../smartapi/smartapi.service';
import { CandleInterval, CandleRow } from '../smartapi/smartapi.types';
import {
  BrokerageEstimateRequest,
  ExpiryBucket,
  GainersLosersType,
  MarginPosition,
  MultiQuoteFetched,
  OIBuildupType,
} from '../smartapi/smartapi.types';
import { CAP_LISTS, CapSegment } from './cap-segments';
import { ScripMasterService } from './scrip-master.service';
import { Instrument } from './scrip-master.types';

export type MoverType = 'gainers' | 'losers' | 'intraday';

type MultiQuoteFetchedLike = MultiQuoteFetched;

const QUOTE_NOT_AVAILABLE = 'Snapshot unavailable for this symbol';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function formatIst(date: Date): string {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ist.getUTCDate()).padStart(2, '0');
  const h = String(ist.getUTCHours()).padStart(2, '0');
  const mm = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${mm}`;
}

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private readonly smartapi: SmartApiService,
    private readonly scripMaster: ScripMasterService,
  ) {}

  search(query: string, exchange: Exchange = 'NSE', limit = 20) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    return this.scripMaster
      .searchInstruments(query, exchange, limit)
      .map((i) => this.toListItem(i));
  }

  async getQuote(symbol: string, exchange: Exchange = 'NSE') {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${symbol}" not found on ${exchange}`,
      );
    }
    const ltp = await this.smartapi.getLtp({
      exchange: inst.exchange,
      tradingsymbol: inst.symbol,
      symboltoken: inst.token,
    });
    return {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      exchange: inst.exchange,
      symboltoken: inst.token,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      ltp: ltp.ltp,
      open: ltp.open,
      high: ltp.high,
      low: ltp.low,
      close: ltp.close,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Batched LTP+OHLC lookup. Resolves each symbol via the scrip-master, groups
   * the resulting tokens by exchange, and issues one SmartAPI multi-quote call
   * per exchange. Returns one entry per requested symbol; symbols that can't be
   * resolved are omitted (the caller decides whether that's an error).
   */
  async getQuotes(
    symbols: string[],
    exchange: Exchange = 'NSE',
  ) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const resolved: { inst: Instrument }[] = [];
    for (const raw of symbols) {
      const inst = this.scripMaster.getInstrument(raw, exchange);
      if (inst) resolved.push({ inst });
    }
    const tokensByExchange: Record<string, string[]> = {};
    for (const { inst } of resolved) {
      (tokensByExchange[inst.exchange] ??= []).push(inst.token);
    }
    const byKey = new Map<string, MultiQuoteFetchedLike>();
    for (const [ex, tokens] of Object.entries(tokensByExchange)) {
      try {
        const fetched = await this.smartapi.getMultiQuote(
          { [ex]: tokens },
          'OHLC',
        );
        for (const q of fetched) {
          byKey.set(`${q.exchange}:${q.symbolToken}`, q);
        }
      } catch {
        // best-effort: leave unfetched symbols out
      }
    }
    return {
      exchange,
      quotes: resolved
        .map(({ inst }) => {
          const q = byKey.get(`${inst.exchange}:${inst.token}`);
          return {
            symbol: inst.name,
            tradingsymbol: inst.symbol,
            exchange: inst.exchange,
            symboltoken: inst.token,
            lotSize: inst.lotSize,
            tickSize: inst.tickSize,
            ltp: q?.ltp ?? null,
            open: q?.open ?? null,
            high: q?.high ?? null,
            low: q?.low ?? null,
            close: q?.close ?? null,
          };
        })
        .filter((q) => q.ltp !== null),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Top movers across a market-cap segment, sorted by % change.
   *
   *   - `gainers` / `losers`: day-over-day change, computed as (ltp − prevClose) / prevClose.
   *   - `intraday`: today's open-to-LTP change. Useful for spotting strong
   *     intraday momentum even when the day-over-day move is small.
   *
   * Returns the top `limit` results plus the change% so the client can render
   * the chip without recomputing.
   */
  async getMovers(
    segment: CapSegment,
    type: MoverType,
    limit = 10,
  ) {
    const symbols = CAP_LISTS[segment];
    if (!symbols || symbols.length === 0) return { segment, type, results: [] };
    const batch = await this.getQuotes(symbols, 'NSE');
    const enriched = batch.quotes
      .map((q) => {
        const ltp = q.ltp;
        const close = q.close;
        const open = q.open;
        if (ltp == null) return null;
        const dayPct =
          close != null && close > 0 ? ((ltp - close) / close) * 100 : null;
        const intradayPct =
          open != null && open > 0 ? ((ltp - open) / open) * 100 : null;
        return { ...q, dayPct, intradayPct };
      })
      .filter((q): q is NonNullable<typeof q> => q != null);

    const sorted = [...enriched];
    if (type === 'gainers') {
      sorted.sort((a, b) => (b.dayPct ?? -Infinity) - (a.dayPct ?? -Infinity));
    } else if (type === 'losers') {
      sorted.sort((a, b) => (a.dayPct ?? Infinity) - (b.dayPct ?? Infinity));
    } else {
      // Intraday: by absolute magnitude — strong moves either direction.
      sorted.sort(
        (a, b) =>
          Math.abs(b.intradayPct ?? 0) - Math.abs(a.intradayPct ?? 0),
      );
    }
    return {
      segment,
      type,
      results: sorted.slice(0, limit),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Scanner-style queries across the curated cap universe. The single
   * call fans a FULL multi-quote across large + mid + small caps so each
   * row carries volume, 52w hi/lo, change %, etc. — the three scanner
   * types below just sort/filter on different columns of that payload.
   *
   *   * `volume`     → top traded by `tradeVolume` today
   *   * `52w-high`   → stocks within 2% of their 52-week high
   *   * `52w-low`    → stocks within 2% of their 52-week low
   */
  async runScanner(
    type: 'volume' | '52w-high' | '52w-low',
    limit = 15,
  ) {
    const symbols = [
      ...CAP_LISTS.largecap,
      ...CAP_LISTS.midcap,
      ...CAP_LISTS.smallcap,
    ];
    // Resolve tokens then FULL-mode multi-quote in 50-token batches.
    const resolved: Instrument[] = [];
    for (const raw of symbols) {
      const inst = this.scripMaster.getInstrument(raw, 'NSE');
      if (inst) resolved.push(inst);
    }
    const tokensByExchange: Record<string, string[]> = {};
    for (const inst of resolved) {
      (tokensByExchange[inst.exchange] ??= []).push(inst.token);
    }
    const quoteByKey = new Map<string, MultiQuoteFetchedLike>();
    const BATCH = 50;
    for (const [exchange, tokens] of Object.entries(tokensByExchange)) {
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        try {
          const fetched = await this.smartapi.getMultiQuote(
            { [exchange]: batch },
            'FULL',
          );
          for (const q of fetched) {
            quoteByKey.set(`${q.exchange}:${q.symbolToken}`, q);
          }
        } catch {
          // best-effort: partial scans are still useful
        }
      }
    }
    const enriched = resolved
      .map((inst) => {
        const q = quoteByKey.get(`${inst.exchange}:${inst.token}`);
        if (!q || q.ltp == null) return null;
        const yearHigh = q['52WeekHigh'] ?? null;
        const yearLow = q['52WeekLow'] ?? null;
        const dayChange =
          q.close != null && q.close > 0
            ? ((q.ltp - q.close) / q.close) * 100
            : null;
        const fromHighPct =
          yearHigh && yearHigh > 0
            ? ((q.ltp - yearHigh) / yearHigh) * 100
            : null;
        const fromLowPct =
          yearLow && yearLow > 0
            ? ((q.ltp - yearLow) / yearLow) * 100
            : null;
        return {
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          ltp: q.ltp,
          close: q.close,
          dayChangePct: dayChange,
          tradeVolume: q.tradeVolume ?? null,
          yearHigh,
          yearLow,
          fromHighPct,
          fromLowPct,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    let filtered = enriched;
    if (type === '52w-high') {
      filtered = enriched.filter(
        (r) => r.fromHighPct != null && r.fromHighPct >= -2,
      );
      filtered.sort(
        (a, b) =>
          (b.fromHighPct ?? -Infinity) - (a.fromHighPct ?? -Infinity),
      );
    } else if (type === '52w-low') {
      filtered = enriched.filter(
        (r) => r.fromLowPct != null && r.fromLowPct <= 2,
      );
      filtered.sort(
        (a, b) => (a.fromLowPct ?? Infinity) - (b.fromLowPct ?? Infinity),
      );
    } else {
      filtered = enriched.filter(
        (r) => r.tradeVolume != null && r.tradeVolume > 0,
      );
      filtered.sort(
        (a, b) => (b.tradeVolume ?? 0) - (a.tradeVolume ?? 0),
      );
    }
    return {
      type,
      results: filtered.slice(0, limit),
      fetchedAt: new Date().toISOString(),
    };
  }

  async getCandles(
    symbol: string,
    exchange: Exchange = 'NSE',
    interval: CandleInterval = 'ONE_MINUTE',
    hours = 4,
  ) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${symbol}" not found on ${exchange}`,
      );
    }
    // SmartAPI's historical-data endpoint doesn't reliably serve intraday
    // candles for indices (AMXIDX / INDEX). Force the daily interval and a
    // sensible minimum window so the chart actually renders for NIFTY,
    // BANKNIFTY, SENSEX et al. on every range chip.
    const isIndex =
      inst.instrumentType === 'AMXIDX' ||
      inst.instrumentType === 'INDEX';
    let effectiveInterval = interval;
    let effectiveHours = hours;
    if (isIndex) {
      effectiveInterval = 'ONE_DAY';
      // For the short chips (1D, 1W) widen to ~3 months so the daily series
      // has enough points to draw a meaningful line.
      effectiveHours = Math.max(hours, 24 * 90);
    }
    const now = new Date();
    const from = new Date(now.getTime() - effectiveHours * 60 * 60 * 1000);
    let rows: CandleRow[];
    try {
      rows = await this.smartapi.getCandles({
        exchange: inst.exchange,
        symboltoken: inst.token,
        interval: effectiveInterval,
        fromdate: formatIst(from),
        todate: formatIst(now),
      });
    } catch (err) {
      // SmartAPI's historical feed rejects intraday candles for thin or newly
      // listed F&O contracts (and a few BSE indices). Fall back to a daily
      // series over a wider window so the chart still renders, and only give
      // up — returning an empty series, which the app shows gracefully as
      // "chart unavailable" — if the daily request fails too. This turns the
      // 500 the app was seeing on F&O contracts into a clean degrade.
      this.logger.warn(
        `candles ${inst.exchange}:${inst.token} @${effectiveInterval} ` +
          `failed (${(err as Error).message}); retrying daily`,
      );
      effectiveInterval = 'ONE_DAY';
      const wideFrom = new Date(
        now.getTime() - Math.max(effectiveHours, 24 * 90) * 60 * 60 * 1000,
      );
      try {
        rows = await this.smartapi.getCandles({
          exchange: inst.exchange,
          symboltoken: inst.token,
          interval: 'ONE_DAY',
          fromdate: formatIst(wideFrom),
          todate: formatIst(now),
        });
      } catch (err2) {
        this.logger.warn(
          `candles daily fallback ${inst.exchange}:${inst.token} ` +
            `failed (${(err2 as Error).message}); returning empty`,
        );
        rows = [];
      }
    }
    return {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      exchange: inst.exchange,
      symboltoken: inst.token,
      interval: effectiveInterval,
      candles: rows.map((r) => ({
        t: r[0],
        o: r[1],
        h: r[2],
        l: r[3],
        c: r[4],
        v: r[5],
      })),
    };
  }

  /** F&O candles with open interest column. Used by the chart's OI panel. */
  async getCandlesWithOI(
    symbol: string,
    exchange: Exchange,
    interval: CandleInterval = 'ONE_DAY',
    hours = 24 * 30,
  ) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${symbol}" not found on ${exchange}`,
      );
    }
    const now = new Date();
    const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const rows = await this.smartapi.getCandlesWithOI({
      exchange: inst.exchange,
      symboltoken: inst.token,
      interval,
      fromdate: formatIst(from),
      todate: formatIst(now),
    });
    return {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      exchange: inst.exchange,
      symboltoken: inst.token,
      interval,
      candles: rows.map((r) => ({
        t: r[0],
        o: r[1],
        h: r[2],
        l: r[3],
        c: r[4],
        v: r[5],
        oi: r[6],
      })),
    };
  }

  /** F&O gainers / losers (price or OI) via the SmartAPI marketData feed. */
  async getFnoMovers(datatype: GainersLosersType, expirytype: ExpiryBucket) {
    const rows = await this.smartapi.getGainersLosers(datatype, expirytype);
    return {
      datatype,
      expirytype,
      results: rows.map((r) => ({
        tradingsymbol: r.tradingSymbol,
        symboltoken: r.symbolToken,
        percentChange: r.percentChange,
        opnInterest: r.opnInterest,
        netChangeOpnInterest: r.netChangeOpnInterest,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** OI buildup classification — long built up, short covering, etc. */
  async getOIBuildup(datatype: OIBuildupType, expirytype: ExpiryBucket) {
    const rows = await this.smartapi.getOIBuildup(datatype, expirytype);
    return {
      datatype,
      expirytype,
      results: rows.map((r) => ({
        tradingsymbol: r.tradingSymbol,
        symboltoken: r.symbolToken,
        ltp: Number(r.ltp),
        netChange: Number(r.netChange),
        percentChange: Number(r.percentChange),
        opnInterest: Number(r.opnInterest),
        netChangeOpnInterest: Number(r.netChangeOpnInterest),
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Put-Call Ratio for F&O underlyings. */
  async getPutCallRatio() {
    const rows = await this.smartapi.getPutCallRatio();
    return {
      results: rows.map((r) => ({
        tradingsymbol: r.tradingSymbol,
        pcr: r.pcr,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /** Margin preview for a single position — UI-side wrapper. */
  async getMarginPreview(position: MarginPosition) {
    const preview = await this.smartapi.getMarginBatch([position]);
    return {
      totalMarginRequired: preview.totalMarginRequired,
      components: preview.marginComponents,
      perOrder: preview.marginsForOrders,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Brokerage / taxes preview. Computed with the same local fee schedule
   * (common/fees.ts) used for real fills — this is a simulator, so it doesn't
   * need (or want) the live SmartAPI brokerage calculator, and computing
   * locally keeps the preview identical to what's actually charged at fill.
   * All math in paise, summed across the requested orders.
   */
  getBrokeragePreview(req: BrokerageEstimateRequest) {
    let brokerageP = 0n;
    let sttP = 0n;
    let exchangeP = 0n;
    let sebiP = 0n;
    let stampP = 0n;
    let gstP = 0n;
    let tradeValueP = 0n;
    for (const o of req.orders) {
      const priceP = BigInt(Math.round(Number(o.price) * 100));
      const qty = BigInt(Math.trunc(Number(o.quantity)));
      const notionalP = priceP * qty;
      tradeValueP += notionalP;
      const f = computeFees({
        side: o.transactionType === 'SELL' ? 'SELL' : 'BUY',
        exchange: o.exchange,
        notionalP,
        intraday: o.productType === 'INTRADAY',
      });
      brokerageP += f.brokerage;
      sttP += f.stt;
      exchangeP += f.exchange;
      sebiP += f.sebi;
      stampP += f.stampDuty;
      gstP += f.gst;
    }
    const totalP = brokerageP + sttP + exchangeP + sebiP + stampP + gstP;
    const toRupees = (p: bigint) => Number(p) / 100;
    return {
      summary: {
        totalCharges: toRupees(totalP),
        tradeValue: toRupees(tradeValueP),
        breakup: {
          brokerage: toRupees(brokerageP),
          stt: toRupees(sttP),
          transactionCharges: toRupees(exchangeP),
          gst: toRupees(gstP),
          sebiCharges: toRupees(sebiP),
          stampDuty: toRupees(stampP),
          ipft: 0,
        },
      },
      fetchedAt: new Date().toISOString(),
    };
  }

  getExpiries(underlying: string) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const expiries = this.scripMaster.getExpiries(underlying);
    if (expiries.length === 0) {
      throw new NotFoundException(
        `No options found for underlying "${underlying}"`,
      );
    }
    return { underlying: underlying.toUpperCase(), expiries };
  }

  /**
   * Full option chain at one expiry. Each leg carries live LTP, change %,
   * and open interest — the three numbers F&O traders actually want on a
   * single screen — sourced from the SmartAPI multi-quote FULL endpoint.
   * Also returns the underlying spot LTP so the client can mark the ATM
   * strike and tint ITM/OTM rows without an extra round-trip.
   */
  async getOptionChain(underlying: string, expiry: string) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const rows = this.scripMaster.getOptionChain(underlying, expiry);
    if (rows.length === 0) {
      throw new NotFoundException(
        `No option chain for "${underlying}" expiry "${expiry}"`,
      );
    }
    // Batch multi-quote across CE+PE tokens grouped by exchange.
    const tokensByExchange: Record<string, string[]> = {};
    for (const r of rows) {
      for (const leg of [r.call, r.put]) {
        if (!leg) continue;
        (tokensByExchange[leg.exchange] ??= []).push(leg.token);
      }
    }
    const quoteByKey = new Map<string, MultiQuoteFetchedLike>();
    const BATCH = 50;
    for (const [exchange, tokens] of Object.entries(tokensByExchange)) {
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        try {
          // FULL mode gives us LTP + OHLC + OI + circuit/depth. We only
          // need a subset client-side, but the single call paints the row.
          const fetched = await this.smartapi.getMultiQuote(
            { [exchange]: batch },
            'FULL',
          );
          for (const q of fetched) {
            quoteByKey.set(`${q.exchange}:${q.symbolToken}`, q);
          }
        } catch {
          // best-effort
        }
      }
    }
    // Fetch the underlying spot in parallel so the client can derive the
    // ATM strike. Best-effort — chain still renders without it.
    let spot: number | null = null;
    try {
      const inst = this.scripMaster.getInstrument(underlying, 'NSE') ??
        this.scripMaster.getInstrument(underlying, 'BSE');
      if (inst) {
        const ltp = await this.smartapi.getLtp({
          exchange: inst.exchange,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
        });
        spot = ltp.ltp;
      }
    } catch {
      // ignore — spot stays null
    }
    const serializeLeg = (leg: Instrument | null) => {
      if (!leg) return null;
      const q = quoteByKey.get(`${leg.exchange}:${leg.token}`);
      const ltp = q?.ltp ?? null;
      const close = q?.close ?? null;
      let changePct: number | null = null;
      if (ltp !== null && close !== null && close > 0) {
        changePct = ((ltp - close) / close) * 100;
      }
      return {
        tradingsymbol: leg.symbol,
        symboltoken: leg.token,
        exchange: leg.exchange,
        lotSize: leg.lotSize,
        tickSize: leg.tickSize,
        ltp,
        changePct,
        opnInterest: q?.opnInterest ?? null,
      };
    };
    return {
      underlying: underlying.toUpperCase(),
      expiry,
      spot,
      strikes: rows.map((r) => ({
        strike: r.strike,
        call: serializeLeg(r.call),
        put: serializeLeg(r.put),
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * One-shot SnapQuote-equivalent via the REST multi-quote endpoint in FULL
   * mode. Returns OHLC + 5-level depth + 52w hi/lo + circuit limits so the
   * UI can paint the depth book immediately, before the first live tick.
   */
  async getSnapshot(symbol: string, exchange: Exchange = 'NSE') {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException('Scrip master not loaded yet');
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${symbol}" not found on ${exchange}`,
      );
    }
    const fetched = await this.smartapi.getMultiQuote(
      { [inst.exchange]: [inst.token] },
      'FULL',
    );
    if (fetched.length === 0) {
      throw new ServiceUnavailableException(QUOTE_NOT_AVAILABLE);
    }
    const q = fetched[0];
    return {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      exchange: inst.exchange,
      symboltoken: inst.token,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      ltp: q.ltp,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      netChange: q.netChange ?? null,
      percentChange: q.percentChange ?? null,
      avgPrice: q.avgPrice ?? null,
      tradeVolume: q.tradeVolume ?? null,
      upperCircuit: q.upperCircuit ?? null,
      lowerCircuit: q.lowerCircuit ?? null,
      yearHigh: q['52WeekHigh'] ?? null,
      yearLow: q['52WeekLow'] ?? null,
      totBuyQuantity: q.totBuyQuan ?? null,
      totSellQuantity: q.totSellQuan ?? null,
      depth: q.depth
        ? {
            bids: q.depth.buy ?? [],
            asks: q.depth.sell ?? [],
          }
        : null,
      fetchedAt: new Date().toISOString(),
    };
  }

  private toListItem(i: Instrument) {
    return {
      symbol: i.name,
      tradingsymbol: i.symbol,
      symboltoken: i.token,
      exchange: i.exchange,
      type: instrumentTypeLabel(i),
      lotSize: i.lotSize,
      tickSize: i.tickSize,
    };
  }
}

function instrumentTypeLabel(
  i: Instrument,
): 'EQUITY' | 'INDEX' | 'FUTURE' | 'OPTION' | 'OTHER' {
  if (i.isEquity) return 'EQUITY';
  if (i.instrumentType === 'AMXIDX' || i.instrumentType === 'INDEX') {
    return 'INDEX';
  }
  if (i.instrumentType.startsWith('FUT')) return 'FUTURE';
  if (i.instrumentType.startsWith('OPT')) return 'OPTION';
  return 'OTHER';
}
