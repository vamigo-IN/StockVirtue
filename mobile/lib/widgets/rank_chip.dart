import 'package:flutter/material.dart';

/// Small colour-tiered "rank" pill shown next to a user's name in rooms and on
/// the leaderboard. The label is the server-computed badge tag (a named rank
/// derived from achievements unlocked + Academy progress), e.g. "Pro Trader".
class RankChip extends StatelessWidget {
  const RankChip({super.key, required this.tag, this.compact = false});

  final String tag;
  final bool compact;

  static Color colorFor(String tag) => switch (tag) {
        'Market Master' => const Color(0xFFEC4899),
        'Expert' => const Color(0xFF8B5CF6),
        'Pro Trader' => const Color(0xFF06B6D4),
        'Trader' => const Color(0xFF22C55E),
        'Novice' => const Color(0xFF64748B),
        _ => const Color(0xFF94A3B8), // Rookie / unknown
      };

  @override
  Widget build(BuildContext context) {
    final color = colorFor(tag);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 5 : 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.military_tech, size: compact ? 9 : 10, color: color),
          const SizedBox(width: 2),
          Text(
            tag,
            style: TextStyle(
              color: color,
              fontSize: compact ? 9 : 9.5,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}
