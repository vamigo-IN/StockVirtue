/**
 * The app's product facts: the ONLY product facts the site's copy may use
 * (spec §9.3). Copy imports from here, so one edit fixes every page, and
 * every line that uses a fact keeps its tag as a code comment ({/* F6 *\/}).
 *
 * Status:
 * - 'confirmed': checked on 4 Nov 2026 against the source the spec names
 *   (backend, app 1.4.x code or the privacy notice);
 * - 'verify': the owner must confirm it before launch. Until then the
 *   site shows its fallback (factText() returns it), or drops the line
 *   when there is no fallback text.
 *
 * The counts (F9, F10, F20, F31) are recounted from the same source files at
 * every app release (spec §9.3). The text below is the fact itself, word
 * for word from the spec's fact sheet; page copy is in §9.5 and is built
 * from these facts, never typed in with new numbers.
 */

import { F20_STATUS } from './fact-status';

export type FactId =
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8' | 'F9' | 'F10'
  | 'F11' | 'F12' | 'F13' | 'F14' | 'F15' | 'F16' | 'F17' | 'F18' | 'F19' | 'F20'
  | 'F21' | 'F22' | 'F23' | 'F24' | 'F25' | 'F26' | 'F27' | 'F28' | 'F29' | 'F30'
  | 'F31' | 'F32' | 'F33' | 'F34' | 'F35' | 'F36' | 'F37' | 'F38' | 'F39' | 'F40'
  | 'F41' | 'F42';

export type AppFact = {
  /** The fact, word for word from spec §9.3. */
  text: string;
  status: 'confirmed' | 'verify';
  /** What the site says (or does) while the fact isn't confirmed. */
  fallback?: string;
};

