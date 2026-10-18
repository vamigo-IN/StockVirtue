import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Exchange } from '../common/exchange';
import { SmartApiService } from '../smartapi/smartapi.service';
import { CandleInterval, CandleRow } from '../smartapi/smartapi.types';
import {
  ExpiryBucket,
  GainersLosersType,
  MultiQuoteFetched,
  OIBuildupType,
} from '../smartapi/smartapi.types';
import {
  commoditySpec,
  isContractSupported,
} from '../common/contract-specs';
import {
  futuresMarginBps,
  isFutureInstrumentType,
} from '../common/margin';
import { CAP_LISTS, CapSegment } from './cap-segments';
import { CompanyDirectoryService } from './company-directory.service';
import { ScripMasterService } from './scrip-master.service';
import { Instrument } from './scrip-master.types';

/// NSE series that are tradeable equity-like instruments (shares, SME,
/// trade-for-trade, REIT/InvIT units). Everything else on NSE's cash segment
/// is debt — G-secs (GS/SG), T-bills (TB), gold bonds (GB), NCDs (N*/Y*/Z*) —
/// which search demotes so "HDFC" finds the bank, not its bonds.
const EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ', 'IV', 'RR']);

/// Brand names / old names people still type that match neither the ticker
/// nor the current legal name ("zomato" → Eternal after the 2025 rename).
const SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  ZOMATO: ['ETERNAL'],
  BLINKIT: ['ETERNAL'],
  'TATA MOTORS': ['TMPV', 'TMCV'],
  TATAMOTORS: ['TMPV', 'TMCV'],
  MINDTREE: ['LTIM'],
  'L&T': ['LT'],
  LIC: ['LICI'],
  JIO: ['JIOFIN'],
};

/// Popularity tiebreak: names people trade most should beat obscure ones
/// that match equally well ("hdfc" → HDFC Bank before an HDFC ETF).
const CAP_BOOST = new Map<string, number>([
  ...CAP_LISTS.smallcap.map((s) => [s, 15] as [string, number]),
  ...CAP_LISTS.midcap.map((s) => [s, 25] as [string, number]),
  ...CAP_LISTS.largecap.map((s) => [s, 40] as [string, number]),
]);

function nseSeriesOf(inst: Instrument): string | null {
  if (inst.exchange !== 'NSE' || !inst.isEquity) return null;
  const dash = inst.symbol.lastIndexOf('-');
  return dash > 0 ? inst.symbol.slice(dash + 1).toUpperCase() : '';
}

export type MoverType = 'gainers' | 'losers' | 'intraday';

type MultiQuoteFetchedLike = MultiQuoteFetched;

const QUOTE_NOT_AVAILABLE =
  'Live data for this symbol is unavailable right now. Please try again in a moment.';
const MARKET_DATA_LOADING =
  'Market data is still loading. Please try again in a few seconds.';

function notFoundMessage(symbol: string, exchange: string): string {
  return `We couldn't find "${symbol}" on ${exchange}. It may have been delisted or renamed.`;
}

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

/**
 * SmartAPI caps how far back a single historical request may reach, per
 * interval (https://smartapi.angelbroking.com/docs/Historical). Asking for
 * more returns an error instead of truncating, so a "5Y"/"ALL" daily request
 * (≈3650 days) would fail. We clamp every request to these ceilings so long
 * ranges return the maximum available history rather than nothing.
 */
const MAX_HISTORY_DAYS: Record<CandleInterval, number> = {
  ONE_MINUTE: 30,
  THREE_MINUTE: 60,
  FIVE_MINUTE: 100,
  TEN_MINUTE: 100,
  FIFTEEN_MINUTE: 200,
  THIRTY_MINUTE: 200,
  ONE_HOUR: 400,
  ONE_DAY: 2000,
};

/** Clamp a requested look-back (in hours) to the interval's SmartAPI ceiling. */
function clampHours(interval: CandleInterval, hours: number): number {
  return Math.min(hours, MAX_HISTORY_DAYS[interval] * 24);
}

/**
 * Major MCX commodities shown on the Commodities screen. `name` matches the
 * Angel scrip-master `name` field for the commodity's futures; `unit` is the
 * quote unit shown in the UI. Ordered roughly by retail popularity.
 */
