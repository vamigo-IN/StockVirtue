/**
 * Static brand + navigation config for the marketing site. Anything an admin
 * should be able to change at runtime lives in SiteSettings (see settings.ts);
 * this file holds compile-time constants and the canonical content model.
 */

export const SITE = {
  name: 'StockVirtue',
  tagline: 'Virtual trading. Real skills.',
  description:
    'Practise the Indian stock market with virtual money. Live NSE & BSE prices, real order types, F&O and indices, and not a rupee of real risk.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://stockvirtue.com',
  playUrl:
    process.env.NEXT_PUBLIC_PLAY_URL ||
    'https://play.google.com/store/apps/details?id=com.vamigo.stockvirtue',
  packageId: 'com.vamigo.stockvirtue',
  email: 'support@stockvirtue.com',
  company: 'Vamigo Media (OPC) Pvt. Ltd.',
  twitter: '@stockvirtue',
} as const;

/**
 * `fullLoad` links leave the marketing pages for another area of the site
 * (the news site) with a normal page load, so the two areas' stylesheets are
 * never on one page.
 */
export interface SiteLink {
  href: string;
  label: string;
  fullLoad?: boolean;
}

export const NAV: SiteLink[] = [
  { href: '/features', label: 'Features' },
  { href: '/news', label: 'News', fullLoad: true },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
  { href: '/download', label: 'Download' },
];

export const FOOTER_LINKS: {
  title: string;
  links: SiteLink[];
}[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/news', label: 'Market news', fullLoad: true },
      { href: '/download', label: 'Download' },
      { href: '/faq', label: 'FAQ' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About us' },
      { href: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms & Conditions' },
      { href: '/privacy', label: 'Privacy notice' },
      { href: '/privacy/requests', label: 'Privacy requests & grievances' },
      { href: '/disclaimer', label: 'Risk Disclaimer' },
    ],
  },
];

/** The feature catalogue rendered across the home + features pages. */
export const FEATURES = [
  {
    icon: 'chart',
    title: 'Live market data',
    body: "Live prices from the NSE and BSE, with the same charts and order-book depth a real desk watches. Your practice moves tick for tick with the actual market.",
  },
  {
    icon: 'trade',
    title: 'Every order type',
    body: "Market, limit, stop-loss, SL-limit and trailing stops, in both intraday and delivery. Brokerage and taxes are baked in, so your P&L reads like the real thing.",
  },
  {
    icon: 'fno',
    title: 'Futures & Options',
    body: "Trade index and stock F&O in the right lot sizes and read the full option chain. Get comfortable with derivatives before any real money is on the line.",
  },
  {
    icon: 'portfolio',
    title: 'Portfolio & P&L',
    body: "Your holdings, what you paid, and what they're worth right now, all in one place. P&L updates live, and you can square off a position in a single tap.",
  },
  {
    icon: 'clock',
    title: 'After-market orders',
    body: "Placed an order after hours? It waits in the queue and fills when the market reopens. It knows the weekends and trading holidays, too.",
  },
  {
    icon: 'trophy',
    title: 'Compete with friends',
    body: "Join rooms and tournaments, go head-to-head on a live leaderboard, and pick up badges as your trading gets sharper.",
  },
  {
    icon: 'book',
    title: 'Learn as you go',
    body: "Short lessons, quick quizzes, and a glossary that explains the jargon in plain English. Start from scratch and move at your own pace.",
  },
  {
    icon: 'shield',
    title: 'Only play money',
    body: "Every rupee is virtual. Blow up a trade, work out what went wrong, and reset. The worst you can lose here is a bad habit.",
  },
] as const;

export const STEPS = [
  {
    title: 'Sign up',
    body: "Use email, Google, or your phone number. You'll land with a virtual wallet that's ready to trade.",
  },
  {
    title: 'Find your trade',
    body: 'Search a stock, scan the indices, open a chart or an option chain, and pin what you care about to a watchlist.',
  },
  {
    title: 'Place it',
    body: 'Buy or sell with proper order types, then watch your portfolio and P&L move in real time.',
  },
  {
    title: 'Keep improving',
    body: 'Work through the academy, earn a few badges, and see how you stack up on the tournament tables.',
  },
] as const;

export const FAQS = [
  {
    q: 'Is this real trading?',
    a: "No, it's a simulator. Every trade uses virtual money, so you never deposit, withdraw, or lose anything real. It's here for you to learn and practise.",
  },
  {
    q: 'Are the prices real?',
    a: "Yes. During market hours you see live NSE and BSE prices, charts and depth, so your practice lines up with what's actually happening.",
  },
  {
    q: 'Is it free?',
    a: "Completely. Install it, pick up your virtual wallet, and start trading. There's nothing to pay and nothing to deposit.",
  },
  {
    q: 'Is any of this investment advice?',
    a: 'No. Nothing in the app is advice or a recommendation to buy or sell anything. It is a learning tool. For real investing, speak to a SEBI-registered adviser.',
  },
  {
    q: 'What can I trade?',
    a: 'Indian shares on the NSE and BSE, the major indices like Nifty 50, Sensex and Bank Nifty, and Futures & Options.',
  },
  {
    q: 'Where can I get it?',
    a: 'On Android, through the Google Play Store. Support for more platforms is on the way.',
  },
  {
    q: 'How do I reach you?',
    a: 'Use the Contact page or email us. A real person reads every message, and we try to reply quickly.',
  },
] as const;
