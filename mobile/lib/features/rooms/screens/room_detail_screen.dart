import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/error_mapper.dart';
import '../../../core/market_hours.dart';
import '../../../core/money_format.dart';
import '../../../data/models/room.dart';
import '../../auth/auth_controller.dart';
import '../rooms_providers.dart';
import '../rooms_repository.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Room detail page. Header carries the invite code (tap to copy or
/// share), tournament window if applicable, and member count. Body is
/// the sorted leaderboard; rank 1–3 get podium colours. Auto-refreshes
/// every 30s while the market is open so live equities reflect.
class RoomDetailScreen extends ConsumerStatefulWidget {
  const RoomDetailScreen({super.key, required this.roomId});
  final String roomId;

  @override
  ConsumerState<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends ConsumerState<RoomDetailScreen> {
  Timer? _autoRefresh;

  @override
  void initState() {
    super.initState();
    _autoRefresh = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      if (!isMarketOpen()) return;
      ref.invalidate(roomDetailProvider(widget.roomId));
    });
  }

  @override
  void dispose() {
    _autoRefresh?.cancel();
    super.dispose();
  }

  Future<void> _leave(RoomDetail room) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave room?'),
        content: Text('Stop tracking your return inside "${room.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(roomsRepositoryProvider).leave(room.id);
      ref.invalidate(myRoomsProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError(e, context: 'room-leave'))),
        );
      }
    }
  }

  Future<void> _join(RoomDetail room) async {
    try {
      await ref.read(roomsRepositoryProvider).joinPublic(room.id);
      ref.invalidate(myRoomsProvider);
      ref.invalidate(roomDetailProvider(room.id));
      ref.invalidate(publicRoomsProvider(null));
      ref.invalidate(publicRoomsProvider(true));
      ref.invalidate(publicRoomsProvider(false));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Joined room')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(friendlyError(e, context: 'room-join')),
            backgroundColor: Colors.redAccent,
          ),
        );
      }
    }
  }

  Future<void> _close(RoomDetail room) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Close room?'),
        content: Text(
          'This permanently removes "${room.name}" for everyone. '
          'Cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Close room'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(roomsRepositoryProvider).close(room.id);
      ref.invalidate(myRoomsProvider);
      ref.invalidate(publicRoomsProvider(null));
      ref.invalidate(publicRoomsProvider(true));
      ref.invalidate(publicRoomsProvider(false));
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(friendlyError(e, context: 'room-close'))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(roomDetailProvider(widget.roomId));
    final me = ref.watch(authControllerProvider).value;
    final isOwner = async.value?.ownerId == me?.id;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          async.value?.name ?? 'Room',
          style: const TextStyle(fontWeight: FontWeight.w700),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          if (async.value != null) ...[
            if (isOwner)
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Close room',
                onPressed: () => _close(async.value!),
              )
            else if (async.value!.iAmMember)
              IconButton(
                icon: const Icon(Icons.exit_to_app),
                tooltip: 'Leave room',
                onPressed: () => _leave(async.value!),
              ),
          ],
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(roomDetailProvider(widget.roomId));
          await ref.read(roomDetailProvider(widget.roomId).future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
            ],
          ),
          data: (room) => _Body(
            room: room,
            // Non-members browsing a public room get a one-tap Join.
            onJoin: (!room.iAmMember && room.isPublic && !isOwner)
                ? () => _join(room)
                : null,
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.room, this.onJoin});
  final RoomDetail room;

  /// Set for non-members of a public room — renders a prominent Join button.
  final VoidCallback? onJoin;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _Header(room: room),
        const SizedBox(height: 14),
        _CodeRow(room: room),
        const SizedBox(height: 16),
        if (onJoin != null) ...[
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onJoin,
              icon: const Icon(Icons.group_add_outlined, size: 18),
              label: const Text(
                'Join this room',
                style: TextStyle(fontWeight: FontWeight.w800),
              ),
              style: FilledButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
        if (room.frozen) ...[
          const _FrozenBanner(),
          const SizedBox(height: 12),
        ],
        _LeaderboardHeader(memberCount: room.memberCount),
        const SizedBox(height: 6),
        for (final entry in room.leaderboard) ...[
          _LeaderboardTile(entry: entry),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.room});
  final RoomDetail room;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.55),
            scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  room.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (room.isTournament) const _TournamentChip(),
              const SizedBox(width: 4),
              if (!room.isPublic) const _PrivateChip(),
            ],
          ),
          if (room.description != null && room.description!.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              room.description!,
              style: TextStyle(
                fontSize: 12.5,
                color: scheme.onSurface.withValues(alpha: 0.7),
              ),
            ),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              Icon(
                Icons.person,
                size: 12,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
              const SizedBox(width: 4),
              Flexible(
                child: Text(
                  'Hosted by ${room.ownerName}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Icon(
                Icons.group_outlined,
                size: 12,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
              const SizedBox(width: 4),
              Text(
                room.maxMembers > 0
                    ? '${room.memberCount}/${room.maxMembers}'
                    : '${room.memberCount}',
                style: TextStyle(
                  fontSize: 11.5,
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ],
          ),
          if (room.isTournament) ...[
            const SizedBox(height: 6),
            _TournamentWindow(room: room),
          ],
        ],
      ),
    );
  }
}