const COMMODITIES: ReadonlyArray<{
  name: string;
  label: string;
  unit: string;
}> = [
  { name: 'GOLD', label: 'Gold', unit: '10 g' },
  { name: 'SILVER', label: 'Silver', unit: '1 kg' },
  { name: 'CRUDEOIL', label: 'Crude Oil', unit: '1 bbl' },
  { name: 'NATURALGAS', label: 'Natural Gas', unit: '1 mmBtu' },
  { name: 'COPPER', label: 'Copper', unit: '1 kg' },
  { name: 'GOLDM', label: 'Gold Mini', unit: '10 g' },
  { name: 'SILVERM', label: 'Silver Mini', unit: '1 kg' },
  { name: 'CRUDEOILM', label: 'Crude Oil Mini', unit: '1 bbl' },
  { name: 'GOLDPETAL', label: 'Gold Petal', unit: '1 g' },
  { name: 'SILVERMIC', label: 'Silver Micro', unit: '1 kg' },
  { name: 'NATGASMINI', label: 'Natural Gas Mini', unit: '1 mmBtu' },
  { name: 'ZINC', label: 'Zinc', unit: '1 kg' },
  { name: 'ALUMINIUM', label: 'Aluminium', unit: '1 kg' },
  { name: 'LEAD', label: 'Lead', unit: '1 kg' },
  { name: 'NICKEL', label: 'Nickel', unit: '1 kg' },
  { name: 'ZINCMINI', label: 'Zinc Mini', unit: '1 kg' },
  { name: 'ALUMINI', label: 'Aluminium Mini', unit: '1 kg' },
  { name: 'LEADMINI', label: 'Lead Mini', unit: '1 kg' },
];

@Injectable()
export class MarketService {
  private readonly logger = new Logger(MarketService.name);

  constructor(
    private readonly smartapi: SmartApiService,
    private readonly scripMaster: ScripMasterService,
    private readonly directory: CompanyDirectoryService,
  ) {}

  /// Full company name for a cash-equity ticker ("KOTAKBANK" → "Kotak
  /// Mahindra Bank"); the display name for an index ("Nifty 50"); else null.
  companyNameOf(inst: Instrument): string | null {
    if (inst.isEquity) return this.directory.nameFor(inst.name);
    if (inst.instrumentType === 'AMXIDX' || inst.instrumentType === 'INDEX') {
      return inst.symbol;
    }
    return null;
  }

  /// Search by ticker OR company name ("kotak", "kotak mah", "KOTAKBANK" all
  /// find Kotak Mahindra Bank). Candidates come from the scrip master (ticker
  /// matches) plus the NSE company directory (name matches), then one score
  /// ranks them: exact ticker → ticker prefix → name prefix → every query word
  /// prefixing a name word → substring hits. Debt series are demoted.
  search(query: string, exchange: Exchange = 'NSE', limit = 20) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const qWords = q.split(/\s+/).filter(Boolean);

    const candidates = new Map<string, Instrument>();
    for (const inst of this.scripMaster.searchInstruments(q, exchange, 400)) {
      candidates.set(`${inst.exchange}:${inst.token}`, inst);
    }
    const aliased = new Set<string>();
    if (exchange === 'NSE' || exchange === 'BSE') {
      for (const hit of this.directory.matchByName(q, 60)) {
        const inst = this.scripMaster.getEquity(hit.symbol, exchange);
        if (inst) candidates.set(`${inst.exchange}:${inst.token}`, inst);
      }
      if (q.length >= 3) {
        for (const [alias, symbols] of Object.entries(SEARCH_ALIASES)) {
          if (!alias.startsWith(q)) continue;
          for (const sym of symbols) {
            const inst = this.scripMaster.getEquity(sym, exchange);
            if (!inst) continue;
            candidates.set(`${inst.exchange}:${inst.token}`, inst);
            aliased.add(inst.token);
          }
        }
      }
    }

