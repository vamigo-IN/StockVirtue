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
