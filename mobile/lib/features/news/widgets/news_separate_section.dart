import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_models.dart';
import '../news_repository.dart';
import 'news_tiles.dart';

/// A section whose stories the latest list leaves out (Official updates),
/// as a block in the News screen's Latest view, like its section on the
/// website's news front: the section's name, its newest notices and
/// "See all", which opens its own list. Shows nothing while it loads, if it
/// can't be fetched, or while the section has no stories.
class SeparateNewsSection extends ConsumerWidget {
  const SeparateNewsSection({
    super.key,
    required this.category,
    required this.onSeeAll,
  });

  final NewsCategory category;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cards = ref.watch(separateNewsProvider(category.slug)).value ??
        const <NewsCard>[];
    if (cards.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SectionHeader(
          title: category.name,
          actionLabel: 'See all',
          onAction: onSeeAll,
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 6),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: AppCard(
            radius: AppRadius.md,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final (i, c) in cards.indexed) ...[
                  if (i > 0) const Divider(height: 1),
                  NewsNoticeTile(card: c),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// One notice, as the website's front draws Official updates: the labels
/// with the date it went out, then the headline. No picture or standfirst.
class NewsNoticeTile extends StatelessWidget {
  const NewsNoticeTile({super.key, required this.card});
  final NewsCard card;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return InkWell(
      onTap: () => openNewsStory(context, card),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            NewsLabels(card: card, dateOnly: true),
            const SizedBox(height: 6),
            Text(
              card.title,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: t.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