export const APP_FACTS: Record<FactId, AppFact> = {
  F1: {
    text: 'Starting balance ₹10 lakh (₹10,00,000) of virtual money',
    status: 'confirmed',
  },
  F2: {
    text: 'Order types: market, limit, stop-loss, stop-loss limit, trailing stop',
    status: 'confirmed',
  },
  F3: { text: 'Products: intraday and delivery', status: 'confirmed' },
  F4: {
    text: "Index and stock futures and options in the exchange's lot sizes, with an option chain for each expiry",
    status: 'confirmed',
  },
  F5: {
    text: "Charges as a discount broker's contract note lists them: STT, exchange and SEBI charges, stamp duty and GST, and brokerage on every trade except delivery share trades. Rates stay out of copy",
    status: 'confirmed',
  },
  F6: {
    text: "A futures buy blocks a fixed 12% of the contract's value for index futures and 20% for stock futures. Copy says alongside it that a broker's margin changes with each contract and with volatility",
    status: 'confirmed',
  },
  F7: {
    text: 'Commodities trade by the unit at full value, without margin',
    status: 'confirmed',
  },
  F8: {
    text: 'MCX commodities include gold, silver and crude oil (and natural gas, copper, zinc and others)',
    status: 'confirmed',
  },
  F9: {
    text: 'Trading Academy: 17 lessons in 7 modules (Market foundations 3, Know your sectors 5, Reading the chart 2, Indicators 2, Orders & execution 2, Futures & options 2, Trader psychology 1). Every lesson has quiz questions you answer to move on (29 in all)',
    status: 'confirmed',
  },
  F10: {
    text: '20 badges, 4 of them for lessons and quizzes',
    status: 'confirmed',
  },
  F11: {
    text: 'Private rooms and public tournaments; referral bonuses and other credits are taken out of rankings',
    status: 'confirmed',
  },
  F12: {
    text: 'Referral: both people get bonus virtual money. Amounts are never printed',
    status: 'confirmed',
  },
  F13: {
    text: 'An order placed while its market is shut waits for the next session (a market order fills at the opening price). The app knows weekends and NSE holidays',
    status: 'confirmed',
  },
  F14: {
    text: 'Sign in with Google or email. Phone sign-in is switched on per admin, so it is never promised',
    status: 'confirmed',
  },
  F15: {
    text: 'Android only; an iPhone version is planned, with no date',
    status: 'verify',
    fallback: '"Android only for now." with the iPhone sentence dropped',
  },
  F16: {
    text: 'For adults: 18 or older, confirmed at sign-up',
    status: 'confirmed',
  },
  F17: {
    text: '"We never ask for your PAN, Aadhaar or bank details"',
    status: 'confirmed',
  },
  F18: {
    text: 'Search knows old and brand names: Zomato finds Eternal',
    status: 'confirmed',
  },
  F19: {
    text: 'A reminder at 3:10 pm on trading days, sent only to people holding intraday or F&O positions ("Market closing soon")',
    status: 'confirmed',
    fallback: '"Order and price notifications"',
  },
  F20: {
    text: 'Movers rank among tracked lists of 49 large, 47 mid and 40 small caps',
    // Set in ./fact-status.ts (the client MoversBoard reads it there).
    status: F20_STATUS,
    fallback: '"among the large caps we track"',
  },
  F21: {
    text: 'Market data attribution comes from the API payload and is never hard-coded',
    status: 'confirmed',
  },
  F22: { text: 'The app is free to download and use', status: 'confirmed' },
  F23: {
    text: 'An order fills in full once the price reaches it, with no queue of other orders ahead of it, so big orders fill more easily than they would for real',
    status: 'confirmed',
  },
  F24: {
    text: 'Watchlists: your own lists, shown on the home screen',
    status: 'confirmed',
  },
  F25: {
    text: 'Square off: a button on each position opens its closing order with the quantity filled in. Order history lists every order with its status and time',
    status: 'confirmed',
  },
  F26: {
    text: 'Search finds a company by its name or NSE ticker, and ranks shares above bonds and ETFs with similar names',
    status: 'confirmed',
  },
  F27: {
    text: 'Many lessons use real Indian companies as examples',
    status: 'confirmed',
    fallback: 'drop the sentence',
  },
  F28: {
    text: 'Order statuses: pending, filled, cancelled, rejected',
    status: 'confirmed',
  },
  F29: {
    text: 'At 3:20 pm IST, pending intraday orders are cancelled and open intraday positions are closed (shares, F&O and currency). MCX intraday is closed 15 minutes before the evening close',
    status: 'confirmed',
  },
  F30: {
    text: "A delivery order that hasn't filled stays open from session to session until it fills or you cancel it",
    status: 'confirmed',
  },
  F31: {
    text: "The app's glossary: 31 terms in five groups (Order basics, F&O, Greeks, Chart indicators, Money & corporate)",
    status: 'confirmed',
  },
  F32: {
    text: 'Charts: line or candlestick, from one day to five years',
    status: 'confirmed',
  },
  F33: {
    text: 'You sell only what you hold: short selling and option writing are switched off',
    status: 'confirmed',
  },
  F34: {
    text: 'Derivative positions still open at expiry are settled by the app',
    status: 'confirmed',
    fallback: 'drop the sentence',
  },
  F35: {
    text: "In the app, prices are live from the exchanges' feed while a market is open, and a shut market shows its last close",
    status: 'confirmed',
  },
  F36: {
    text: "Portfolio history: your account's value over 1 month, 3 months or 1 year",
    status: 'confirmed',
    fallback: 'drop the item',
  },
  F37: {
    text: 'Price alerts you set',
    status: 'confirmed',
    fallback: 'drop "price alerts you set"',
  },
  F38: {
    text: "The app's home screen opens on your portfolio, with shortcuts to stocks, F&O, indices, commodities, IPOs and the Academy, and your watchlists further down",
    status: 'confirmed',
  },
  F39: {
    text: 'Privacy requests in the app: a summary of your data, a correction, account deletion',
    status: 'confirmed',
  },
  // Spec §9.3 marks F40 "B2". The owner retired correction notes on 6 Nov
  // 2026 (stories show only their updated date and time), so F40 is no
  // longer true: 'verify' makes About's fifth principle use its fallback
  // (spec §9.5.3), "We fix mistakes" with the contact-form route.
  F40: {
    text: 'Corrections show on the story as dated notes under the byline (retired 6 Nov 2026)',
    status: 'verify',
    fallback: "About's fifth principle uses its fallback (§9.5.3)",
  },
  F41: {
    text: 'The current app is version 1.4',
    status: 'verify',
    fallback: '"the current Android app"',
  },
  F42: {
    text: 'The app never sends an order anywhere: it fills orders itself against live prices, and nothing reaches an exchange or a broker',
    status: 'confirmed',
  },
};

