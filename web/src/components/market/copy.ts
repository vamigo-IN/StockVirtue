// F20's status only, not the whole fact table: the client MoversBoard reads this file.
import { F20_STATUS } from '@/content/fact-status';
import type { CapSegment, ChartRange } from '@/market/paths';
import type { DataLabel } from '@/market/types';

/**
 * The market microcopy (spec §9.7), word for word. The market modules read
 * their strings from here, so a wording change happens in one place. No
 * 'use client' and no 'server-only': server and client modules share it.
 *
 * The counts in the movers footnotes are fact F20 (spec §9.3): the tracked
 * lists in backend/src/market/cap-segments.ts, recounted at every release.
 * While F20 isn't confirmed, the footnotes fall back to wording without the
 * numbers (src/content/app.ts; its status is set in src/content/fact-status.ts
 * so the client bundle doesn't carry the whole fact table).
 */

export const PILL_TEXT: Record<DataLabel, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed',
  EOD: 'End of day',
};

/** "Delayed 15m" (the minutes only under a DELAYED licence: `delayFor`). */
export function pillText(label: DataLabel, delay?: number): string {
  return label === 'DELAYED' && delay
    ? `${PILL_TEXT.DELAYED} ${delay}m`
    : PILL_TEXT[label];
}

export const COPY = {
  pricesAsOf: 'Prices as of ',
  loading: 'Loading market data',
  /** WidgetMessage kind="rights" keeps it (widgets-e2e reads /licen/i). */
  rights: 'Not available under our current market-data licence.',
  errorNoData: 'Market data isn’t available right now. It will reappear shortly.',
  /** "Couldn't refresh. Showing prices from {time} IST." The time comes from StampTime, which ends in "IST". */
  staleLead: 'Couldn’t refresh. Showing prices from ',
  hubNotice:
    'Movers, sectors and the heatmap need our live data licence, which the website doesn’t have right now.',
  volatilityIndex: 'volatility index',
  noChange: 'no change yet',

  // Charts
  intradayDisabled: 'Needs our live data licence',
  chartRights: 'Charts aren’t available under our current market-data licence.',
  chartRightsIntraday:
    'Intraday charts aren’t available under our current market-data licence.',
  chartModes: { candles: 'Candles', compare: 'Compare' },
  showNumbers: 'Show the numbers',
  daily: 'Daily',

  // Movers
  moversTitle: 'Biggest moves',
  moversTabs: { gainers: 'Gainers', losers: 'Losers', active: 'Most active' },
  segments: {
    largecap: 'Large caps',
    midcap: 'Mid caps',
    smallcap: 'Small caps',
  } as Record<CapSegment, string>,

  // Sectors
  sectorsTitle: 'Sector moves',
  sectorsAll: 'All 14 sectors on the Markets page',

  // Heatmap
  heatTabs: { NIFTY: 'Nifty 50', BANKNIFTY: 'Bank Nifty', SENSEX: 'Sensex' },
  heatLegend: { low: '−2%', high: '+2%' },
  viewAsList: 'View as list',
  showAsTiles: 'Show as tiles',
  showAsList: 'Show as a list',
  backToGrid: 'Back to the grid',

  // Commodities
  commodityTitle: 'Commodities and the rupee',
  commodityCaption: 'MCX futures, nearest expiry. Prices are per the unit shown.',
  commodityHubCaption:
    'Charts follow the current contract, so a long range starts when that contract began trading.',
  rupeeCaption: 'Rupee rates update about every 20 seconds.',

  // IPOs
  ipoTables: {
    open: 'Open now',
    upcoming: 'Upcoming',
    listingSoon: 'Listing soon',
    recentlyListed: 'Recently listed',
  },
  ipoUnavailable: 'IPO data isn’t available right now.',
  ipoWatchTitle: 'IPO watch',
  ipoNoneOpen: 'No IPOs are open right now. These open next.',
  ipoCalendar: 'IPO calendar',
  lastPrice: 'Last price',
  sinceIssue: 'Since issue',
} as const;

