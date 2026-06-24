import { Exchange } from '../common/exchange';

export type SubscriptionMode = 1 | 2 | 3 | 4; // LTP | Quote | SnapQuote | Depth20

export const EXCHANGE_TO_WS_TYPE: Record<Exchange, number> = {
  NSE: 1,
  NFO: 2,
  BSE: 3,
  BFO: 4,
  MCX: 5,
  NCO: 7,
  CDS: 13,
};

export const WS_TYPE_TO_EXCHANGE: Record<number, Exchange> = Object.fromEntries(
  Object.entries(EXCHANGE_TO_WS_TYPE).map(([k, v]) => [v, k as Exchange]),
) as Record<number, Exchange>;

export interface DepthLevel {
  quantity: number;
  price: number; // rupees
  orders: number;
}

export interface ParsedTick {
  mode: SubscriptionMode;
  exchangeType: number;
  token: string;
  ltp: number; // rupees
  ts: number; // ms epoch from exchange
  // Mode 2 (Quote) extras — undefined when the packet was mode 1.
  lastTradedQty?: number;
  avgTradedPrice?: number;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  // Mode 3 (SnapQuote) extras — undefined when the packet was mode 1 or 2.
  bids?: DepthLevel[];
  asks?: DepthLevel[];
  openInterest?: number;
  upperCircuit?: number;
  lowerCircuit?: number;
  yearHigh?: number;
  yearLow?: number;
}

export interface PublishedTick {
  exchange: Exchange | 'UNKNOWN';
  exchangeType: number;
  token: string;
  ltp: number;
  ts: number;
  lastTradedQty?: number;
  avgTradedPrice?: number;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  bids?: DepthLevel[];
  asks?: DepthLevel[];
  openInterest?: number;
  upperCircuit?: number;
  lowerCircuit?: number;
  yearHigh?: number;
  yearLow?: number;
}
