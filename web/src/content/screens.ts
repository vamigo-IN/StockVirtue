/**
 * The app screenshots the site may show (spec §9.9, §6.5, §4.11). They are
 * an owner input, NOT a launch gate (owner decision 6): every entry is null
 * until the owner supplies fresh captures, and every page has a complete
 * text-only layout for a null screen. Never a placeholder image.
 *
 * When the captures arrive (plan M0.S):
 * - app 1.4.x at 1080 × 2400, from a STAFF DEMO account (never a real
 *   user's data, DPDP), dark theme for the home stage and the gate-off
 *   hero, light theme for the site pages;
 * - each screen is two WebP files in public/screens/: `{name}-1080.webp`
 *   (put that path in `src`) and `{name}-540.webp` next to it; DeviceFrame
 *   builds the srcset from the pair;
 * - `captured` is the capture date (YYYY-MM-DD), which every caption states;
 * - `alt` says what the screen shows;
 * - `callouts` (home stage only) are numbered points in % of the screen.
 */

/** The ten screens of spec §9.9. */
export type ScreenId =
  | 'home' // the home screen
  | 'sign-in' // sign-in
  | 'search' // search results for "HDFC"
  | 'stock' // a stock page with its chart
  | 'order-ticket' // the order ticket with a limit order
  | 'pnl' // the P&L after charges
  | 'portfolio' // the portfolio
  | 'option-chain' // the option chain
  | 'lesson' // a lesson
  | 'room'; // a room leaderboard

export type Screen = {
  /** The 1080w WebP, e.g. "/screens/home-1080.webp". */
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Capture date, YYYY-MM-DD. */
  captured: string;
  theme: 'light' | 'dark';
  callouts?: { x: number; y: number; label: string }[];
  /**
   * A ready srcset (W7 addendum §11.2): screens picked in the admin come
   * from the media library with their own sizes, which the API serves as
   * `srcSet`. DeviceFrame uses it when present; otherwise it builds one from
   * the `-1080.webp` / `-540.webp` pair.
   */
  srcSet?: string;
};

export const SCREENS: Record<ScreenId, Screen | null> = {
  home: null,
  'sign-in': null,
  search: null,
  stock: null,
  'order-ticket': null,
  pnl: null,
  portfolio: null,
  'option-chain': null,
  lesson: null,
  room: null,
};
