import type { DownloadContent, InlineText } from './types';

/**
 * The /download page's built-in content (W7 addendum §3.6): spec §9.5.5 word
 * for word, each fact-bearing slot with its fact ids. getPageContent merges
 * the published content over it. Plain data.
 *
 * Code, not content: the fact rows (DOWNLOAD_FACT_ROWS in content/app.ts),
 * the badge, the trademark line, the QR and its caption, and the screen
 * caption template. "Before you install" shows the FAQ's own answers, by id.
 * The two Play-listing rows are owner inputs, empty (left out) until
 * supplied.
 */

const text = (t: string): InlineText => ({ type: 'text', text: t });

export const DOWNLOAD_DEFAULT: DownloadContent = {
  seo: {
    title: 'Download the app',
    description:
      'Get StockVirtue free on Android. Sign in with Google or your email and start with ₹10 lakh of virtual money.',
  },
  head: {
    title: 'StockVirtue for Android',
    lead: {
      value: 'Free on Google Play. Your ₹10 lakh of virtual money is there as soon as you sign in.',
      facts: ['F22', 'F1'],
      fallback: null,
    },
  },
  play: { minAndroid: '', sizeMb: '' },
  panelScreen: null,
  firstFive: {
    title: 'Your first five minutes',
    items: [
      {
        id: 'minute-1',
        lead: 'Minute 1: sign in.',
        body: {
          value: "Choose Google or your email address, and confirm that you're 18 or older.",
          facts: ['F14', 'F16'],
          fallback: null,
        },
        screen: null,
        screenWhat: 'Sign-in',
      },
      {
        id: 'minute-2',
        lead: 'Minute 2: look around.',
        body: {
          value: 'Your portfolio tops the home screen, with shortcuts to F&O, commodities and the Academy.',
          facts: ['F38'],
          fallback: null,
        },
        screen: null,
        screenWhat: 'The home screen',
      },
      {
        id: 'minute-5',
        lead: 'Minute 5: your first order.',
        body: {
          value: 'Find a company you know and place a small limit order. For delivery, it stays open until it fills.',
          facts: ['F30'],
          fallback: null,
        },
        screen: null,
        screenWhat: 'The order ticket',
      },
    ],
  },
  beforeInstall: {
    title: 'Before you install',
    faqIds: ['is-it-free', 'do-i-need-a-demat-account-or-kyc', 'where-can-i-get-it'],
  },
  iphoneNote: {
    value: [
      text("To hear when there's an iPhone version, "),
      { type: 'text', text: 'write to us', marks: [{ type: 'link', attrs: { href: '/contact' } }] },
      text(" and put “iPhone” in What it's about."),
    ],
    facts: ['F15'],
    fallback: null,
  },
};
