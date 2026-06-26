import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/error_mapper.dart';
import '../../../core/money_format.dart';
import '../../../data/models/room.dart';
import '../rooms_providers.dart';
import '../rooms_repository.dart';
import 'create_room_screen.dart';
import 'join_by_code_screen.dart';
import 'room_detail_screen.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Three-tab landing for trading rooms:
///   * Mine — rooms I'm a member of, sorted by joined-recency
///   * Public — open public rooms anyone can join
///   * Tournaments — time-bounded competitions, sorted by start time
/// Bottom-right FAB cluster: create + join-by-code.
class RoomsLandingScreen extends ConsumerStatefulWidget {
  const RoomsLandingScreen({super.key});

  @override
  ConsumerState<RoomsLandingScreen> createState() =>
      _RoomsLandingScreenState();
}

class _RoomsLandingScreenState extends ConsumerState<RoomsLandingScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  void _refreshAll() {
    ref.invalidate(myRoomsProvider);
    ref.invalidate(publicRoomsProvider(null));
    ref.invalidate(publicRoomsProvider(true));
    ref.invalidate(publicRoomsProvider(false));
  }

  Future<void> _create() async {
    final created = await Navigator.of(context).push<RoomSummary>(
      MaterialPageRoute(builder: (_) => const CreateRoomScreen()),
    );
    if (created != null) {
      _refreshAll();
      if (!mounted) return;
      _openDetail(created.id);
    }
  }

  Future<void> _joinByCode() async {
    final joined = await Navigator.of(context).push<RoomSummary>(
      MaterialPageRoute(builder: (_) => const JoinByCodeScreen()),
    );
    if (joined != null) {
      _refreshAll();
      if (!mounted) return;
      _openDetail(joined.id);
    }
  }

  /// One-tap join for PUBLIC rooms / tournaments — no invite code needed.
  Future<void> _joinPublic(String roomId) async {
    try {
      await ref.read(roomsRepositoryProvider).joinPublic(roomId);
      _refreshAll();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Joined room')),
      );
      _openDetail(roomId);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError(e, context: 'room-join')),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  void _openDetail(String roomId) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => RoomDetailScreen(roomId: roomId)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Trading rooms',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Mine'),
            Tab(text: 'Public'),
            Tab(text: 'Tournaments'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _MyRoomsTab(onOpen: _openDetail),
          _PublicRoomsTab(
            tournament: false,
            onOpen: _openDetail,
            onJoin: _joinPublic,
          ),
          _PublicRoomsTab(
            tournament: true,
            onOpen: _openDetail,
            onJoin: _joinPublic,
          ),
        ],
      ),
      floatingActionButton: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          FloatingActionButton.small(
            heroTag: 'join_code',
            onPressed: _joinByCode,
            tooltip: 'Join by code',
            child: const Icon(Icons.qr_code_2),
          ),
          const SizedBox(height: 10),
          FloatingActionButton.extended(
            heroTag: 'create_room',
            onPressed: _create,
            icon: const Icon(Icons.add),
            label: const Text(
              'Create room',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _MyRoomsTab extends ConsumerWidget {
  const _MyRoomsTab({required this.onOpen});
  final ValueChanged<String> onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myRoomsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myRoomsProvider);
        await ref.read(myRoomsProvider.future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
          ],
        ),
        data: (rooms) {
          if (rooms.isEmpty) {
            return ListView(
              children: const [
                SizedBox(height: 80),
                _EmptyMine(),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              for (final r in rooms) ...[
                _RoomCard(
                  room: r,
                  onTap: () => onOpen(r.id),
                ),
                const SizedBox(height: 10),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _EmptyMine extends StatelessWidget {
  const _EmptyMine();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        children: [
          Icon(
            Icons.groups_outlined,
            size: 56,
            color: scheme.onSurface.withValues(alpha: 0.4),
          ),
          const SizedBox(height: 14),
          const Text(
            'No rooms yet',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 6),
          Text(
            'Create a private room to trade with friends, browse public '
            'rooms, or enter a tournament. Your existing portfolio carries '
            'over — each room just ranks you by return since you joined.',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12.5,
              color: scheme.onSurface.withValues(alpha: 0.6),
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PublicRoomsTab extends ConsumerWidget {
  const _PublicRoomsTab({
    required this.tournament,
    required this.onOpen,
    required this.onJoin,
  });
  final bool tournament;

  /// Tap the card body → open the room detail to browse it.
  final ValueChanged<String> onOpen;

  /// Tap the Join button → join directly (no code needed).
  final ValueChanged<String> onJoin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(publicRoomsProvider(tournament));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(publicRoomsProvider(tournament));
        await ref.read(publicRoomsProvider(tournament).future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
          ],
        ),
        data: (rooms) {
          if (rooms.isEmpty) {
            return ListView(
              padding: const EdgeInsets.all(32),
              children: [
                const SizedBox(height: 60),
                Center(
                  child: Text(
                    tournament
                        ? 'No live tournaments right now.\nCheck back later or create your own.'
                        : 'No public rooms yet.\nBe the first — create one.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withValues(alpha: 0.55),
                    ),
                  ),
                ),
              ],
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
            children: [
              for (final r in rooms) ...[
                _RoomCard(
                  room: r,
                  onTap: () => onOpen(r.id),
                  publicLayout: true,
                  onJoin: () => onJoin(r.id),
                ),
                const SizedBox(height: 10),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Card layout for both Mine and Public tabs. The `publicLayout` flag
/// flips the right-hand chip from "my return%" to "tournament window" /
/// "member count" depending on the row type.
class _RoomCard extends StatelessWidget {
  const _RoomCard({
    required this.room,
    required this.onTap,
    this.publicLayout = false,
    this.onJoin,
  });

  final RoomSummary room;
  final VoidCallback onTap;
  final bool publicLayout;

  /// When set (public/tournament browse cards), renders a one-tap Join button.
  final VoidCallback? onJoin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pct = room.returnPct;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? _upColor : _downColor;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Ink(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              room.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 14.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          if (room.isTournament) const _TournamentBadge(),
                          if (!room.isPublic) const SizedBox(width: 4),
                          if (!room.isPublic) const _PrivateBadge(),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        room.description?.isNotEmpty == true
                            ? room.description!
                            : 'Code · ${room.code}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11.5,
                          color: scheme.onSurface.withValues(alpha: 0.55),
                        ),
                      ),
                    ],
                  ),
                ),
                if (!publicLayout && pct != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: pctColor.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%',
                      style: TextStyle(
                        color: pctColor,
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.18),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  Icons.group_outlined,
                  size: 13,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
                const SizedBox(width: 4),
                Text(
                  room.maxMembers > 0
                      ? '${room.memberCount}/${room.maxMembers} members'
                      : '${room.memberCount} members',
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    room.isTournament && room.endsAt != null
                        ? _tournamentWindowLabel(room)
                        : (!publicLayout && room.myBaseline != null)
                              ? 'Baseline ${formatInr(room.myBaseline!)}'
                              : (room.isPublic ? 'Public' : 'Private'),
                    textAlign: TextAlign.end,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ),
              ],
            ),
            if (onJoin != null) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonal(
                  onPressed: onJoin,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(38),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text(
                    'Join room',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TournamentBadge extends StatelessWidget {
  const _TournamentBadge();

  @override
  Widget build(BuildContext context) {
    const tint = Color(0xFFF59E0B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'TOURNEY',
        style: TextStyle(
          color: tint,
          fontSize: 9,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _PrivateBadge extends StatelessWidget {
  const _PrivateBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .surfaceContainerHighest
            .withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        'PRIVATE',
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
          fontSize: 9,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

String _tournamentWindowLabel(RoomSummary room) {
  final end = room.endsAt;
  if (end == null) return 'Tournament';
  final now = DateTime.now();
  if (end.isBefore(now)) return 'Ended';
  final start = room.startsAt;
  if (start != null && start.isAfter(now)) {
    return 'Starts ${_fmtShort(start)}';
  }
  // Live tournament — count down to close.
  final remaining = end.difference(now);
  if (remaining.inDays > 0) return 'Ends in ${remaining.inDays}d';
  if (remaining.inHours > 0) return 'Ends in ${remaining.inHours}h';
  return 'Ends in ${remaining.inMinutes}m';
}

String _fmtShort(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${d.day} ${months[d.month - 1]}';
}
