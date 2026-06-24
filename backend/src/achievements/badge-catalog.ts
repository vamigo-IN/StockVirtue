/// Server-side badge catalog. The *visual* metadata (icon, colour) lives on
/// the client in mobile/lib/features/achievements/badge_definitions.dart; the
/// ids and unlock rules are mirrored here so the server is the authority on
/// what's earned. Every id here MUST exist in the client catalog (and vice
/// versa) — the API returns ids + unlocked flags, the client renders them.

export type BadgeCategory = 'TRADING' | 'MILESTONE' | 'SOCIAL' | 'LEARNING';

/// Authoritative metrics computed from the database, fed to badge predicates.
export interface UserStats {
  /** Lifetime count of FILLED orders. */
  filledCount: number;
  /** Lifetime realized P&L in paise (sum of Position.realizedPnLP). */
  realizedPnLP: bigint;
  /** Number of users who signed up with this user's referral code. */
  referralCount: number;
  hasIntraday: boolean;
  hasShort: boolean;
  hasFno: boolean;
  hasOption: boolean;
  /** Distinct sectors across currently-open positions. */
  distinctSectors: number;
  /** Academy lessons completed. */
  lessonsCompleted: number;
  /** Total lessons available (for the "graduate" badge). */
  totalLessons: number;
  /** True if the user has ever passed a lesson quiz with a perfect score. */
  hasPerfectQuiz: boolean;
}

export interface BadgeDef {
  id: string;
  name: string;
  hint: string;
  category: BadgeCategory;
  test: (s: UserStats) => boolean;
}

// Profit thresholds in paise (₹10k and ₹1L). Realized P&L is stored in paise.
const PROFIT_10K_P = 1_000_000n;
const PROFIT_100K_P = 10_000_000n;

export const BADGES: BadgeDef[] = [
  // ── Trading milestones ───────────────────────────────────────────
  {
    id: 'first_trade',
    name: 'First trade',
    hint: 'Place your first filled order.',
    category: 'TRADING',
    test: (s) => s.filledCount >= 1,
  },
  {
    id: 'five_trades',
    name: 'Warming up',
    hint: 'Place 5 filled orders.',
    category: 'TRADING',
    test: (s) => s.filledCount >= 5,
  },
  {
    id: 'twenty_trades',
    name: 'Active trader',
    hint: 'Place 20 filled orders.',
    category: 'TRADING',
    test: (s) => s.filledCount >= 20,
  },
  {
    id: 'fifty_trades',
    name: 'Veteran',
    hint: 'Place 50 filled orders.',
    category: 'TRADING',
    test: (s) => s.filledCount >= 50,
  },
  // ── P&L ──────────────────────────────────────────────────────────
  {
    id: 'first_profit',
    name: 'First profit',
    hint: 'Close any position with realized profit.',
    category: 'MILESTONE',
    test: (s) => s.realizedPnLP > 0n,
  },
  {
    id: 'profit_10k',
    name: 'Five-figure run',
    hint: 'Realize ₹10,000 in lifetime profit.',
    category: 'MILESTONE',
    test: (s) => s.realizedPnLP >= PROFIT_10K_P,
  },
  {
    id: 'profit_100k',
    name: 'Six-figure trader',
    hint: 'Realize ₹1,00,000 in lifetime profit.',
    category: 'MILESTONE',
    test: (s) => s.realizedPnLP >= PROFIT_100K_P,
  },
  // ── Instrument variety ───────────────────────────────────────────
  {
    id: 'fno_explorer',
    name: 'F&O explorer',
    hint: 'Place your first F&O order.',
    category: 'TRADING',
    test: (s) => s.hasFno,
  },
  {
    id: 'options_trader',
    name: 'Options trader',
    hint: 'Place an order on a call or put option.',
    category: 'TRADING',
    test: (s) => s.hasOption,
  },
  {
    id: 'short_seller',
    name: 'Short seller',
    hint: 'Open a short position.',
    category: 'TRADING',
    test: (s) => s.hasShort,
  },
  {
    id: 'intraday_jockey',
    name: 'Intraday jockey',
    hint: 'Place an MIS (intraday) order.',
    category: 'TRADING',
    test: (s) => s.hasIntraday,
  },
  // ── Diversification ──────────────────────────────────────────────
  {
    id: 'diversified_3',
    name: 'Diversifier',
    hint: 'Hold positions in 3 different sectors.',
    category: 'MILESTONE',
    test: (s) => s.distinctSectors >= 3,
  },
  {
    id: 'diversified_5',
    name: 'Sector spread',
    hint: 'Hold positions in 5 different sectors.',
    category: 'MILESTONE',
    test: (s) => s.distinctSectors >= 5,
  },
  // ── Social / referrals ───────────────────────────────────────────
  {
    id: 'friend_invited',
    name: 'Friend invited',
    hint: 'Refer your first friend who signs up with your code.',
    category: 'SOCIAL',
    test: (s) => s.referralCount >= 1,
  },
  {
    id: 'power_inviter',
    name: 'Power inviter',
    hint: 'Refer 5 friends who sign up with your code.',
    category: 'SOCIAL',
    test: (s) => s.referralCount >= 5,
  },
  {
    id: 'influencer',
    name: 'Influencer',
    hint: 'Refer 25 friends who sign up with your code.',
    category: 'SOCIAL',
    test: (s) => s.referralCount >= 25,
  },
  // ── Learning ─────────────────────────────────────────────────────
  {
    id: 'first_lesson',
    name: 'Curious mind',
    hint: 'Finish your first Academy lesson.',
    category: 'LEARNING',
    test: (s) => s.lessonsCompleted >= 1,
  },
  {
    id: 'knowledge_seeker',
    name: 'Knowledge seeker',
    hint: 'Finish 5 Academy lessons.',
    category: 'LEARNING',
    test: (s) => s.lessonsCompleted >= 5,
  },
  {
    id: 'quiz_ace',
    name: 'Quiz ace',
    hint: 'Score a perfect lesson quiz.',
    category: 'LEARNING',
    test: (s) => s.hasPerfectQuiz,
  },
  {
    id: 'academy_graduate',
    name: 'Academy graduate',
    hint: 'Finish every lesson in the Academy.',
    category: 'LEARNING',
    test: (s) => s.totalLessons > 0 && s.lessonsCompleted >= s.totalLessons,
  },
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(
  BADGES.map((b) => [b.id, b]),
);
