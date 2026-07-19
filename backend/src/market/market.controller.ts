import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { cacheJson } from '../common/redis-cache';
import { RedisService } from '../redis/redis.service';
import { Exchange, isExchange } from '../common/exchange';
import {
  CandleInterval,
  CANDLE_INTERVALS,
  ExpiryBucket,
  GainersLosersType,
  OIBuildupType,
} from '../smartapi/smartapi.types';
import { CapSegment } from './cap-segments';
import { HolidaysService } from './holidays.service';
import { constituentsFor } from './index-constituents';
import { MarketService, MoverType } from './market.service';
import { ScripMasterService } from './scrip-master.service';

const CAP_SEGMENTS: CapSegment[] = ['largecap', 'midcap', 'smallcap'];
const MOVER_TYPES: MoverType[] = ['gainers', 'losers', 'intraday'];
const EXPIRY_BUCKETS: ExpiryBucket[] = ['NEAR', 'NEXT', 'FAR'];
const GAINERS_LOSERS_TYPES: GainersLosersType[] = [
  'PercPriceGainers',
  'PercPriceLosers',
  'PercOIGainers',
  'PercOILosers',
];
const OI_BUILDUP_TYPES: OIBuildupType[] = [
  'Long Built Up',
  'Short Built Up',
  'Long Unwinding',
  'Short Covering',
];