class _TournamentWindow extends StatelessWidget {
  const _TournamentWindow({required this.room});
  final RoomDetail room;

  @override
  Widget build(BuildContext context) {
    final start = room.startsAt;
    final end = room.endsAt;
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(
          Icons.schedule,
          size: 12,
          color: scheme.onSurface.withValues(alpha: 0.6),
        ),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            start != null && end != null
                ? '${_fmt(start)} → ${_fmt(end)}'
                : 'Tournament',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.6),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

class _CodeRow extends StatelessWidget {
  const _CodeRow({required this.room});
  final RoomDetail room;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.qr_code_2, size: 18, color: scheme.primary),
          const SizedBox(width: 10),
          Text(
            'Invite code',
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.55),
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
          const SizedBox(width: 10),
          Text(
            room.code,
            style: const TextStyle(
              fontWeight: FontWeight.w900,
              fontSize: 16,
              letterSpacing: 3,
            ),
          ),
          const Spacer(),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.copy, size: 16),
            tooltip: 'Copy code',
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: room.code));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Code copied'),
                  duration: Duration(seconds: 1),
                ),
              );
            },
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.share, size: 16),
            tooltip: 'Share',
            onPressed: () async {
              await SharePlus.instance.share(
                ShareParams(
                  text: 'Join me on StockVirtue! Open the app → Rooms → '
                      'Join by code and enter ${room.code}',
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _FrozenBanner extends StatelessWidget {
  const _FrozenBanner();

  @override
  Widget build(BuildContext context) {
    const tint = Color(0xFFF59E0B);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tint.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: const [
          Icon(Icons.emoji_events, color: tint, size: 16),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Final standings — tournament ended.',
              style: TextStyle(
                color: tint,
                fontWeight: FontWeight.w800,
                fontSize: 12.5,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaderboardHeader extends StatelessWidget {
  const _LeaderboardHeader({required this.memberCount});
  final int memberCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Row(
        children: [
          const Text(
            'Leaderboard',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          const SizedBox(width: 8),
          Text(
            '· $memberCount ${memberCount == 1 ? 'member' : 'members'}',
            style: TextStyle(
              fontSize: 11.5,
              color:
                  Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaderboardTile extends StatelessWidget {
  const _LeaderboardTile({required this.entry});
  final RoomLeaderboardEntry entry;

  Color _rankColor(BuildContext context) {
    switch (entry.rank) {
      case 1:
        return const Color(0xFFFFD700); // gold
      case 2:
        return const Color(0xFFC0C0C0); // silver
      case 3:
        return const Color(0xFFCD7F32); // bronze
      default:
        return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = entry.returnPct >= 0;
    final pctColor = isUp ? _upColor : _downColor;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: entry.isYou
            ? scheme.primary.withValues(alpha: 0.12)
            : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: entry.isYou
              ? scheme.primary.withValues(alpha: 0.4)
              : scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _rankColor(context).withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '${entry.rank}',
              style: TextStyle(
                color: _rankColor(context),
                fontWeight: FontWeight.w900,
                fontSize: 12.5,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        entry.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    if (entry.isOwner) ...[
                      const SizedBox(width: 6),
                      _MiniTag(label: 'HOST', color: const Color(0xFFF59E0B)),
                    ],
                    if (entry.isYou) ...[
                      const SizedBox(width: 6),
                      _MiniTag(label: 'YOU', color: scheme.primary),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  '${formatInr(entry.baseline)} → ${formatInr(entry.current)}',
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${isUp ? '+' : ''}${entry.returnPct.toStringAsFixed(2)}%',
                style: TextStyle(
                  color: pctColor,
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                ),
              ),
              Text(
                '${isUp ? '+' : ''}${formatInr(entry.change)}',
                style: TextStyle(
                  color: pctColor.withValues(alpha: 0.85),
                  fontWeight: FontWeight.w600,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniTag extends StatelessWidget {
  const _MiniTag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 8.5,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _TournamentChip extends StatelessWidget {
  const _TournamentChip();

  @override
  Widget build(BuildContext context) {
    const tint = Color(0xFFF59E0B);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(5),
      ),
      child: const Text(
        'TOURNEY',
        style: TextStyle(
          color: tint,
          fontSize: 9.5,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

class _PrivateChip extends StatelessWidget {
  const _PrivateChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Theme.of(context)
            .colorScheme
            .surfaceContainerHighest
            .withValues(alpha: 0.7),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        'PRIVATE',
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
          fontSize: 9.5,
          fontWeight: FontWeight.w900,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

String _fmt(DateTime d) {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${d.day} ${months[d.month - 1]} ${d.year.toString().substring(2)}';
}
