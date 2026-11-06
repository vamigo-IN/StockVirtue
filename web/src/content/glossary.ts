/**
 * The Learn glossary (spec §4.9, §5.10.4, §9.6.3; F31): the app's own
 * glossary, copied as data from
 * mobile/lib/features/glossary/screens/glossary_screen.dart (`_sections`,
 * app 1.4.0, recounted 5 Nov 2026: 31 terms in five groups), in the app's
 * group order and term order. The web never imports app code.
 *
 * Edited to spec §9.2 / §9.6.3 without changing what a definition means:
 * sentence case, Indian English, the site's spellings ("stop-loss"), term
 * names without dashes ("CNC (cash and carry)"), no notes about the app's
 * own screens, no group blurbs, no product claims (definitions are general
 * market definitions; the app's sentences about itself are dropped), no
 * prices and no example numbers that look like quotes. Each definition was
 * checked against the order engine (backend/src/orders): the app's
 * trailing-stop line ("up for shorts, down for longs") reads backwards
 * against orders.service.ts, where a sell stop's trigger rises with the
 * price, so the web says what the engine does. Every change is listed in
 * W5's handoff report.
 *
 * `term` is the name; `acronym` (optional) is the app's abbreviation or
 * symbol. Where the name doesn't already start with it, the page shows it
 * in brackets after the name ("Stop-loss (SL-M)"). Each `dt` id is the slug
 * of the name without its bracket (glossaryId), so stories can link to
 * /news/education#stop-loss.
 */
export type GlossaryTerm = { term: string; definition: string; acronym?: string };
export type GlossaryGroup = { heading: string; terms: GlossaryTerm[] };

