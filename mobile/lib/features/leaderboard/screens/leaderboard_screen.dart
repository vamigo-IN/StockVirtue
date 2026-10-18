import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/leaderboard.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/rank_chip.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/skeletons.dart';
import '../leaderboard_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

class LeaderboardScreen extends ConsumerWidget {
  const LeaderboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(leaderboardProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Leaderboard',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(leaderboardProvider);
          await ref.read(leaderboardProvider.future);
        },
        child: data.when(
          loading: () => const SkeletonList(rows: 10),
          error: (e, _) => ErrorRetryView(
            error: e,
            onRetry: () => ref.invalidate(leaderboardProvider),
          ),
          data: (snap) => _Body(snap: snap),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.snap});
  final LeaderboardSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final me = snap.me;
    final inTop = me != null && snap.top.any((e) => e.rank == me.rank);
    if (snap.top.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 96, 24, 24),
            child: Center(
              child: Text(
                snap.computedAt == null
                    ? 'Leaderboard is being computed. Pull to refresh in a moment.'
                    : 'No traders ranked yet.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Theme.of(context)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.6),
                ),
              ),
            ),
          ),
        ],
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _Header(snap: snap),
        const SizedBox(height: 12),
        const InfoBanner(
          icon: Icons.verified_outlined,
          message:
              'Ranked by trading return on the ₹10L starting balance. '
              'Referral bonuses add to your equity but never to your rank.',
        ),
        const SizedBox(height: 12),
        if (me != null && !inTop) ...[
          _MeBanner(entry: me),
          const SizedBox(height: 16),
        ],
        for (var i = 0; i < snap.top.length; i++) ...[
          _LeaderTile(
            entry: snap.top[i],
            isMe: me?.rank == snap.top[i].rank,
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.snap});
  final LeaderboardSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final ts = snap.computedAt?.toLocal();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.5),
            scheme.tertiaryContainer.withValues(alpha: 0.35),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primary.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              Icons.emoji_events_outlined,
              color: scheme.primary,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Top traders',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  ts == null
                      ? 'Ranking by total equity (% return)'
                      : 'Updated ${_formatTime(ts)} • by % return',
                  style: TextStyle(
                    color: scheme.onSurface.withValues(alpha: 0.6),
                    fontSize: 11.5,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _formatTime(DateTime t) {
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }
}

class _MeBanner extends StatelessWidget {
  const _MeBanner({required this.entry});
  final LeaderboardEntry entry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: _upColor.withValues(alpha: 0.1),
        border: Border.all(color: _upColor.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(14),
      ),
      child: _LeaderRow(
        entry: entry,
        isMe: true,
        showYouTag: true,
        scheme: scheme,
      ),
    );
  }
}

class _LeaderTile extends StatelessWidget {
  const _LeaderTile({required this.entry, required this.isMe});
  final LeaderboardEntry entry;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: isMe
            ? _upColor.withValues(alpha: 0.08)
            : scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: isMe
              ? _upColor.withValues(alpha: 0.3)
              : scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: _LeaderRow(
        entry: entry,
        isMe: isMe,
        showYouTag: isMe,
        scheme: scheme,
      ),
    );
  }
}

class _LeaderRow extends StatelessWidget {
  const _LeaderRow({
    required this.entry,
    required this.isMe,
    required this.showYouTag,
    required this.scheme,
  });

  final LeaderboardEntry entry;
  final bool isMe;
  final bool showYouTag;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final isPositive = entry.returnPct >= 0;
    final retColor = isPositive ? _upColor : _downColor;
    final name = entry.displayName ?? 'Trader';
    final medal = _medal(entry.rank);
    return Row(
      children: [
        _RankBadge(rank: entry.rank, medal: medal, isMe: isMe),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (showYouTag)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _upColor.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'YOU',
                          style: TextStyle(
                            color: _upColor,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ),
                    ),
                  Flexible(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontWeight:
                            isMe ? FontWeight.w700 : FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 3),
              Row(
                children: [
                  RankChip(tag: entry.badgeTag, compact: true),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      formatInr(entry.totalEquity, decimals: 0),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: scheme.onSurface.withValues(alpha: 0.6),
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: retColor.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            '${isPositive ? '+' : ''}${entry.returnPct.toStringAsFixed(2)}%',
            style: TextStyle(
              color: retColor,
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ),
      ],
    );
  }

  static String? _medal(int rank) {
    if (rank == 1) return '🥇';
    if (rank == 2) return '🥈';
    if (rank == 3) return '🥉';
    return null;
  }
}

class _RankBadge extends StatelessWidget {
  const _RankBadge({
    required this.rank,
    required this.medal,
    required this.isMe,
  });

  final int rank;
  final String? medal;
  final bool isMe;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (medal != null) {
      return SizedBox(
        width: 36,
        child: Text(medal!, style: const TextStyle(fontSize: 22)),
      );
    }
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: (isMe ? _upColor : scheme.primary).withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '#$rank',
        style: TextStyle(
          color: isMe ? _upColor : scheme.primary,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}
