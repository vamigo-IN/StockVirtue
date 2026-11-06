/**
 * Pure helpers for the website's small option chain (the home page's F&O
 * card): which expiry is the nearest one still trading, and which strikes
 * sit around the spot. No clock and no broker: callers pass the time and
 * the scrip master's rows, so the rules are easy to test.
 */

const IST_MS = 330 * 60_000;
/** NSE's F&O close, in minutes after IST midnight. */
const NSE_CLOSE_MIN = 15 * 60 + 30;

const MONTHS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

/** "04NOV2026" (the scrip master's form) → "2026-11-04"; null when it isn't one. */
export function expiryDate(expiry: string): string | null {
  const m = /^(\d{1,2})([A-Z]{3})(\d{4})$/.exec(expiry.trim().toUpperCase());
  if (!m || !MONTHS[m[2]]) return null;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
}

/**
 * The nearest of `expiries` still trading at `now` (ms): a series that
 * expires today counts until NSE's 3:30 pm IST close, then the next one
 * takes over. Null when none is left.
 */
export function nearestTradingExpiry(
  expiries: readonly string[],
  now: number,
): string | null {
  const ist = new Date(now + IST_MS);
  const today = ist.toISOString().slice(0, 10);
  const closed =
    ist.getUTCHours() * 60 + ist.getUTCMinutes() >= NSE_CLOSE_MIN;
  let best: { expiry: string; date: string } | null = null;
  for (const expiry of expiries) {
    const date = expiryDate(expiry);
    if (!date || date < today || (date === today && closed)) continue;
    if (!best || date < best.date) best = { expiry, date };
  }
  return best?.expiry ?? null;
}

/**
 * The strike nearest `spot` (the at-the-money one) and up to `each` strikes
 * either side of it, from rows sorted by strike. Fewer at the chain's ends.
 */
export function strikesAround<T extends { strike: number }>(
  rows: readonly T[],
  spot: number,
  each: number,
): T[] {
  if (!rows.length || !(spot > 0)) return [];
  let atm = 0;
  for (let i = 1; i < rows.length; i++) {
    if (Math.abs(rows[i].strike - spot) < Math.abs(rows[atm].strike - spot)) {
      atm = i;
    }
  }
  return rows.slice(Math.max(0, atm - each), atm + each + 1);
}
