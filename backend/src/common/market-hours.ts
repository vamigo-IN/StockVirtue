/// Backend mirror of the mobile `core/market_hours.dart` helper. Used by
/// the order-placement path to refuse MARKET orders outside the
/// 09:15–15:30 IST window (where SmartAPI's LTP just echoes the prior
/// close — filling at that price would feel like a bug to users).
///
/// LIMIT / SL / SL-L / trailing-stop orders bypass this check: they sit
/// PENDING and the limit-watcher fires them when the next live tick
/// crosses the user's threshold. Pre-open (09:00–09:15) is also treated
/// as "no MARKET orders" — real Indian brokers only accept limit-style
/// price discovery during that window.
///
/// Holidays are intentionally NOT looked up here: the mobile holidays
/// list lives in Redis and could be stale on a cold boot; the safe
/// default is to honour the time-of-day window. The list is best-effort
/// passed in (the orders module reads it from HolidaysService) so we can
/// reject a Republic Day MARKET order even if Redis is empty.

export type MarketSessionKind = 'open' | 'preOpen' | 'closed' | 'holiday';

export interface MarketSession {
  kind: MarketSessionKind;
  /// Human-readable reason — used as the error message verbatim when we
  /// reject an order.
  reason: string;
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export function istNow(at?: Date): Date {
  const t = at ?? new Date();
  return new Date(t.getTime() + IST_OFFSET_MS);
}

/// Decides the current trading session. `holidayDates` is an optional
/// set of YYYY-MM-DD strings (IST) — pass the cached list when calling
/// from a service that already has it.
export function marketSession(
  at: Date = new Date(),
  holidayDates?: Set<string>,
): MarketSession {
  const ist = istNow(at);
  const ymd = `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(
    ist.getUTCDate(),
  )}`;
  if (holidayDates?.has(ymd)) {
    return { kind: 'holiday', reason: 'Market is closed for a trading holiday' };
  }
  // getUTCDay on the IST-shifted date gives the IST weekday: 0=Sun, 6=Sat.
  const dow = ist.getUTCDay();
  if (dow === 0 || dow === 6) {
    return { kind: 'closed', reason: 'Market is closed on weekends' };
  }
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const PRE_OPEN_START = 9 * 60;
  const REGULAR_START = 9 * 60 + 15;
  const REGULAR_END = 15 * 60 + 30;
  if (mins >= REGULAR_START && mins < REGULAR_END) {
    return { kind: 'open', reason: '' };
  }
  if (mins >= PRE_OPEN_START && mins < REGULAR_START) {
    return {
      kind: 'preOpen',
      reason:
        'Pre-open auction is live (09:00–09:15 IST). Only LIMIT-style orders are accepted; market orders resume at 09:15.',
    };
  }
  return {
    kind: 'closed',
    reason:
      'Market is closed. NSE & BSE trade 09:15–15:30 IST, Monday–Friday. Place a LIMIT order to queue at your target price.',
  };
}

export function isMarketOpen(
  at: Date = new Date(),
  holidayDates?: Set<string>,
): boolean {
  return marketSession(at, holidayDates).kind === 'open';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
