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
  lotSize: number;
  tickSize: number;
  expiry: string | null;
  strike: number | null;
  isEquity: boolean;
}
