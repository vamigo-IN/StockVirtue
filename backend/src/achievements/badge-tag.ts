/// A short, named rank ("badge tag") derived from how many achievements a
/// user has unlocked. The catalog includes four LEARNING badges tied to the
/// Academy (first lesson, 5 lessons, perfect quiz, full graduation), so
/// completing the Academy directly raises this rank — i.e. the tag reflects
/// both trading achievements AND academy progress, as one honorific shown next
/// to a user's name in rooms and on the leaderboard.
///
/// Thresholds are calibrated against the ~20-badge catalog in badge-catalog.ts.
export function traderTag(unlockedBadges: number): string {
  if (unlockedBadges >= 18) return 'Market Master';
  if (unlockedBadges >= 13) return 'Expert';
  if (unlockedBadges >= 8) return 'Pro Trader';
  if (unlockedBadges >= 4) return 'Trader';
  if (unlockedBadges >= 1) return 'Novice';
  return 'Rookie';
}