/** Whether a fact may be stated on the site yet. */
export function isConfirmed(id: FactId): boolean {
  return APP_FACTS[id].status === 'confirmed';
}

/**
 * A copy line that depends on facts: `text` when every fact is confirmed,
 * otherwise `fallback` (null drops the line). For example the F15 sentence
 * of "What it won't do":
 *   withFacts(['F15'], 'An iPhone version is planned, with no date yet.', null)
 */
export function withFacts<T>(ids: FactId[], text: T, fallback: T | null): T | null {
  return ids.every(isConfirmed) ? text : fallback;
}

/* ── The fact file on /features, "The account at a glance" (spec §9.5.2) ──
   Eight rows; the only place on that page that states the account's
   figures. Every row names its facts (spec §9.10 check 5). */

export type FactFileRow = { label: string; value: string; facts: FactId[] };

export const FACT_FILE_CAPTION = 'The account at a glance';

const ALL_FACT_FILE_ROWS: FactFileRow[] = [
  { label: 'Starting balance', value: '₹10,00,000 of virtual money', facts: ['F1'] },
  {
    label: 'What you can trade',
    value:
      'NSE and BSE shares; index and stock futures and options; MCX commodities such as gold, silver and crude oil',
    facts: ['F4', 'F8'],
  },
  {
    label: 'Order types',
    value: 'Market, limit, stop-loss, stop-loss limit and trailing stop',
    facts: ['F2'],
  },
  { label: 'Products', value: 'Intraday and delivery', facts: ['F3'] },
  {
    label: 'Charges',
    value:
      'STT, exchange and SEBI charges, stamp duty and GST, as a contract note lists them; brokerage on all but delivery share trades',
    facts: ['F5'],
  },
  {
    label: 'Futures margin',
    value:
      "A fixed 12% of the contract's value for index futures and 20% for stock futures",
    facts: ['F6'],
  },
  {
    label: 'Trading Academy',
    value: '17 lessons in 7 modules, with quiz questions in every lesson',
    facts: ['F9'],
  },
  { label: 'Price', value: 'Free', facts: ['F22'] },
];

/** The rows whose facts are all confirmed (today: all eight). */
export const FACT_FILE_ROWS: FactFileRow[] = ALL_FACT_FILE_ROWS.filter((row) =>
  row.facts.every(isConfirmed),
);

/* ── "What it won't do" (spec §9.4; canonical on /features and the home
   page). The five items keep this order on both pages. An item whose fact
   falls back keeps its lead phrase: under F15's fallback, item 4 is the
   lead phrase alone. ───────────────────────────────────────────────────── */

export type WontDoItem = {
  /** The bold run-in lead phrase (one line at 292 px; the compact form). */
  lead: string;
  /** The rest of the item, or null when its fact falls back. */
  body: string | null;
  facts: FactId[];
};

