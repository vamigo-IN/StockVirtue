import { MarketDataRight, MarketInstrumentKind } from '@prisma/client';
import {
  commodityCloseMinutes,
  istNow,
  marketSession,
} from '../common/market-hours';

/**
 * What a reader may be shown of a price, and how it must be labelled. Pure
 * functions, so the licensing rules are easy to test and impossible to skip:
 * every value the public market API returns has passed through `present`.
 */

export type DataLabel = 'LIVE' | 'DELAYED' | 'EOD';
/** Who is asking: the website's server, the app, or anyone else. */
export type Channel = 'web' | 'app' | 'public';

/// A live price older than this is no longer called live.
export const STALE_AFTER_MS = 5 * 60_000;

export interface PricePoint {
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  /** When the exchange set this price (ms); 0 when unknown. */
  ts: number;
}

export interface Shown {
  ltp: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  label: DataLabel;
  /** ms epoch the value is as of. */
  asOf: number;
}

const ORDER: MarketDataRight[] = ['LIVE', 'DELAYED', 'EOD', 'OFF'];

/** The more restrictive of two rights. */
export function stricter(a: MarketDataRight, b: MarketDataRight) {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export function rightFor(
  channel: Channel,
  source: { webRight: MarketDataRight; appRight: MarketDataRight },
): MarketDataRight {
  if (channel === 'web') return source.webRight;
  if (channel === 'app') return source.appRight;
  return stricter(source.webRight, source.appRight);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

function ymd(istMs: number): string {
  return new Date(istMs).toISOString().slice(0, 10);
}

/** Session close for an exchange, in minutes after IST midnight. */
function closeMinutes(exchange: string, at: Date): number {
  if (exchange === 'MCX') return commodityCloseMinutes(at);
  if (exchange === 'CDS') return 17 * 60;
  return 15 * 60 + 30;
}

/** Is the exchange's regular session open now? (CDS: 09:00–17:00 IST.) */
export function sessionOpen(
  exchange: string,
  at: Date,
  holidays?: Set<string>,
): boolean {
  if (exchange !== 'CDS') {
    return marketSession(at, holidays, exchange).kind === 'open';
  }
  const ist = istNow(at);
  const dow = ist.getUTCDay();
  if (dow === 0 || dow === 6 || holidays?.has(ymd(ist.getTime()))) {
    return false;
  }
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 && mins < 17 * 60;
}

/**
 * When the most recent completed session closed, as ms epoch: today's close
 * once it has passed on a trading day, else the previous trading day's.
 */
export function lastSessionClose(
  exchange: string,
  at: Date,
  holidays?: Set<string>,
): number {
  const istNowMs = at.getTime() + IST_MS;
  for (let back = 0; back < 15; back++) {
    const dayIst = istNowMs - back * DAY_MS;
    const midnightIst = dayIst - (dayIst % DAY_MS);
    const dow = new Date(midnightIst).getUTCDay();
    if (dow === 0 || dow === 6 || holidays?.has(ymd(midnightIst))) continue;
    const closeIst =
      midnightIst +
      closeMinutes(exchange, new Date(midnightIst - IST_MS)) * 60_000;
    if (closeIst <= istNowMs) return closeIst - IST_MS;
  }
  return at.getTime();
}

function changeOf(ltp: number, prevClose: number, currency: boolean) {
  if (!(prevClose > 0)) return { change: null, changePct: null };
  const change = currency ? round4(ltp - prevClose) : round2(ltp - prevClose);
  return { change, changePct: round2(((ltp - prevClose) / prevClose) * 100) };
}

function full(
  p: PricePoint,
  label: DataLabel,
  asOf: number,
  kind: MarketInstrumentKind,
): Shown {
  return {
    ltp: p.ltp,
    open: p.open || null,
    high: p.high || null,
    low: p.low || null,
    prevClose: p.prevClose || null,
    ...changeOf(p.ltp, p.prevClose, kind === 'CURRENCY'),
    label,
    asOf,
  };
}

/**
 * The value a reader may see under `right`, labelled. `current` is the latest
 * price, `delayed` the price `delayMinutes` ago (DELAYED rights), `open`
 * whether the instrument's session is open now. Null = show nothing.
 */
export function present(opts: {
  right: MarketDataRight;
  kind: MarketInstrumentKind;
  open: boolean;
  now: number;
  current: PricePoint | null;
  delayed?: PricePoint | null;
  lastClose: number;
}): Shown | null {
  const { right, kind, open, now, current, lastClose } = opts;
  if (right === 'OFF' || !current || !(current.ltp > 0)) return null;

  // Closed market: the last price of the session is an end-of-day value.
  if (!open) {
    const asOf = current.ts > 0 ? Math.min(current.ts, now) : lastClose;
    return full(current, 'EOD', asOf, kind);
  }

  // The previous session's close, for EOD rights (or no delayed sample yet).
  const previousClose = (): Shown | null =>
    current.prevClose > 0
      ? {
          ltp: current.prevClose,
          open: null,
          high: null,
          low: null,
          prevClose: null,
          change: null,
          changePct: null,
          label: 'EOD',
          asOf: lastClose,
        }
      : null;

  if (right === 'EOD') return previousClose();
  if (right === 'DELAYED') {
    const d = opts.delayed;
    return d && d.ltp > 0 ? full(d, 'DELAYED', d.ts, kind) : previousClose();
  }
  // LIVE: but a price that has stopped moving is not called live.
  const ts = current.ts > 0 ? current.ts : now;
  return full(
    current,
    now - ts <= STALE_AFTER_MS ? 'LIVE' : 'DELAYED',
    ts,
    kind,
  );
}
