import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_format.dart';
import '../news_models.dart';
import '../screens/news_reader_screen.dart';

void openNewsStory(BuildContext context, NewsCard card) {
  Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => NewsReaderScreen(slug: card.slug, preview: card),
    ),
  );
}

/// A story's picture, sized for its box, with a quiet placeholder while it
/// loads or if it can't be fetched.
class NewsPicture extends StatelessWidget {
  const NewsPicture({
    super.key,
    required this.image,
    this.radius = AppRadius.sm,
    this.aspectRatio,
  });
  final NewsImage image;
  final double radius;
  final double? aspectRatio;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = Container(color: scheme.surfaceContainerHighest);
    final picture = LayoutBuilder(
      builder: (context, box) {
        final dpr = MediaQuery.devicePixelRatioOf(context);
        final w = box.maxWidth.isFinite ? box.maxWidth : 400.0;
        return Image.network(
          image.urlFor(w * dpr),
          fit: BoxFit.cover,
          width: double.infinity,
          height: double.infinity,
          semanticLabel: image.alt.isEmpty ? null : image.alt,
          errorBuilder: (_, _, _) => placeholder,
          frameBuilder: (context, child, frame, sync) =>
              sync || frame != null ? child : placeholder,
        );
      },
    );
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: aspectRatio == null
          ? picture
          : AspectRatio(aspectRatio: aspectRatio!, child: picture),
    );
  }
}

/// Small labels: BREAKING, and "AI-assisted" for stories that use AI text.
class NewsLabels extends StatelessWidget {
  const NewsLabels({
    super.key,
    required this.card,
    this.showCategory = true,
    this.dateOnly = false,
  });
  final NewsCard card;
  final bool showCategory;

  /// The date it went out instead of "3h ago" (Official updates' notices,
  /// as on the website).
  final bool dateOnly;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme.labelSmall;
    final m = context.market;
    final scheme = Theme.of(context).colorScheme;
    final parts = <Widget>[];
    if (card.isBreakingNow) {
      parts.add(Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
        decoration: BoxDecoration(
          color: m.down,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          'BREAKING',
          style: t?.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
          ),
        ),
      ));
    }
    if (showCategory && card.category != null) {
      parts.add(Text(
        card.category!.name.toUpperCase(),
        style: t?.copyWith(
          color: m.info,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ));
    }
    if (card.publishedAt != null) {
      parts.add(Text(
        dateOnly ? istDate(card.publishedAt!) : newsAgo(card.publishedAt!),
        style: t?.copyWith(color: scheme.onSurfaceVariant),
      ));
    }
    if (card.isAiGenerated) {
      parts.add(Text(
        'AI-assisted',
        style: t?.copyWith(color: scheme.onSurfaceVariant),
      ));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: parts,
    );
  }
}

/// A story in a list: headline and labels, with a thumbnail when it has one.
class NewsListTile extends StatelessWidget {
  const NewsListTile({super.key, required this.card, this.dense = false});
  final NewsCard card;

  /// Inside another card (related stories): no frame, smaller thumbnail.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final thumb = dense ? 64.0 : 84.0;
    final content = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              NewsLabels(card: card),
              const SizedBox(height: 6),
              Text(
                card.title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: (dense ? t.bodyMedium : t.titleSmall)?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.3,
                ),
              ),
              if (!dense && card.summary.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  card.summary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodySmall?.copyWith(height: 1.4),
                ),
              ],
            ],
          ),
        ),
        if (card.image != null) ...[
          const SizedBox(width: 12),
          SizedBox(
            width: thumb,
            height: thumb,
            child: NewsPicture(image: card.image!, radius: AppRadius.xs),
          ),
        ],
      ],
    );
    if (dense) {
      return InkWell(
        onTap: () => openNewsStory(context, card),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: content,
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: AppCard(
        radius: AppRadius.md,
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        onTap: () => openNewsStory(context, card),
        child: content,
      ),
    );
  }
}

/// The lead story: a large picture over the headline.
class NewsHeroCard extends StatelessWidget {
  const NewsHeroCard({super.key, required this.card});
  final NewsCard card;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: AppCard(
        radius: AppRadius.md,
        padding: EdgeInsets.zero,
        onTap: () => openNewsStory(context, card),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (card.image != null)
              NewsPicture(image: card.image!, radius: 0, aspectRatio: 16 / 9),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  NewsLabels(card: card),
                  const SizedBox(height: 6),
                  Text(
                    card.title,
                    style: t.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      height: 1.25,
                    ),
                  ),
                  if (card.summary.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      card.summary,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodySmall?.copyWith(height: 1.45),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A red strip for breaking stories, newest first; tapping opens the story.
class BreakingStrip extends ConsumerWidget {
  const BreakingStrip({super.key, required this.cards});
  final List<NewsCard> cards;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Only stories still inside their 24 hours (a list fetched a while ago
    // may hold one that has run out).
    final live = cards.where((c) => c.isBreakingNow);
    if (live.isEmpty) return const SizedBox.shrink();
    final m = context.market;
    final t = Theme.of(context).textTheme;
    final c = live.first;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Material(
        color: m.down.withValues(alpha: 0.1),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
          side: BorderSide(color: m.down.withValues(alpha: 0.35)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => openNewsStory(context, c),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: m.down,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    'BREAKING',
                    style: t.labelSmall?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    c.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                  ),
                ),
                const Icon(Icons.chevron_right_rounded),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