    const scored: { inst: Instrument; score: number }[] = [];
    for (const inst of candidates.values()) {
      const ticker = inst.name.toUpperCase();
      const company = this.companyNameOf(inst)?.toUpperCase() ?? '';
      const companyWords = company.split(/[\s\-&().,/]+/).filter(Boolean);
      let score = 0;
      if (ticker === q) score = 1000;
      else if (ticker.startsWith(q)) score = 850 - ticker.length;
      else if (aliased.has(inst.token)) score = 780;
      else if (company && company.startsWith(q)) score = 700;
      else if (
        company &&
        qWords.every((w) => companyWords.some((cw) => cw.startsWith(w)))
      ) {
        score = 600;
      } else if (ticker.includes(q)) score = 400;
      else if (company.includes(q)) score = 300;
      if (score === 0) continue;
      score += CAP_BOOST.get(ticker) ?? 0;

      const series = nseSeriesOf(inst);
      if (series !== null) {
        if (!EQUITY_SERIES.has(series)) score -= 600;
        else if (series !== 'EQ') score -= 5;
      }
      if (inst.instrumentType === 'AMXIDX' || inst.instrumentType === 'INDEX') {
        score += 15; // indices are what users usually mean by "nifty"
      }
      if (score > 0) scored.push({ inst, score });
    }
    scored.sort(
      (a, b) => b.score - a.score || a.inst.name.length - b.inst.name.length,
    );
    return scored.slice(0, limit).map(({ inst }) => this.toListItem(inst));
  }

  /// Contract facts the trade ticket needs to price an order like a real
  /// broker: whether it's margined, the margin rate, and (MCX) the physical
  /// lot / quote units so "1 lot" can read "1 kg, priced per 10 g".
  contractInfo(inst: Instrument) {
    const isFuture = isFutureInstrumentType(inst.instrumentType);
    const spec = commoditySpec(inst.exchange, inst.name);
    // F&O availability for the UNDERLYING (the stock / index this is, or
    // the contract's underlying). Drives whether the app offers an option
    // chain at all — most stocks aren't in the F&O list.
    const underlying = inst.name;
    return {
      instrumentType: inst.instrumentType || 'EQ',
      expiry: inst.expiry,
      fnoUnderlying: underlying,
      hasOptions: this.scripMaster.hasLiveOptions(underlying),
      hasFutures: this.scripMaster.hasLiveFutures(underlying),
      isFuture,
      marginRatePct: isFuture
        ? Number(futuresMarginBps(inst.exchange, inst.name)) / 100
        : null,
      lotLabel: spec?.lotLabel ?? null,
      quoteUnit: spec?.quoteUnit ?? null,
      contractSupported: isContractSupported(inst.exchange, inst.name),
    };
  }

  async getQuote(symbol: string, exchange: Exchange = 'NSE') {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        notFoundMessage(symbol, exchange),
      );
    }
    const base = {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      exchange: inst.exchange,
      symboltoken: inst.token,
      companyName: this.companyNameOf(inst),
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      ...this.contractInfo(inst),
    };
    // FULL multi-quote works across ALL exchanges (getLtp is cash-only) and
    // carries the richer stats — VWAP, traded volume, OI, and total buy/sell
    // quantity — that the detail screen surfaces below the price.
    try {
      const fetched = await this.smartapi.getMultiQuote(
        { [inst.exchange]: [inst.token] },
        'FULL',
      );
      const q = fetched[0];
      if (q && q.ltp > 0) {
        return {
          ...base,
          ltp: q.ltp,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          netChange: q.netChange,
          percentChange: q.percentChange,
          vwap: q.avgPrice,
          volume: q.tradeVolume,
          opnInterest: q.opnInterest,
          totBuyQuan: q.totBuyQuan,
          totSellQuan: q.totSellQuan,
          fetchedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      this.logger.warn(
        `quote FULL ${inst.exchange}:${inst.token} failed: ` +
          `${(err as Error).message}; falling back to LTP`,
      );
    }
    // Fallback: the cash LTP endpoint (equity only) still gives us OHLC.
    try {
      const ltp = await this.smartapi.getLtp({
        exchange: inst.exchange,
        tradingsymbol: inst.symbol,
        symboltoken: inst.token,
      });
      return {
        ...base,
        ltp: ltp.ltp,
        open: ltp.open,
        high: ltp.high,
        low: ltp.low,
        close: ltp.close,
        fetchedAt: new Date().toISOString(),
      };
    } catch {
      return {
        ...base,
        ltp: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        fetchedAt: new Date().toISOString(),
      };
    }
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
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
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
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        notFoundMessage(symbol, exchange),
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
    // Never ask for more than SmartAPI serves per interval, or the whole
    // request errors (this is why "5Y"/"ALL" used to come back empty).
    effectiveHours = clampHours(effectiveInterval, effectiveHours);
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
        now.getTime() -
          clampHours('ONE_DAY', Math.max(effectiveHours, 24 * 90)) *
            60 *
            60 *
            1000,
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
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        notFoundMessage(symbol, exchange),
      );
    }
    const now = new Date();
    const from = new Date(
      now.getTime() - clampHours(interval, hours) * 60 * 60 * 1000,
    );
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

  /**
   * Live rates for the major MCX commodities, each resolved to its
   * front-month future so users see one tradeable contract per commodity.
   * Powers the Commodities screen; tapping a row opens the contract's detail
   * screen where it can be traded like any other derivative.
   */
  async getCommodities() {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const entries: { meta: (typeof COMMODITIES)[number]; inst: Instrument }[] =
      [];
    const tokens: string[] = [];
    for (const meta of COMMODITIES) {
      // Roll off a contract in its last 2 days so nobody buys into a series
      // that's about to be cash-settled at the next close.
      const inst = this.scripMaster.getNearestFuture(meta.name, 'MCX', 2);
      if (!inst) continue;
      entries.push({ meta, inst });
      tokens.push(inst.token);
    }
    const quoteByToken = new Map<string, MultiQuoteFetchedLike>();
    const BATCH = 50;
    for (let i = 0; i < tokens.length; i += BATCH) {
      try {
        const fetched = await this.smartapi.getMultiQuote(
          { MCX: tokens.slice(i, i + BATCH) },
          'FULL',
        );
        for (const q of fetched) quoteByToken.set(q.symbolToken, q);
      } catch {
        // best-effort — a missing batch just shows dashes for those rows
      }
    }
    const results = entries.map(({ meta, inst }) => {
      const q = quoteByToken.get(inst.token);
      const ltp = q?.ltp ?? 0;
      const close = q?.close ?? 0;
      const change = q?.netChange ?? (close > 0 ? ltp - close : 0);
      const changePct =
        q?.percentChange ?? (close > 0 ? (change / close) * 100 : 0);
      const spec = commoditySpec(inst.exchange, inst.name);
      const marginRatePct =
        Number(futuresMarginBps(inst.exchange, inst.name)) / 100;
      // lotSize is in quotation units, so this is the real MCX contract value.
      const contractValue = ltp * inst.lotSize;
      return {
        name: meta.name,
        label: spec?.label ?? meta.label,
        unit: spec?.quoteUnit ?? meta.unit,
        tradingsymbol: inst.symbol,
        symboltoken: inst.token,
        exchange: inst.exchange,
        lotSize: inst.lotSize,
        lotLabel: spec?.lotLabel ?? null,
        quoteUnit: spec?.quoteUnit ?? meta.unit,
        expiry: inst.expiry,
        ltp,
        open: q?.open ?? 0,
        high: q?.high ?? 0,
        low: q?.low ?? 0,
        close,
        change,
        changePct,
        contractValue,
        marginRatePct,
        marginPerLot: (contractValue * marginRatePct) / 100,
      };
    });
    return { results, fetchedAt: new Date().toISOString() };
  }

  /** F&O gainers / losers (price or OI) via the SmartAPI marketData feed. */
  async getFnoMovers(datatype: GainersLosersType, expirytype: ExpiryBucket) {
    const rows = await this.smartapi.getGainersLosers(datatype, expirytype);
    return {
      datatype,
      expirytype,
      results: rows.map((r) => ({
        tradingsymbol: r.tradingSymbol,
        // SmartAPI returns symbolToken as a number — send it as a string so
        // the app's `as String` parsing can't crash.
        symboltoken: String(r.symbolToken),
        percentChange: Number(r.percentChange),
        opnInterest: Number(r.opnInterest),
        netChangeOpnInterest: Number(r.netChangeOpnInterest),
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
        symboltoken: String(r.symbolToken),
        ltp: Number(r.ltp),
        netChange: Number(r.netChange),
        percentChange: Number(r.percentChange),
        opnInterest: Number(r.opnInterest),
        netChangeOpnInterest: Number(r.netChangeOpnInterest),
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Official option greeks + IV per strike for an underlying at one expiry
   * (expiry as "DDMMMYYYY", matching the scrip-master expiry strings). Powers
   * the option-chain IV column and the per-leg greeks sheet. Best-effort:
   * greeks exist only for live contracts, so an empty/failed response degrades
   * to "no greeks" in the app rather than erroring the screen.
   */
  async getOptionGreeks(name: string, expiry: string) {
    const upperName = name.toUpperCase();
    const upperExpiry = expiry.toUpperCase();
    let rows: Awaited<ReturnType<typeof this.smartapi.getOptionGreeks>> = [];
    try {
      rows = await this.smartapi.getOptionGreeks(upperName, upperExpiry);
    } catch (err) {
      this.logger.warn(
        `option-greeks ${upperName} ${upperExpiry} failed: ` +
          `${(err as Error).message}`,
      );
    }
    return {
      name: upperName,
      expiry: upperExpiry,
      results: rows.map((r) => ({
        strikePrice: Number(r.strikePrice),
        optionType: r.optionType,
        delta: Number(r.delta),
        gamma: Number(r.gamma),
        theta: Number(r.theta),
        vega: Number(r.vega),
        iv: Number(r.impliedVolatility),
        tradeVolume: Number(r.tradeVolume),
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

  getExpiries(underlying: string) {
    if (!this.scripMaster.isReady()) {
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const expiries = this.scripMaster.getExpiries(underlying);
    if (expiries.length === 0) {
      throw new NotFoundException(
        `${underlying.toUpperCase()} isn't in the F&O segment, so it has no option chain.`,
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
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const rows = this.scripMaster.getOptionChain(underlying, expiry);
    if (rows.length === 0) {
      throw new NotFoundException(
        `No option contracts for ${underlying.toUpperCase()} expiring ${expiry}. Pick another expiry.`,
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
      throw new ServiceUnavailableException(MARKET_DATA_LOADING);
    }
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        notFoundMessage(symbol, exchange),
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
      companyName: this.companyNameOf(inst),
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
      ...this.contractInfo(inst),
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
      companyName: this.companyNameOf(i),
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
