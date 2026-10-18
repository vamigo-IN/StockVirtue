import { Exchange } from '../common/exchange';

export interface RawScripMasterEntry {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  strike: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
  tick_size: string;
}

export interface Instrument {
  token: string;
  symbol: string; // tradingsymbol, e.g. SBIN-EQ
  name: string; // short name, e.g. SBIN
  exchange: Exchange;
  instrumentType: string; // "" for equity; FUTSTK, OPTSTK, etc. for derivatives
  /// Quantity step, in QUOTATION units — price × quantity is the true
  /// contract value. Equals the scrip-master lot except on MCX contracts
  /// whose trading unit differs from the quote unit (see contract-specs).
  lotSize: number;
  /// Lot size exactly as the scrip master ships it (MCX trading units).
  rawLotSize: number;
  tickSize: number;
  expiry: string | null;
  strike: number | null;
  isEquity: boolean;
}
