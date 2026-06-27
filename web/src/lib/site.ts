/**
 * Static brand + navigation config for the marketing site. Anything an admin
 * should be able to change at runtime lives in SiteSettings (see settings.ts);
 * this file holds compile-time constants and the canonical content model.
 */

export const SITE = {
  name: 'StockVirtue',
  tagline: 'Virtual trading. Real skills.',
  description:
    'StockVirtue is a virtual stock-market simulator for India. Practise trading NSE & BSE stocks, F&O, and indices with ₹ virtual money — live prices, real order types, portfolios, competitions and a built-in trading academy. Zero financial risk.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://stockvirtue.com',
  playUrl:
    process.env.NEXT_PUBLIC_PLAY_URL ||
    'https://play.google.com/store/apps/details?id=com.vamigo.stockvirtue',
  packageId: 'com.vamigo.stockvirtue',
  email: 'support@stockvirtue.com',
  company: 'Vamigo Media (OPC) Pvt. Ltd.',
  twitter: '@stockvirtue',
} as const;

export const NAV: { href: string; label: string }[] = [
  { href: '/features', label: 'Features' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
  { href: '/download', label: 'Download' },
];

export const FOOTER_LINKS: {
  title: string;
  links: { href: string; label: string }[];
}[] = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
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
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/disclaimer', label: 'Risk Disclaimer' },
    ],
  },
];

/** The feature catalogue rendered across the home + features pages. */
export const FEATURES = [
  {
    icon: 'chart',
    title: 'Live market data',
    body: 'Real-time NSE & BSE prices, interactive charts and full market depth, so every practice trade reflects the real market.',
  },
  {
    icon: 'trade',
    title: 'Real order types',
    body: 'Market, Limit, Stop-Loss, SL-Limit and Trailing-Stop orders — in Intraday (MIS) and Delivery (CNC), with realistic brokerage & taxes.',
  },
  {
    icon: 'fno',
    title: 'Futures & Options',
    body: 'Trade index and stock F&O in proper lot sizes, explore option chains, and learn derivatives the safe way.',
  },
  {
    icon: 'portfolio',
    title: 'Portfolio & P&L',
    body: 'Track holdings, invested value, realised and unrealised P&L in real time, and square off positions in one tap.',
  },
  {
    icon: 'clock',
    title: 'After-market orders',
    body: 'Place orders when the market is closed — they queue and execute at the next open. Holiday-aware, just like the real exchange.',
  },
  {
    icon: 'trophy',
    title: 'Compete & climb',
    body: 'Join rooms and tournaments, race friends on live leaderboards, and earn achievement badges as you improve.',
  },
  {
    icon: 'book',
    title: 'Trading Academy',
    body: 'Structured lessons, quizzes and a market glossary take you from the basics to confident, informed trading.',
  },
  {
    icon: 'shield',
    title: 'Zero financial risk',
    body: 'Every rupee is virtual. Make mistakes, learn fast, and build real skill without ever risking real money.',
  },
] as const;

export const STEPS = [
  {
    title: 'Create your account',
    body: 'Sign up in seconds with email, Google or phone, and get a clean virtual wallet to trade with.',
  },
  {
    title: 'Explore the markets',
    body: 'Search stocks, watch indices, open charts and option chains, and build your watchlist.',
  },
  {
    title: 'Place your trades',
    body: 'Buy and sell with real order types, manage your portfolio, and review your P&L.',
  },
  {
    title: 'Learn & compete',
    body: 'Complete academy lessons, earn badges, and climb tournament leaderboards.',
  },
] as const;

export const FAQS = [
  {
    q: 'Is StockVirtue real trading?',
    a: 'No. StockVirtue is a simulator. All trades use virtual money — you never deposit, withdraw, or risk real funds. It is built for learning and practice.',
  },
  {
    q: 'Does it use real market prices?',
    a: 'Yes. Prices, charts and market depth reflect live NSE & BSE data during market hours, so your practice mirrors the real market.',
  },
  {
    q: 'Is StockVirtue free?',
    a: 'Yes, StockVirtue is free to download and use. You start with a virtual wallet and can trade right away.',
  },
  {
    q: 'Is this investment advice?',
    a: 'No. Nothing in StockVirtue is financial, investment, or trading advice. It is an educational tool. Please consult a SEBI-registered advisor before investing real money.',
  },
  {
    q: 'Which markets and instruments are supported?',
    a: 'Indian equities on NSE & BSE, major indices (Nifty 50, Sensex, Bank Nifty and more), and Futures & Options.',
  },
  {
    q: 'Which platforms is it available on?',
    a: 'StockVirtue is available on Android via the Google Play Store. More platforms are planned.',
  },
  {
    q: 'How do I get support?',
    a: 'Use the Contact page on this site or email our support team. We read every message.',
  },
] as const;