// Every market route proxies the shared single SmartAPI broker account, so a
// flood from one IP can exhaust that budget and stall trading/portfolio for
// everyone. Cap per-IP well above a real user's browsing rate; the heaviest
// routes tighten this further below.
@Throttle({ default: { limit: 120, ttl: 60_000 } })
@Controller('market')
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly scripMaster: ScripMasterService,
    private readonly holidays: HolidaysService,
    private readonly redis: RedisService,
  ) {}

  /// NSE+BSE trading holidays. The service tries the live NSE
  /// holiday-master API first (and caches the result for 24h) and
  /// falls back to a hand-curated list on failure. The mobile app
  /// uses this to drive its market-status countdown + the holidays
  /// sheet.
  @Get('holidays')
  marketHolidays() {
    return this.holidays.getHolidays();
  }

  /// Constituent stocks of an index, enriched with live LTP + day
  /// change via the same multi-quote path the home strip uses.
  /// 404s for indices we haven't curated yet (curated set lives in
  /// index-constituents.ts). The mobile index-detail screen hides
  /// the section silently on a 404.
  @Get('indices/:symbol/constituents')
  async indexConstituents(@Param('symbol') symbol: string) {
    const set = constituentsFor(symbol);
    if (!set) {
      throw new BadRequestException(
        `No curated constituents for index "${symbol}"`,
      );
    }
    const symbols = set.members.map((m) => m.symbol);
    const quotes = await this.market.getQuotes(symbols, set.exchange);
    // Re-key by symbol so we can preserve the curated order.
    const byKey = new Map(
      quotes.quotes.map((q) => [q.symbol.toUpperCase(), q]),
    );
    return {
      index: symbol.toUpperCase(),
      members: set.members.map((m) => {
        const q = byKey.get(m.symbol.toUpperCase());
        const ltp = q?.ltp;
        const close = q?.close;
        let change: number | null = null;
        let changePct: number | null = null;
        if (ltp != null && close != null && close > 0) {
          change = ltp - close;
          changePct = (change / close) * 100;
        }
        return {
          symbol: m.symbol,
          name: m.name,
          exchange: q?.exchange ?? set.exchange,
          symboltoken: q?.symboltoken ?? null,
          tradingsymbol: q?.tradingsymbol ?? null,
          ltp,
          close,
          change,
          changePct,
        };
      }),
      fetchedAt: quotes.fetchedAt,
    };
  }

  @Get('search')
  search(
    @Query('q') q = '',
    @Query('exchange') exchangeRaw = 'NSE',
    @Query('limit') limitRaw = '20',
  ) {
    const exchange = this.parseExchange(exchangeRaw);
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100);
    return {
      query: q,
      exchange,
      results: this.market.search(q, exchange, limit),
    };
  }

  @Get('quote/:symbol')
  quote(
    @Param('symbol') symbol: string,
    @Query('exchange') exchangeRaw = 'NSE',
  ) {
    return this.market.getQuote(symbol, this.parseExchange(exchangeRaw));
  }

  /// Resolves the same equity on the opposite exchange (NSE ↔ BSE). The
  /// mobile symbol-detail screen uses this to flip between the two
  /// listings of a dual-listed stock — the BSE token differs from NSE so
  /// the client can't compute it locally. Returns 404 when the symbol
  /// isn't dual-listed (e.g. SBI life on NSE only) so the UI keeps the
  /// toggle disabled.
  @Get('counterpart/:symbol')
  counterpart(
    @Param('symbol') symbol: string,
    @Query('exchange') exchangeRaw = 'NSE',
  ) {
    const exchange = this.parseExchange(exchangeRaw);
    if (exchange !== 'NSE' && exchange !== 'BSE') {
      throw new BadRequestException(
        'Counterpart lookup is only meaningful for NSE/BSE equities',
      );
    }
    const other: Exchange = exchange === 'NSE' ? 'BSE' : 'NSE';
    const inst = this.scripMaster.getEquity(symbol, other);
    if (!inst) {
      throw new BadRequestException(`${symbol} is not listed on ${other}`);
    }
    return {
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      symboltoken: inst.token,
      exchange: inst.exchange,
      lotSize: inst.lotSize,
      tickSize: inst.tickSize,
    };
  }

  // Top movers across a market-cap bucket — powers the home "Top movers"
  // section. Type chooses day gainers, day losers, or strongest intraday
  // movers (by |% change|).
  @Get('movers')
  movers(
    @Query('segment') segmentRaw = 'largecap',
    @Query('type') typeRaw = 'gainers',
    @Query('limit') limitRaw = '10',
  ) {
    const segment = this.parseCap(segmentRaw);
    const type = this.parseMoverType(typeRaw);
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), 30);
    return cacheJson(
      this.redis.client,
      `mkt:movers:${segment}:${type}:${limit}`,
      5,
      () => this.market.getMovers(segment, type, limit),
    );
  }

  private parseCap(value: string): CapSegment {
    const lower = value.toLowerCase() as CapSegment;
    if (!CAP_SEGMENTS.includes(lower)) {
      throw new BadRequestException(`Invalid segment "${value}"`);
    }
    return lower;
  }

  private parseMoverType(value: string): MoverType {
    const lower = value.toLowerCase() as MoverType;
    if (!MOVER_TYPES.includes(lower)) {
      throw new BadRequestException(`Invalid type "${value}"`);
    }
    return lower;
  }

  // Batch LTP+OHLC for a comma-separated list of symbols on one exchange.
  // Used by the home feed to paint indices + trending stocks in one round trip.
  @Get('quotes')
  quotes(
    @Query('symbols') symbolsRaw = '',
    @Query('exchange') exchangeRaw = 'NSE',
  ) {
    const symbols = symbolsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 50);
    if (symbols.length === 0) {
      throw new BadRequestException('symbols query param is required');
    }
    const exchange = this.parseExchange(exchangeRaw);
    return cacheJson(
      this.redis.client,
      `mkt:quotes:${exchange}:${symbols.join(',')}`,
      3,
      () => this.market.getQuotes(symbols, exchange),
    );
  }

  @Get('expiries/:underlying')
  expiries(@Param('underlying') underlying: string) {
    return this.market.getExpiries(underlying);
  }

  // Major MCX commodities with live rates (front-month future per commodity).
  @Get('commodities')
  commodities() {
    return cacheJson(this.redis.client, 'mkt:commodities', 5, () =>
      this.market.getCommodities(),
    );
  }

  @Get('option-chain/:underlying')
  optionChain(
    @Param('underlying') underlying: string,
    @Query('expiry') expiry: string,
  ) {
    if (!expiry) {
      throw new BadRequestException('expiry query param is required');
    }
    return cacheJson(
      this.redis.client,
      `mkt:oc:${underlying}:${expiry}`,
      4,
      () => this.market.getOptionChain(underlying, expiry),
    );
  }

  // Official option greeks + IV per strike (delta/gamma/theta/vega/IV) for the
  // option chain's IV column and the per-leg greeks sheet.
  @Get('option-greeks/:underlying')
  optionGreeks(
    @Param('underlying') underlying: string,
    @Query('expiry') expiry: string,
  ) {
    if (!expiry) {
      throw new BadRequestException('expiry query param is required');
    }
    return cacheJson(
      this.redis.client,
      `mkt:greeks:${underlying}:${expiry}`,
      5,
      () => this.market.getOptionGreeks(underlying, expiry),
    );
  }

  @Get('snapshot/:symbol')
  snapshot(
    @Param('symbol') symbol: string,
    @Query('exchange') exchangeRaw = 'NSE',
  ) {
    const exchange = this.parseExchange(exchangeRaw);
    return cacheJson(
      this.redis.client,
      `mkt:snap:${exchange}:${symbol}`,
      3,
      () => this.market.getSnapshot(symbol, exchange),
    );
  }

  // Equity scanners — `type` is one of `volume`, `52w-high`, `52w-low`.
  @Get('scanners')
  scanners(@Query('type') typeRaw = 'volume', @Query('limit') limitRaw = '15') {
    const allowed = ['volume', '52w-high', '52w-low'] as const;
    if (!(allowed as readonly string[]).includes(typeRaw)) {
      throw new BadRequestException(`Invalid scanner type "${typeRaw}"`);
    }
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 15, 1), 50);
    return cacheJson(this.redis.client, `mkt:scan:${typeRaw}:${limit}`, 5, () =>
      this.market.runScanner(
        typeRaw as 'volume' | '52w-high' | '52w-low',
        limit,
      ),
    );
  }

  // ── F&O insights via SmartAPI marketData feed ─────────────────────────

  // Real F&O gainers/losers, segmented by expiry. The home shows this
  // alongside our curated equity cap-segment movers.
  @Get('fno-movers')
  fnoMovers(
    @Query('type') typeRaw = 'PercPriceGainers',
    @Query('expiry') expiryRaw = 'NEAR',
  ) {
    const type = this.parseGainersLosersType(typeRaw);
    const expiry = this.parseExpiryBucket(expiryRaw);
    return cacheJson(
      this.redis.client,
      `mkt:fnomovers:${type}:${expiry}`,
      5,
      () => this.market.getFnoMovers(type, expiry),
    );
  }

  // OI buildup classification across F&O contracts.
  @Get('oi-buildup')
  oiBuildup(
    @Query('type') typeRaw = 'Long Built Up',
    @Query('expiry') expiryRaw = 'NEAR',
  ) {
    const type = this.parseOIBuildupType(typeRaw);
    const expiry = this.parseExpiryBucket(expiryRaw);
    return this.market.getOIBuildup(type, expiry);
  }

  // Put-Call Ratio for F&O underlyings.
  @Get('pcr')
  pcr() {
    return this.market.getPutCallRatio();
  }

  // Candles with open-interest column (F&O only).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('candles-oi/:symbol')
  candlesOI(
    @Param('symbol') symbol: string,
    @Query('exchange') exchangeRaw = 'NFO',
    @Query('interval') intervalRaw = 'ONE_DAY',
    @Query('hours') hoursRaw = '720',
  ) {
    const interval = this.parseInterval(intervalRaw);
    const hours = this.quantiseHours(hoursRaw, 720);
    return this.market.getCandlesWithOI(
      symbol,
      this.parseExchange(exchangeRaw),
      interval,
      hours,
    );
  }

  private parseGainersLosersType(value: string): GainersLosersType {
    if (!(GAINERS_LOSERS_TYPES as readonly string[]).includes(value)) {
      throw new BadRequestException(`Invalid F&O movers type "${value}"`);
    }
    return value as GainersLosersType;
  }

  private parseOIBuildupType(value: string): OIBuildupType {
    if (!(OI_BUILDUP_TYPES as readonly string[]).includes(value)) {
      throw new BadRequestException(`Invalid OI buildup type "${value}"`);
    }
    return value as OIBuildupType;
  }

  private parseExpiryBucket(value: string): ExpiryBucket {
    const upper = value.toUpperCase() as ExpiryBucket;
    if (!EXPIRY_BUCKETS.includes(upper)) {
      throw new BadRequestException(`Invalid expiry bucket "${value}"`);
    }
    return upper;
  }

  /// Snaps an arbitrary `hours` value onto the fixed ladder the client actually
  /// requests. These routes are UNAUTHENTICATED and are not fronted by
  /// cacheJson, so their only de-duplication is SmartApiService's signature
  /// cache — which is keyed on the derived from/to timestamps. A free-varying
  /// `hours` therefore produced a distinct key per request, missing the cache
  /// every time and spending the shared broker's historical-data budget. The
  /// rate limiter SLEEPS rather than rejecting, so that excess became an
  /// unbounded queue and real users' charts stalled behind it.
  ///
  /// Quantising caps the number of distinct upstream calls at the ladder size,
  /// while still honouring what the client asked for (rounded up).
  private quantiseHours(raw: string, fallback: number): number {
    const LADDER = [4, 24, 120, 720, 2160, 8760, 17520, 48000];
    const asked = Math.min(Math.max(parseInt(raw, 10) || fallback, 1), 48000);
    return LADDER.find((h) => asked <= h) ?? LADDER[LADDER.length - 1];
  }

  // Tighter than the class default: these are the heaviest unauthenticated
  // routes and each miss costs a shared-broker historical call.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('candles/:symbol')
  candles(
    @Param('symbol') symbol: string,
    @Query('exchange') exchangeRaw = 'NSE',
    @Query('interval') intervalRaw = 'ONE_MINUTE',
    @Query('hours') hoursRaw = '4',
  ) {
    const interval = this.parseInterval(intervalRaw);
    // ~5.5 years on daily candles. The effective range still depends on
    // SmartAPI's per-interval limits (1m/5m capped to ~30 days, 1h to ~400d,
    // 1d to ~2000d) but the controller no longer truncates ahead of time.
    const hours = this.quantiseHours(hoursRaw, 4);
    return this.market.getCandles(
      symbol,
      this.parseExchange(exchangeRaw),
      interval,
      hours,
    );
  }

  private parseInterval(value: string): CandleInterval {
    const upper = value.toUpperCase() as CandleInterval;
    if (!CANDLE_INTERVALS.includes(upper)) {
      throw new BadRequestException(`Invalid interval "${value}"`);
    }
    return upper;
  }

  @Get('scrip-master/status')
  scripStatus() {
    return this.scripMaster.stats();
  }

  private parseExchange(value: string): Exchange {
    const upper = value.toUpperCase();
    if (!isExchange(upper)) {
      throw new BadRequestException(`Invalid exchange "${value}"`);
    }
    return upper;
  }
}
