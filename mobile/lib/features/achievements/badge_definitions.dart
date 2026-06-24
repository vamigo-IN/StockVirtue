import 'package:flutter/material.dart';

/// Visual catalog for achievement badges. Unlock decisions are made
/// SERVER-SIDE (see backend AchievementsService) — the app fetches the set of
/// unlocked ids from GET /achievements and renders them against this catalog.
/// So this file is pure presentation: id + label + icon + colour. The ids
/// here MUST match the server's badge-catalog.ts.
///
/// Named [AchievementBadge] to avoid colliding with Flutter Material's own
/// `Badge` widget when imported alongside material.dart.
class AchievementBadge {
  final String id;
  final String name;
  final String hint;
  final IconData icon;
  final Color color;

  const AchievementBadge({
    required this.id,
    required this.name,
    required this.hint,
    required this.icon,
    required this.color,
  });
}

const _gold = Color(0xFFF59E0B);
const _green = Color(0xFF22C55E);
const _purple = Color(0xFF8B5CF6);
const _cyan = Color(0xFF06B6D4);
const _pink = Color(0xFFEC4899);
const _indigo = Color(0xFF6366F1);
const _red = Color(0xFFEF4444);

final allBadges = <AchievementBadge>[
  AchievementBadge(
    id: 'first_trade',
    name: 'First trade',
    hint: 'Place your first filled order.',
    icon: Icons.bolt,
    color: _gold,
  ),
  AchievementBadge(
    id: 'five_trades',
    name: 'Warming up',
    hint: 'Place 5 filled orders.',
    icon: Icons.local_fire_department,
    color: _gold,
  ),
  AchievementBadge(
    id: 'twenty_trades',
    name: 'Active trader',
    hint: 'Place 20 filled orders.',
    icon: Icons.flash_on,
    color: _gold,
  ),
  AchievementBadge(
    id: 'fifty_trades',
    name: 'Veteran',
    hint: 'Place 50 filled orders.',
    icon: Icons.military_tech,
    color: _purple,
  ),
  AchievementBadge(
    id: 'first_profit',
    name: 'First profit',
    hint: 'Close any position with realized profit.',
    icon: Icons.emoji_emotions,
    color: _green,
  ),
  AchievementBadge(
    id: 'profit_10k',
    name: 'Five-figure run',
    hint: 'Realize ₹10,000 in lifetime profit.',
    icon: Icons.trending_up,
    color: _green,
  ),
  AchievementBadge(
    id: 'profit_100k',
    name: 'Six-figure trader',
    hint: 'Realize ₹1,00,000 in lifetime profit.',
    icon: Icons.workspace_premium,
    color: _green,
  ),
  AchievementBadge(
    id: 'fno_explorer',
    name: 'F&O explorer',
    hint: 'Place your first F&O order.',
    icon: Icons.swap_calls,
    color: _indigo,
  ),
  AchievementBadge(
    id: 'options_trader',
    name: 'Options trader',
    hint: 'Place an order on a call or put option.',
    icon: Icons.account_tree_outlined,
    color: _purple,
  ),
  AchievementBadge(
    id: 'short_seller',
    name: 'Short seller',
    hint: 'Open a short position.',
    icon: Icons.arrow_downward,
    color: _red,
  ),
  AchievementBadge(
    id: 'intraday_jockey',
    name: 'Intraday jockey',
    hint: 'Place an MIS (intraday) order.',
    icon: Icons.timer_outlined,
    color: _cyan,
  ),
  AchievementBadge(
    id: 'diversified_3',
    name: 'Diversifier',
    hint: 'Hold positions in 3 different sectors.',
    icon: Icons.scatter_plot,
    color: _pink,
  ),
  AchievementBadge(
    id: 'diversified_5',
    name: 'Sector spread',
    hint: 'Hold positions in 5 different sectors.',
    icon: Icons.bubble_chart,
    color: _pink,
  ),
  AchievementBadge(
    id: 'friend_invited',
    name: 'Friend invited',
    hint: 'Refer your first friend who signs up with your code.',
    icon: Icons.card_giftcard,
    color: _pink,
  ),
  AchievementBadge(
    id: 'power_inviter',
    name: 'Power inviter',
    hint: 'Refer 5 friends who sign up with your code.',
    icon: Icons.group_add,
    color: _purple,
  ),
  AchievementBadge(
    id: 'influencer',
    name: 'Influencer',
    hint: 'Refer 25 friends who sign up with your code.',
    icon: Icons.diversity_3,
    color: _gold,
  ),
  // ── Learning (Academy) ──────────────────────────────────────────
  AchievementBadge(
    id: 'first_lesson',
    name: 'Curious mind',
    hint: 'Finish your first Academy lesson.',
    icon: Icons.school_outlined,
    color: _green,
  ),
  AchievementBadge(
    id: 'knowledge_seeker',
    name: 'Knowledge seeker',
    hint: 'Finish 5 Academy lessons.',
    icon: Icons.menu_book_outlined,
    color: _cyan,
  ),
  AchievementBadge(
    id: 'quiz_ace',
    name: 'Quiz ace',
    hint: 'Score a perfect lesson quiz.',
    icon: Icons.quiz_outlined,
    color: _purple,
  ),
  AchievementBadge(
    id: 'academy_graduate',
    name: 'Academy graduate',
    hint: 'Finish every lesson in the Academy.',
    icon: Icons.school,
    color: _gold,
  ),
];
