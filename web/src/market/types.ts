/** Shapes of the public market API (/api/v1/market). Times are ISO strings. */

export type DataLabel = 'LIVE' | 'DELAYED' | 'EOD';
export type DataRight = 'LIVE' | 'DELAYED' | 'EOD' | 'OFF';
export type InstrumentKind = 'INDEX' | 'STOCK' | 'COMMODITY' | 'CURRENCY';

export interface MarketQuote {
  ref: string;
  kind: InstrumentKind;
  exchange: string;
  symbol: string;
  name: string;
  unit: string | null;
  contract: string | null;
  inTicker: boolean;
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  label: DataLabel;
  asOf: string;
}

export interface Sessions {
  equity: boolean;
  commodity: boolean;
  currency: boolean;
}

export interface Snapshot {
  right: DataRight;
  delayMinutes: number;
  attribution: string;
  sessions: Sessions;
  generatedAt: string;
  instruments: MarketQuote[];
  /**
   * Backend task B1: the sorted "NSE:SYM" refs of every stock the website
   * lists by name (the movers' cap lists and the Nifty 50, Bank Nifty and
   * Sensex members), whose stock pages will have a price. Absent on an
   * older backend: then only the curated stock refs count as quotable.
   */
  quotableStocks?: string[];
}

export interface TickerConfig {
  enabled: boolean;
  placement: 'news' | 'news_and_site';
  speed: 'slow' | 'normal' | 'fast';
  direction: 'left' | 'right';
  theme: 'dark' | 'light' | 'brand';
  show: { change: boolean; percent: boolean; labels: boolean };
  nameStyle: 'name' | 'symbol';
  mobile: 'show' | 'hide';
  marketClosed: 'show' | 'hide';
}

export interface TickerData {
  config: TickerConfig;
  attribution: string;
  right: DataRight;
  delayMinutes: number;
  sessions: Sessions;
  generatedAt: string;
  items: MarketQuote[];
}

export interface QuotesData {
  right: DataRight;
  attribution: string;
  generatedAt: string;
  quotes: MarketQuote[];
  missing: string[];
}

export interface ListRow {
  ref: string;
  symbol: string;
  name: string;
  ltp: number;
  change: number | null;
  changePct: number | null;
  volume?: number | null;
}

export interface Labelled<T> {
  available: boolean;
  reason?: 'rights' | 'upstream';
  label: DataLabel | null;
  asOf: string | null;
  attribution: string;
  data: T;
}

export interface Candle {
  /** ms epoch */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type ChartData = Labelled<{
  ref: string;
  range: string;
  interval: string | null;
  candles: Candle[];
}>;

/**
 * The website's small option chain (`option-chain?underlying=NIFTY`, LIVE
 * licence only): the at-the-money strike and two either side at the nearest
 * expiry still trading, and the index level they were picked around.
 */
export interface MiniOptionChain {
  underlying: string;
  /** The index's name from the curated snapshot ("Nifty 50"). */
  name: string;
  /** "2026-11-10" (IST). */
  expiry: string;
  spot: number;
  /** Ascending; a leg with no last price is null. */
  strikes: { strike: number; call: number | null; put: number | null }[];
}
export type OptionChainData = Labelled<MiniOptionChain | null>;

/**
 * A worked contract note (`contract-note?symbol=NSE:HDFCBANK`): 20 shares of
 * a curated stock bought at the day's open and sold at the last price,
 * intraday, charged by the API with the app's own fee schedule. Rupees.
 */
export interface WorkedNote {
  ref: string;
  symbol: string;
  name: string;
  exchange: string;
  qty: number;
  product: 'INTRADAY';
  buy: { price: number; value: number };
  sell: { price: number; value: number };
  charges: {
    brokerage: number;
    stt: number;
    exchangeAndSebi: number;
    stampDuty: number;
    gst: number;
    total: number;
  };
  /** sold − bought − every charge. */
  net: number;
}
export type ContractNoteData = Labelled<WorkedNote | null>;

export interface IpoIssue {
  symbol: string;
  companyName: string;
  segment: 'MAINBOARD' | 'SME';
  priceRange: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  issueSize: number | null;
  openDate: string | null;
  closeDate: string | null;
  subscription: number | null;
}

export interface ListedIpo {
  symbol: string;
  companyName: string;
  segment: 'MAINBOARD' | 'SME';
  issuePrice: number | null;
  listingDate: string;
  ltp: number | null;
  dayChangePct: number | null;
  gainPct: number | null;
  /** Whether the stock trades (resolves in the scrip master). The API already sends these three. */
  tradeable?: boolean;
  exchange?: string;
  tradingsymbol?: string | null;
}

export interface IpoBoard {
  available: boolean;
  fetchedAt: string;
  attribution: string;
  open: IpoIssue[];
  upcoming: IpoIssue[];
  listingSoon: IpoIssue[];
  recentlyListed: ListedIpo[];
}
