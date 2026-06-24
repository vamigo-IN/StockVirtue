/// Canonical id universe for the Trading Academy. The lesson *content* lives
/// in the mobile app (mobile/lib/features/academy/lesson_definitions.dart);
/// the server only needs the set of ids to (a) validate completion calls and
/// (b) know when a user has finished everything for the "Academy graduate"
/// badge. Keep this in sync when lessons are added on the client.
export const LESSON_IDS: readonly string[] = [
  // patterns
  'candles',
  'sr',
  // indicators
  'rsi',
  'macd',
  // psychology
  'mindset',
  // foundations
  'what_is_stock',
  'exchanges_indices',
  'market_cap',
  // sectors
  'sector_it',
  'sector_banking',
  'sector_fmcg',
  'sector_auto',
  'sector_energy',
  // orders & execution
  'order_types',
  'product_types',
  // derivatives
  'futures_basics',
  'options_basics',
];

export const TOTAL_LESSONS = LESSON_IDS.length;

export function isLessonId(id: string): boolean {
  return LESSON_IDS.includes(id);
}
