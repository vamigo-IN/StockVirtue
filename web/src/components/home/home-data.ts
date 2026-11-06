import 'server-only';
import { pricesOnSite } from '@/components/market/gate';
import { getRidgeline } from '@/market/ridgeline';
import {
  getContractNote,
  getIpos,
  getMovers,
  getOptionChain,
  getSnapshot,
} from '@/market/server';
import type { Snapshot, TickerData } from '@/market/types';
import { getListing } from '@/news/api';
import type { HomeData } from './pages/HomeView';

/**
 * The curated stock the worked contract note uses: HDFC Bank, the stock
 * the "How a trade works" steps follow, else the first curated stock.
 */
export function noteRef(snapshot: Snapshot | null): string | null {
  const stocks = snapshot?.instruments.filter((q) => q.kind === 'STOCK') ?? [];
  return (stocks.find((q) => q.ref === 'NSE:HDFCBANK') ?? stocks[0])?.ref ?? null;
}

/**
 * Everything the home page draws besides its content, for `/` and the
 * preview route alike: all in parallel, every source null-safe (spec §5.1.5,
 * §7.2). `ticker` decides the site-prices gate, so what needs the gate
 * starts as soon as it arrives:
 * - the Ridgeline (the desk's year-long chart) with the gate on;
 * - the large caps' gainers and losers (the desk's "Biggest moves") and the
 *   small NIFTY option chain (the F&O card) only under a LIVE licence, the
 *   only one the API answers them for (spec §7.12 rule 4: ask for nothing
 *   the licence won't show);
 * - the worked contract note with the gate on, once the snapshot names its
 *   stock.
 * The movers share the browser MoversBoard's cache entries (one canonical
 * address per list), so the desk costs the broker nothing extra.
 */
export async function loadHomeData(ticker: Promise<TickerData | null>): Promise<HomeData> {
  const gate = ticker.then((t) => pricesOnSite(t));
  const live = ticker.then((t) => pricesOnSite(t) && t?.right === 'LIVE');
  const snapshot = getSnapshot();
  const [tickerData, snap, ridge, ipos, listing, gainers, losers, chain, note] = await Promise.all([
    ticker,
    snapshot,
    gate.then((on) => getRidgeline(on)),
    getIpos(),
    getListing({ limit: 5 }).catch(() => null),
    live.then((on) => (on ? getMovers('gainers') : null)),
    live.then((on) => (on ? getMovers('losers') : null)),
    live.then((on) => (on ? getOptionChain('NIFTY') : null)),
    Promise.all([gate, snapshot]).then(([on, s]) => {
      const ref = on ? noteRef(s) : null;
      return ref ? getContractNote(ref) : null;
    }),
  ]);
  return {
    ticker: tickerData,
    snapshot: snap,
    ridge,
    ipos,
    news: listing ? listing.items : null,
    movers: { gainers, losers },
    chain,
    note,
  };
}
