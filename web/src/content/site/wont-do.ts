/**
 * The built-in "What it won't do" (W7 addendum §3.9; spec §9.4, word for
 * word): the shared block on the home page (compact below 768 px) and on
 * /features (full, id="wont-do"). Until someone publishes the `wont-do`
 * item, this is what both pages render, so it equals today's `WONT_DO`
 * (src/content/app.ts) exactly: same heading, intro, leads, bodies, order
 * and facts. Item 4's sentence is stored un-gated with F15 as data;
 * `withFacts` drops it while F15 is unconfirmed, leaving the lead alone, as
 * today.
 *
 * The compact form's link target (/features#wont-do) is fixed in code.
 */

import type { WontDoContent } from './types';

export const WONT_DO_DEFAULT: WontDoContent = {
  heading: "What it won't do",
  intro: 'StockVirtue is a simulator, and it has limits worth knowing before you start.',
  items: [
    {
      id: 'no-real-orders',
      lead: 'It never places a real order.',
      body: {
        value: 'Nothing you do in the app reaches an exchange or a broker, and no real money moves.',
        facts: ['F42'],
        fallback: null,
      },
    },
    {
      id: 'simpler-fills',
      lead: 'Fills are simpler than on the exchange.',
      body: {
        value: 'No orders queue ahead of yours, so big orders fill more easily than for real.',
        facts: ['F23'],
        fallback: null,
      },
    },
    {
      id: 'commodities-by-unit',
      lead: 'Commodities trade by the unit.',
      body: {
        value: 'Many MCX lots cost more than your ₹10 lakh, so you buy single units at full price.',
        facts: ['F7', 'F1'],
        fallback: null,
      },
    },
    {
      id: 'android-only',
      lead: "It's on Android only for now.",
      body: {
        value: 'An iPhone version is planned, with no date yet.',
        facts: ['F15'],
        fallback: null,
      },
    },
    {
      id: 'no-advice',
      lead: "It doesn't tell you what to buy.",
      body: {
        value: 'Nothing in the app or on this site is investment advice.',
        facts: [],
        fallback: null,
      },
    },
  ],
  moreLabel: 'Why these limits',
};