/** "Ranked among the 49 large caps we track, not the whole exchange." (F20) */
export const TRACKED = { largecap: 49, midcap: 47, smallcap: 40, distinct: 135 } as const; // F20

const SEGMENT_WORD: Record<CapSegment, string> = {
  largecap: 'large',
  midcap: 'mid',
  smallcap: 'small',
};

export function moversFootnote(segment: CapSegment): string {
  // F20
  return F20_STATUS === 'confirmed'
    ? `Ranked among the ${TRACKED[segment]} ${SEGMENT_WORD[segment]} caps we track, not the whole exchange.`
    : `Ranked among the ${SEGMENT_WORD[segment]} caps we track, not the whole exchange.`;
}

/** "Ranked by volume among the 135 stocks we track, not the whole exchange." (F20) */
export function activeFootnote(): string {
  // F20
  return F20_STATUS === 'confirmed'
    ? `Ranked by volume among the ${TRACKED.distinct} stocks we track, not the whole exchange.`
    : 'Ranked by volume among the stocks we track, not the whole exchange.';
}

/** "Vol 1.20 Cr" */
export const volText = (v: string) => `Vol ${v}`;

/** "31 rising · 19 falling · Nifty 50 members" */
export function breadthText(up: number, down: number, indexName: string): string {
  return `${up} rising · ${down} falling · ${indexName} members`;
}

/** "Equal-size tiles, one per Nifty 50 company. They don't show index weight." */
export function heatCaption(indexName: string): string {
  return `Equal-size tiles, one per ${indexName} company. They don’t show index weight.`;
}

/** "Show 40 more" (the heatmap list's middle rows on phones). */
export const showMore = (n: number) => `Show ${n} more`;

/** "Show 30 more listings" (Recently listed, after the ten newest). */
export const showMoreListings = (n: number) =>
  `Show ${n} more listing${n === 1 ? '' : 's'}`;

/** "3 open now" (LiveChip on the IPO rule head). */
export const openNow = (n: number) => `${n} open now`;

/** "IPO data: NSE · as of 4 Nov 2026, 9:40 am IST" */
export const ipoFooter = (attribution: string, asOf: string) =>
  `${attribution || 'IPO data: NSE'} · as of ${asOf}`;

/* ── Charts ─────────────────────────────────────────────────────────────── */

export const RANGE_WORDS: Record<ChartRange, string> = {
  '1D': '1 day',
  '5D': '5 days',
  '1M': '1 month',
  '6M': '6 months',
  '1Y': '1 year',
};

/** An index's 1M answer holds about three months (the API widens it). */
export function rangeWords(range: ChartRange, index: boolean): string {
  return index && range === '1M' ? '3 months' : RANGE_WORDS[range];
}

/** "This contract has traded only since 2 Jul 2026" / "Prices for Infosys start on 2 Jul 2026" */
export function shortHistoryReason(contract: boolean, name: string, since: string): string {
  return contract
    ? `This contract has traded only since ${since}`
    : `Prices for ${name} start on ${since}`;
}

/** "since 2 Jul 2026, when this contract began trading" / "since 2 Jul 2026, the earliest price we have" */
export function sinceWords(contract: boolean, since: string): string {
  return contract
    ? `since ${since}, when this contract began trading`
    : `since ${since}, the earliest price we have`;
}

/** The intraday-unavailable line (spec §5.10.2, §5.13). */
export function noIntradayText(contract: boolean, name: string): string {
  return contract
    ? 'Intraday prices aren’t available for this contract right now.'
    : `Intraday prices aren’t available for ${name} right now.`;
}

/** "Gold · Dec future (GOLD26DECFUT)" */
export function contractHeader(name: string, month: string | null, contract: string): string {
  return month ? `${name} · ${month} future (${contract})` : `${name} (${contract})`;
}