export const WONT_DO = {
  heading: "What it won't do",
  intro: 'StockVirtue is a simulator, and it has limits worth knowing before you start.',
  /** The compact form's link (home page, below 768 px). */
  moreLabel: 'Why these limits',
  moreHref: '/features#wont-do',
  items: [
    {
      lead: 'It never places a real order.',
      body: 'Nothing you do in the app reaches an exchange or a broker, and no real money moves.',
      facts: ['F42'],
    },
    {
      lead: 'Fills are simpler than on the exchange.',
      body: 'No orders queue ahead of yours, so big orders fill more easily than for real.',
      facts: ['F23'],
    },
    {
      lead: 'Commodities trade by the unit.',
      body: 'Many MCX lots cost more than your ₹10 lakh, so you buy single units at full price.',
      facts: ['F7', 'F1'],
    },
    {
      lead: "It's on Android only for now.",
      body: withFacts(['F15'], 'An iPhone version is planned, with no date yet.', null),
      facts: ['F15'],
    },
    {
      lead: "It doesn't tell you what to buy.",
      body: 'Nothing in the app or on this site is investment advice.',
      facts: [],
    },
  ] satisfies WontDoItem[],
};

/* ── The Trading Academy panel (spec §9.6.1; Learn and the news front's
   Learn band). It describes the app only; it never refers to a story or a
   stock, and it carries no prices. ─────────────────────────────────────── */

export const ACADEMY = {
  label: 'From StockVirtue',
  heading: 'In the app: the Trading Academy',
  // F9
  body: 'Seventeen short lessons in seven modules, with quiz questions to answer as you go. The modules cover market foundations, sectors, reading the chart, indicators, orders, F&O and trader psychology.',
  link: 'Get the app',
  facts: ['F9'] as FactId[],
};

/* ── The home page's Learning band: the module list (spec §9.5.1, "Module
   list"; shown from 768 px, never on phones). Seven rows in the app's
   order: `label` is the module (set in `title`), `value` its lesson count
   (set in `meta`); the counts add up to F9's 17 lessons. The names are the
   spec's ("Orders and execution", "Futures and options"; the app writes
   "&"). Code, not content (addendum §1.4): the list changes only with the
   app's Academy, recounted with F9 at each app release. ─────────────────── */

const ALL_ACADEMY_MODULES: FactFileRow[] = [
  { label: 'Market foundations', value: '3 lessons', facts: ['F9'] },
  { label: 'Know your sectors', value: '5 lessons', facts: ['F9'] },
  { label: 'Reading the chart', value: '2 lessons', facts: ['F9'] },
  { label: 'Indicators', value: '2 lessons', facts: ['F9'] },
  { label: 'Orders and execution', value: '2 lessons', facts: ['F9'] },
  { label: 'Futures and options', value: '2 lessons', facts: ['F9'] },
  { label: 'Trader psychology', value: '1 lesson', facts: ['F9'] },
];

/** The module list: all seven rows while F9 is confirmed, none otherwise. */
export const ACADEMY_MODULES: FactFileRow[] = ALL_ACADEMY_MODULES.filter((row) =>
  row.facts.every(isConfirmed),
);

/* ── The fact file on /download (spec §9.5.5; no caption). The page's rows
   are, in order: Price, Needs, Size, Sign in, Age, iPhone. Needs ("Android
   {n} or later") and Size ("{n} MB") are the two Play-listing rows: owner
   inputs from the download content (`play.minAndroid`, `play.sizeMb`,
   addendum §3.6), each left out while empty, and the view puts them right
   after Price. The four fact rows below are code, not content (addendum
   §1.4). As in FACT_FILE_ROWS, a row whose fact isn't confirmed is left
   out: today that is iPhone, because F15 is 'verify' and its fallback drops
   the iPhone sentence (spec §9.3). ────────────────────────────────────── */

const ALL_DOWNLOAD_FACT_ROWS: FactFileRow[] = [
  { label: 'Price', value: 'Free', facts: ['F22'] },
  { label: 'Sign in', value: 'Google or email', facts: ['F14'] },
  { label: 'Age', value: '18 or older', facts: ['F16'] },
  { label: 'iPhone', value: 'Not yet', facts: ['F15'] },
];

/** The rows whose facts are all confirmed (today: Price, Sign in and Age). */
export const DOWNLOAD_FACT_ROWS: FactFileRow[] = ALL_DOWNLOAD_FACT_ROWS.filter((row) =>
  row.facts.every(isConfirmed),
);
