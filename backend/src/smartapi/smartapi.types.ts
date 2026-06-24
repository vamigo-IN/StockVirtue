import { Exchange } from '../common/exchange';

export interface SmartApiResponse<T> {
  status: boolean;
  message: string;
  errorcode: string;
  data: T;
}

export interface LoginData {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
}

export interface LtpRequest {
  exchange: Exchange;
  tradingsymbol: string;
  symboltoken: string;
}

export interface LtpData {
  exchange: string;
  tradingsymbol: string;
  symboltoken: string;
  open: number;
  high: number;
  low: number;
  close: number;
  ltp: number;
}

export type QuoteMode = 'LTP' | 'OHLC' | 'FULL';

export interface DepthEntry {
  price: number;
  quantity: number;
  orders: number;
}

export interface MultiQuoteFetched {
  exchange: string;
  tradingSymbol: string;
  symbolToken: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  // FULL mode extras (undefined for LTP/OHLC modes).
  netChange?: number;
  percentChange?: number;
  avgPrice?: number;
  tradeVolume?: number;
  opnInterest?: number;
  lowerCircuit?: number;
  upperCircuit?: number;
  '52WeekLow'?: number;
  '52WeekHigh'?: number;
  totBuyQuan?: number;
  totSellQuan?: number;
  depth?: {
    buy: DepthEntry[];
    sell: DepthEntry[];
  };
}

export interface MultiQuoteUnfetched {
  exchange: string;
  symbolToken: string;
  message: string;
  errorCode: string;
}

export interface MultiQuoteData {
  fetched: MultiQuoteFetched[];
  unfetched: MultiQuoteUnfetched[];
}

export interface SessionStatus {
  authenticated: boolean;
  ttlSeconds?: number;
  feedTokenAvailable?: boolean;
}

export type CandleInterval =
  | 'ONE_MINUTE'
  | 'THREE_MINUTE'
  | 'FIVE_MINUTE'
  | 'TEN_MINUTE'
  | 'FIFTEEN_MINUTE'
  | 'THIRTY_MINUTE'
  | 'ONE_HOUR'
  | 'ONE_DAY';

export const CANDLE_INTERVALS: CandleInterval[] = [
  'ONE_MINUTE',
  'THREE_MINUTE',
  'FIVE_MINUTE',
  'TEN_MINUTE',
  'FIFTEEN_MINUTE',
  'THIRTY_MINUTE',
  'ONE_HOUR',
  'ONE_DAY',
];

export interface CandleRequest {
  exchange: Exchange;
  symboltoken: string;
  interval: CandleInterval;
  /** "YYYY-MM-DD HH:mm" in IST */
  fromdate: string;
  /** "YYYY-MM-DD HH:mm" in IST */
  todate: string;
}

// SmartAPI returns each candle as a tuple: [iso_ts, open, high, low, close, volume]
export type CandleRow = [string, number, number, number, number, number];

// Candles-with-OI: [iso_ts, open, high, low, close, volume, openInterest]
export type CandleOIRow = [string, number, number, number, number, number, number];

// ── Top gainers / losers ────────────────────────────────────────────────
// SmartAPI segments these by expiry bucket: NEAR (current month), NEXT,
// FAR. The "datatype" param picks between price movers and OI movers.

export type GainersLosersType =
  | 'PercPriceGainers'
  | 'PercPriceLosers'
  | 'PercOIGainers'
  | 'PercOILosers';

export type ExpiryBucket = 'NEAR' | 'NEXT' | 'FAR';

export interface GainersLosersRow {
  tradingSymbol: string;
  percentChange: number;
  symbolToken: string;
  opnInterest: number;
  netChangeOpnInterest: number;
}

// ── OI buildup classification ──────────────────────────────────────────

export type OIBuildupType =
  | 'Long Built Up'
  | 'Short Built Up'
  | 'Long Unwinding'
  | 'Short Covering';

export interface OIBuildupRow {
  symbolToken: string;
  ltp: string;
  netChange: string;
  percentChange: string;
  opnInterest: string;
  netChangeOpnInterest: string;
  tradingSymbol: string;
}

// ── Put-Call Ratio ─────────────────────────────────────────────────────

export interface PutCallRatioRow {
  tradingSymbol: string;
  pcr: number;
}

// ── Margin Calculator ──────────────────────────────────────────────────

export interface MarginPosition {
  exchange: Exchange;
  qty: number;
  price: number;
  productType: 'INTRADAY' | 'DELIVERY' | 'CARRYFORWARD';
  token: string;
  tradeType: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOPLOSS_MARKET' | 'STOPLOSS_LIMIT';
  triggerPrice?: number;
}

export interface MarginPreview {
  totalMarginRequired: number;
  marginComponents: {
    netPremium: number;
    spanMargin: number;
    marginBenefit: number;
    deliveryMargin: number;
    nonNFOMargin: number;
    totOptionsPremium: number;
  };
  marginsForOrders: Array<{
    exchange: string;
    qty: number;
    price: number;
    productType: string;
    token: string;
    tradeType: string;
    totalMargin: number;
  }>;
}

// ── Brokerage Calculator ────────────────────────────────────────────────
// The request shape is reused as the body type for /market/brokerage-preview,
// which now computes fees locally (common/fees.ts) instead of calling SmartAPI.

export interface BrokerageEstimateRequest {
  orders: Array<{
    productType: 'DELIVERY' | 'INTRADAY' | 'CARRYFORWARD';
    transactionType: 'BUY' | 'SELL';
    quantity: string;
    price: string;
    exchange: Exchange;
    symbolName: string;
    token: string;
  }>;
}
