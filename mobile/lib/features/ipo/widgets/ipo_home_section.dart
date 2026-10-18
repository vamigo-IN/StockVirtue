import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/ui/market_widgets.dart';
import '../ipo_repository.dart';
import '../screens/ipo_screen.dart';

/// Home "IPO watch": open and upcoming issues as a swipeable strip, or — when
/// the calendar is quiet — the best recent listings. Renders nothing at all
/// if NSE's IPO feed is unreachable, so it never shows a broken card.
class IpoHomeSection extends ConsumerWidget {
  const IpoHomeSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(ipoBoardProvider).value;
    if (board == null || !board.available || board.isEmpty) {
      return const SizedBox.shrink();
    }
    final issues = [...board.open, ...board.upcoming];
    final listed = [...board.recentlyListed]
      ..sort((a, b) => (b.gainPct ?? -1e9).compareTo(a.gainPct ?? -1e9));
    void openScreen(int tab) => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => IpoScreen(initialTab: tab)),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: 'IPO watch',
          subtitle: board.open.isNotEmpty
              ? '${board.open.length} open now · live subscription'
              : 'Upcoming issues & new listings',
          actionLabel: 'See all',
          onAction: () => openScreen(board.open.isNotEmpty ? 0 : 1),
          padding: const EdgeInsets.fromLTRB(16, 4, 8, 10),
        ),
        if (issues.isNotEmpty)
          SizedBox(
            height: 196,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: issues.length.clamp(0, 8),
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (_, i) => SizedBox(
                width: 290,
                child: GestureDetector(
                  onTap: () => openScreen(board.open.contains(issues[i]) ? 0 : 1),
                  child: IpoIssueCard(issue: issues[i], compact: true),
                ),
              ),
            ),
          ),
        if (listed.isNotEmpty) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                for (final ipo in listed.take(issues.isEmpty ? 4 : 2)) ...[
                  ListedIpoTile(ipo: ipo),
                  const SizedBox(height: 8),
                ],
              ],
            ),
          ),
        ],
      ],
    );
  }
}
