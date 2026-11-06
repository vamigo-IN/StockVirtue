import type { DataRight, TickerData } from '@/market/types';

/**
 * Small pure rules shared by server layouts and client market modules
 * (spec §7.0). No 'use client' and no 'server-only'.
 */

/**
 * The site-prices gate (spec §7.0 rule 4): whether the home page, its header
 * chip and footer data line, and the one chart on /features may show market
 * prices. True only when the ticker loaded, the admin's placement is
 * "News pages and the home page" (`news_and_site`) and the website's licence
 * isn't OFF. News pages ignore it: they follow the licence alone.
 */
export function pricesOnSite(t: TickerData | null | undefined): boolean {
  return !!t && t.config?.placement === 'news_and_site' && t.right !== 'OFF';
}

/**
 * The delay to print in a "Delayed {n}m" pill: the minutes only when the
 * licence is DELAYED (and the minutes are a positive number); otherwise
 * undefined, so the pill reads just "Live" or "End of day".
 */
export function delayFor(
  right?: DataRight | null,
  minutes?: number | null,
): number | undefined {
  return right === 'DELAYED' &&
    typeof minutes === 'number' &&
    Number.isFinite(minutes) &&
    minutes > 0
    ? minutes
    : undefined;
}

/**
 * Volatility indices (India VIX) are never coloured up or down, are left out
 * of the Ridgeline and IndexRail, and carry the note "volatility index" in
 * IndexBoard (spec §3.1.1, §7.0 rule 8).
 */
export function isVolatilityIndex(ref: string): boolean {
  return /VIX/i.test(ref);
}
