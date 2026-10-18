import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_repository.dart';
import '../screens/article_screen.dart';

/// Renders the latest articles from the backend RSS aggregator. On the home
/// tab (no [symbol]) it shows the markets feed 10 at a time with a "Load
/// more" button; on the symbol-detail screen it shows the articles that
/// mention that symbol, and hides itself when there are none.
class NewsSection extends ConsumerWidget {
  const NewsSection({super.key, this.symbol});

  /// When non-null the backend filters articles whose title/summary mentions
  /// [symbol] (case-insensitive). Otherwise the general markets feed is
  /// returned.
  final String? symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sym = symbol;
    if (sym != null) {
      return ref.watch(symbolNewsProvider(sym)).maybeWhen(
            data: (items) => items.isEmpty
                ? const SizedBox.shrink()
                : _NewsList(
                    title: 'News on $sym',
                    items: items,
                    // The detail screen already spaces its sections.
                    headerPadding: const EdgeInsets.fromLTRB(16, 0, 8, 10),
                  ),
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
        if (feed.items.isEmpty) {
          return const _NewsShell(
            child: _MessageRow(text: 'No market news at the moment.'),
          );
        }
        return _NewsList(
          title: 'Markets news',
          items: feed.items,
          footer: feed.hasMore
              ? _LoadMoreButton(
                  loading: feed.loadingMore,
                  failed: feed.loadMoreFailed,
                  onPressed: () =>
                      ref.read(marketsNewsProvider.notifier).loadMore(),
                )
              : null,
        );
      },
    );
  }
}

class _NewsList extends StatelessWidget {
  const _NewsList({
    required this.title,
    required this.items,
    this.footer,
    this.headerPadding,
  });
  final String title;
  final List<NewsArticle> items;
  final Widget? footer;
  final EdgeInsets? headerPadding;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        headerPadding == null
            ? SectionHeader(title: title)
            : SectionHeader(title: title, padding: headerPadding!),
        for (final item in items) _NewsTile(article: item),
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
            child: footer,
          ),
      ],
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

class _NewsTile extends StatelessWidget {
  const _NewsTile({required this.article});
  final NewsArticle article;

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
              title: article.title,
              url: article.link,
            ),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              article.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: t.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
                height: 1.3,
              ),
            ),
            if (article.summary.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                article.summary,
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
                          article.source,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: t.labelSmall?.copyWith(
                            color: m.info,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (article.publishedAt != null)
                        Text(
                          '  ·  ${_relative(article.publishedAt!)}',
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

  static String _relative(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${at.day}/${at.month}/${at.year}';
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
