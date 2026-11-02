import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_format.dart';
import '../news_repository.dart';
import '../screens/article_screen.dart';
import '../screens/news_screen.dart';
import 'news_tiles.dart';

/// News on the home tab and the symbol screen. StockVirtue's own stories
/// come first; until the newsroom has published any (or on an older
/// backend) it shows the headline feed as before. On the home tab it pages
/// 10 at a time with "Load more"; on a symbol screen it shows stories tagged
/// with that company, else headlines mentioning it, and hides itself when
/// there are none.
class NewsSection extends ConsumerWidget {
  const NewsSection({super.key, this.symbol});

  /// When set, only news about this NSE symbol.
  final String? symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sym = symbol;
    if (sym != null) {
      return ref.watch(symbolNewsProvider(sym)).maybeWhen(
            data: (news) {
              if (news.stories.isEmpty && news.headlines.isEmpty) {
                return const SizedBox.shrink();
              }
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // The detail screen already spaces its sections.
                  SectionHeader(
                    title: 'News on $sym',
                    padding: const EdgeInsets.fromLTRB(16, 0, 8, 10),
                  ),
                  for (final c in news.stories) NewsListTile(card: c),
                  for (final h in news.headlines) _HeadlineTile(headline: h),
                ],
              );
            },
            orElse: () => const SizedBox.shrink(),
          );
    }

    final async = ref.watch(marketsNewsProvider);
    return async.when(
      loading: () => const _NewsShell(child: _LoadingRow()),
      error: (_, _) => _NewsShell(
        child: _MessageRow(
          text: 'News is unavailable right now.',
          onRetry: () => ref.invalidate(marketsNewsProvider),
        ),
      ),
      data: (feed) {
        if (feed.isEmpty) {
          return const _NewsShell(
            child: _MessageRow(text: 'No market news at the moment.'),
          );
        }
        final ownStories = feed.stories.isNotEmpty;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SectionHeader(
              title: 'Markets news',
              actionLabel: ownStories ? 'All news' : null,
              onAction: ownStories
                  ? () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const NewsScreen()),
                      )
                  : null,
            ),
            for (final c in feed.stories) NewsListTile(card: c),
            for (final h in feed.headlines) _HeadlineTile(headline: h),
            if (feed.hasMore)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
                child: _LoadMoreButton(
                  loading: feed.loadingMore,
                  failed: feed.loadMoreFailed,
                  onPressed: () =>
                      ref.read(marketsNewsProvider.notifier).loadMore(),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _NewsShell extends StatelessWidget {
  const _NewsShell({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionHeader(title: 'Markets news'),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
          child: child,
        ),
      ],
    );
  }
}

class _LoadMoreButton extends StatelessWidget {
  const _LoadMoreButton({
    required this.loading,
    required this.failed,
    required this.onPressed,
  });

  final bool loading;
  final bool failed;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: loading ? null : onPressed,
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
      child: loading
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  failed ? Icons.refresh_rounded : Icons.expand_more_rounded,
                  size: 18,
                ),
                const SizedBox(width: 6),
                Text(failed ? "Couldn't load — try again" : 'Load more news'),
              ],
            ),
    );
  }
}

/// A headline from another publisher, opened in the in-app browser.
class _HeadlineTile extends StatelessWidget {
  const _HeadlineTile({required this.headline});
  final NewsHeadline headline;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final m = context.market;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: AppCard(
        radius: AppRadius.md,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ArticleScreen(
              title: headline.title,
              url: headline.link,
            ),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              headline.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: t.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
            if (headline.summary.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                headline.summary,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: t.bodySmall?.copyWith(height: 1.4),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          headline.source,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: t.labelSmall?.copyWith(
                            color: m.info,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (headline.publishedAt != null)
                        Text(
                          '  ·  ${newsAgo(headline.publishedAt!)}',
                          style: t.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.arrow_outward_rounded,
                  size: 14,
                  color: scheme.onSurfaceVariant,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _LoadingRow extends StatelessWidget {
  const _LoadingRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        const SizedBox(width: 10),
        Text(
          'Loading the latest headlines…',
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({required this.text, this.onRetry});
  final String text;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodySmall),
        ),
        if (onRetry != null)
          TextButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    );
  }
}
