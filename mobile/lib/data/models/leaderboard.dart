class LeaderboardEntry {
  final int rank;
  final String? displayName;
  /// Named rank from achievements + academy progress (e.g. "Pro Trader").
  final String badgeTag;
  final double totalEquity;
  final double returnPct;
  final String? userId; // only present for the requester's own entry

  const LeaderboardEntry({
    required this.rank,
    required this.displayName,
    this.badgeTag = 'Rookie',
    required this.totalEquity,
    required this.returnPct,
    required this.userId,
  });

  factory LeaderboardEntry.fromJson(Map<String, dynamic> json) =>
      LeaderboardEntry(
        rank: (json['rank'] as num).toInt(),
        displayName: json['displayName'] as String?,
        badgeTag: json['badgeTag'] as String? ?? 'Rookie',
        totalEquity: (json['totalEquity'] as num).toDouble(),
        returnPct: (json['returnPct'] as num).toDouble(),
        userId: json['userId'] as String?,
      );
}

class LeaderboardSnapshot {
  final DateTime? computedAt;
  final int total;
  final List<LeaderboardEntry> top;
  final LeaderboardEntry? me;

  const LeaderboardSnapshot({
    required this.computedAt,
    required this.total,
    required this.top,
    required this.me,
  });

  factory LeaderboardSnapshot.fromJson(Map<String, dynamic> json) =>
      LeaderboardSnapshot(
        computedAt: DateTime.tryParse(json['computedAt'] as String? ?? ''),
        total: (json['total'] as num?)?.toInt() ?? 0,
        top: ((json['top'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(LeaderboardEntry.fromJson)
            .toList(),
        me: json['me'] is Map<String, dynamic>
            ? LeaderboardEntry.fromJson(json['me'] as Map<String, dynamic>)
            : null,
      );
}