export const GLOSSARY: GlossaryGroup[] = [
  {
    heading: 'Order basics',
    terms: [
      {
        term: 'Market order',
        definition:
          'Buys or sells straight away at the best price available. It fills fast, but the price isn’t guaranteed.',
      },
      {
        term: 'Limit order',
        definition:
          'Waits until the market reaches the price you set, then fills at that price or better.',
      },
      {
        term: 'Stop-loss',
        acronym: 'SL-M',
        definition:
          'A trigger price that fires a market order when the price crosses it. It is meant to cap a loss, and the fill can slip past the trigger.',
      },
      {
        term: 'Stop-loss limit',
        acronym: 'SL-L',
        definition:
          'Like a stop-loss, but crossing the trigger places a limit order instead, so the fill price is bounded, at the cost of perhaps not filling at all.',
      },
      {
        // orders.service.ts updateTrailingTrigger: a SELL trailing stop's
        // trigger ratchets up, a BUY trailing stop's ratchets down.
        term: 'Trailing stop',
        definition:
          'A stop-loss whose trigger follows the price as it moves your way: it rises with the price for a sell stop that protects a long position, and falls with it for a buy stop that protects a short one. It never moves back, so it locks in gains as the trend continues.',
      },
      {
        term: 'CNC (cash and carry)',
        acronym: 'CNC',
        definition:
          'The delivery product. Shares you buy are held until you sell them, with no automatic square-off. STT is charged on both the buy and the sell.',
      },
      {
        term: 'MIS (margin intraday square-off)',
        acronym: 'MIS',
        definition:
          'The intraday product. A position has to be closed the same day: one still open near the close is squared off automatically, so it can’t be held overnight. STT is lower than on a delivery trade.',
      },
      {
        term: 'GTC (good till cancelled)',
        acronym: 'GTC',
        definition:
          'A pending delivery order, such as a limit, stop-loss, stop-loss limit or trailing stop order, that stays open past the day’s close until it triggers or you cancel it.',
      },
    ],
  },
  {
    heading: 'F&O',
    terms: [
      {
        term: 'Strike price',
        definition:
          'The price at which an option’s holder can buy (a call) or sell (a put) the underlying. Strikes are listed in fixed steps around the current price.',
      },
      {
        term: 'ATM (at the money)',
        acronym: 'ATM',
        definition: 'The strike closest to the underlying’s current price.',
      },
      {
        term: 'ITM (in the money)',
        acronym: 'ITM',
        definition:
          'A call with its strike below the current price, or a put with its strike above it: already worth something if exercised now.',
      },
      {
        term: 'OTM (out of the money)',
        acronym: 'OTM',
        definition:
          'A call with its strike above the current price, or a put with its strike below it: worth nothing if exercised now, so its premium is all time value and volatility.',
      },
      {
        term: 'Open interest',
        acronym: 'OI',
        definition:
          'The number of contracts still open for a strike. Rising open interest with a falling price points to a short build-up; rising open interest with a rising price points to a long build-up.',
      },
      {
        term: 'Implied volatility',
        acronym: 'IV',
        definition:
          'The volatility the market is pricing into an option, worked out backwards from the option’s price with a pricing model such as Black-Scholes. Higher implied volatility means higher premiums.',
      },
      {
        term: 'Put-call ratio',
        acronym: 'PCR',
        definition:
          'The open interest in puts divided by the open interest in calls for an underlying. Above 1 it leans bearish, with more puts open; below 1 it leans bullish.',
      },
      {
        term: 'Lot size',
        definition:
          'The smallest quantity a futures or options contract trades in. The exchange sets it for each underlying and revises it from time to time, and an order’s quantity must be a multiple of it.',
      },
      {
        // A broker's margin only: the app's own fixed rates are Diagram 3's
        // caption on the same page (spec §5.10.4, §9.6.3).
        term: 'Margin (SPAN + exposure)',
        definition:
          'The collateral a broker blocks for an open futures position or a sold option: the SPAN margin from the exchange’s risk model, plus an exposure margin on top. It changes with each contract and with volatility.',
      },
    ],
  },
  {
    heading: 'Greeks',
    terms: [
      {
        term: 'Delta',
        acronym: 'Δ',
        definition:
          'How much an option’s price moves for a ₹1 move in the underlying. A call’s delta runs from 0 to 1, and a put’s from −1 to 0.',
      },
      {
        term: 'Gamma',
        acronym: 'Γ',
        definition:
          'How fast delta itself changes as the underlying moves. It is highest for at-the-money options near expiry and close to zero for options deep in or out of the money.',
      },
      {
        term: 'Theta',
        acronym: 'Θ',
        definition:
          'Time decay: how much an option’s price falls with each calendar day. It is almost always negative for option buyers, as the premium wears away towards expiry.',
      },
      {
        term: 'Vega',
        acronym: 'V',
        definition:
          'How much an option’s price changes, in rupees, for a 1% move in implied volatility. It is always positive for buyers and negative for sellers.',
      },
      {
        term: 'Rho',
        acronym: 'ρ',
        definition:
          'How much an option’s price changes, in rupees, for a 1% move in interest rates. The effect is small for short-dated Indian options.',
      },
    ],
  },
  {
    heading: 'Chart indicators',
    terms: [
      {
        term: 'SMA (simple moving average)',
        acronym: 'SMA',
        definition:
          'The plain average of the last N closing prices. It reacts slowly and draws a smooth line of the trend’s direction; a 20-period average is the usual default.',
      },
      {
        term: 'EMA (exponential moving average)',
        acronym: 'EMA',
        definition:
          'A weighted average that counts recent prices for more, so it reacts faster than an SMA of the same period.',
      },
      {
        term: 'Bollinger bands',
        definition:
          'A middle line, the 20-period SMA, with bands two standard deviations above and below it. Wide bands mean high volatility; a squeeze, when the bands narrow, shows consolidation and often comes before a breakout.',
      },
    ],
  },
  {
    heading: 'Money & corporate',
    terms: [
      {
        term: 'Lakh',
        acronym: 'L',
        definition: '1,00,000: one followed by five zeros, in the Indian way of grouping digits.',
      },
      {
        term: 'Crore',
        acronym: 'Cr',
        definition: '1,00,00,000: 100 lakh, or 10 million.',
      },
      {
        term: 'P/E (price to earnings)',
        acronym: 'P/E',
        definition:
          'The share price divided by the earnings per share over the last year. A high P/E means the market expects strong growth; a low one can mean a mature, undervalued or declining business.',
      },
      {
        term: 'EPS (earnings per share)',
        acronym: 'EPS',
        definition:
          'A company’s net profit over the last year divided by its number of shares. It is the bottom half of the P/E.',
      },
      {
        term: 'STT (securities transaction tax)',
        acronym: 'STT',
        definition:
          'A tax on trades in listed securities, charged on both the buy and the sell of a delivery trade and on the sell of an intraday trade.',
      },
      {
        term: 'GST (goods and services tax)',
        acronym: 'GST',
        definition:
          'Charged at 18% on brokerage, exchange transaction charges and SEBI charges.',
      },
    ],
  },
];

/** The term as the page shows it: "Stop-loss (SL-M)", "CNC (cash and carry)". */
export function glossaryLabel(t: GlossaryTerm): string {
  if (!t.acronym || t.term === t.acronym || t.term.startsWith(`${t.acronym} (`)) return t.term;
  return `${t.term} (${t.acronym})`;
}

/**
 * The `dt` id: the slug of the term's name without its bracket
 * ("stop-loss", "stop-loss-limit", "cnc", "delta", "p-e").
 */
export function glossaryId(t: GlossaryTerm): string {
  return t.term
    .replace(/\s*\(.*\)\s*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
