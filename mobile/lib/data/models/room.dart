/// One row in `/rooms/mine` or `/rooms/public`. Carries enough info to
/// paint the list tile (name, member count, tournament window, my
/// current return%) without a per-room detail fetch.
class RoomSummary {
  final String id;
  final String code;
  final String name;
  final String? description;
  final String ownerId;
  final bool isPublic;
  final bool isTournament;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int maxMembers;
  final int memberCount;
  final DateTime createdAt;
  /// Whether I'm already a member of (or own) this room. Used to hide the
  /// "Join" button on public/tournament rooms I've already joined.
  final bool joined;
  /// My equity at join time. Null for public-list rows where I'm not a
  /// member yet — the list screen falls back to "—" in that case.
  final double? myBaseline;
  /// % return since my baseline. Null when [myBaseline] is null, or when
  /// my baseline was 0 (newly-created account before any deposits).
  final double? returnPct;

  const RoomSummary({
    required this.id,
    required this.code,
    required this.name,
    required this.description,
    required this.ownerId,
    required this.isPublic,
    required this.isTournament,
    required this.startsAt,
    required this.endsAt,
    required this.maxMembers,
    required this.memberCount,
    required this.createdAt,
    this.joined = false,
    required this.myBaseline,
    required this.returnPct,
  });

  factory RoomSummary.fromJson(Map<String, dynamic> json) => RoomSummary(
        id: json['id'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        ownerId: json['ownerId'] as String,
        isPublic: json['isPublic'] as bool,
        isTournament: json['isTournament'] as bool,
        startsAt: _parseDate(json['startsAt']),
        endsAt: _parseDate(json['endsAt']),
        maxMembers: (json['maxMembers'] as num?)?.toInt() ?? 0,
        memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
        createdAt:
            _parseDate(json['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        joined: json['joined'] as bool? ?? false,
        myBaseline: (json['myBaseline'] as num?)?.toDouble(),
        returnPct: (json['returnPct'] as num?)?.toDouble(),
      );
}

/// One row in [RoomDetail.leaderboard]. Computed server-side per request
/// — no client-side ranking. `isYou` lets the UI highlight the caller's
/// row without us shipping the userId everywhere.
class RoomLeaderboardEntry {
  final int rank;
  final String userId;
  final String displayName;
  final double baseline;
  final double current;
  final double change;
  final double returnPct;
  final DateTime joinedAt;
  final bool isOwner;
  final bool isYou;

  const RoomLeaderboardEntry({
    required this.rank,
    required this.userId,
    required this.displayName,
    required this.baseline,
    required this.current,
    required this.change,
    required this.returnPct,
    required this.joinedAt,
    required this.isOwner,
    required this.isYou,
  });

  factory RoomLeaderboardEntry.fromJson(Map<String, dynamic> json) =>
      RoomLeaderboardEntry(
        rank: (json['rank'] as num).toInt(),
        userId: json['userId'] as String,
        displayName: json['displayName'] as String,
        baseline: (json['baseline'] as num).toDouble(),
        current: (json['current'] as num).toDouble(),
        change: (json['change'] as num).toDouble(),
        returnPct: (json['returnPct'] as num).toDouble(),
        joinedAt: _parseDate(json['joinedAt']) ??
            DateTime.fromMillisecondsSinceEpoch(0),
        isOwner: json['isOwner'] as bool? ?? false,
        isYou: json['isYou'] as bool? ?? false,
      );
}

/// Full room view returned by `GET /rooms/:id`. Carries the sorted
/// member leaderboard plus a `frozen` flag for tournaments whose
/// endsAt has elapsed.
class RoomDetail {
  final String id;
  final String code;
  final String name;
  final String? description;
  final String ownerId;
  final String ownerName;
  final bool isPublic;
  final bool isTournament;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final int maxMembers;
  final int memberCount;
  final DateTime createdAt;
  /// True once a tournament's endsAt is in the past — the leaderboard
  /// stops re-ranking after this flips and the UI shows a "Final
  /// standings" banner.
  final bool frozen;
  final bool iAmMember;
  final List<RoomLeaderboardEntry> leaderboard;

  const RoomDetail({
    required this.id,
    required this.code,
    required this.name,
    required this.description,
    required this.ownerId,
    required this.ownerName,
    required this.isPublic,
    required this.isTournament,
    required this.startsAt,
    required this.endsAt,
    required this.maxMembers,
    required this.memberCount,
    required this.createdAt,
    required this.frozen,
    required this.iAmMember,
    required this.leaderboard,
  });

  factory RoomDetail.fromJson(Map<String, dynamic> json) => RoomDetail(
        id: json['id'] as String,
        code: json['code'] as String,
        name: json['name'] as String,
        description: json['description'] as String?,
        ownerId: json['ownerId'] as String,
        ownerName: json['ownerName'] as String? ?? 'Trader',
        isPublic: json['isPublic'] as bool,
        isTournament: json['isTournament'] as bool,
        startsAt: _parseDate(json['startsAt']),
        endsAt: _parseDate(json['endsAt']),
        maxMembers: (json['maxMembers'] as num?)?.toInt() ?? 0,
        memberCount: (json['memberCount'] as num?)?.toInt() ?? 0,
        createdAt:
            _parseDate(json['createdAt']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        frozen: json['frozen'] as bool? ?? false,
        iAmMember: json['iAmMember'] as bool? ?? false,
        leaderboard: ((json['leaderboard'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(RoomLeaderboardEntry.fromJson)
            .toList(),
      );
}

DateTime? _parseDate(Object? raw) {
  if (raw is! String) return null;
  if (raw.isEmpty) return null;
  return DateTime.tryParse(raw);
}
