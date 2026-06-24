import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../news_repository.dart';
import '../screens/article_screen.dart';

/// Renders the latest articles from the backend RSS aggregator. Used on
/// the home tab (markets feed) and on the symbol-detail screen (filtered
/// to that symbol). Self-hides when no articles match.
class NewsSection extends ConsumerWidget {
  const NewsSection({super.key, this.symbol});

  /// When non-null the backend filters articles whose title/summary mentions
  /// [symbol] (case-insensitive). Otherwise the general markets feed is
  /// returned.
  final String? symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = symbol == null
        ? ref.watch(marketsNewsProvider)
        : ref.watch(symbolNewsProvider(symbol!));
    final scheme = Theme.of(context).colorScheme;
    final title = symbol == null ? 'Markets news' : 'News on $symbol';
    return async.when(
      loading: () => _ShellWithSpinner(title: title),
      error: (_, _) => const SizedBox.shrink(),
      data: (items) {
        if (items.isEmpty) {
          // Symbol-specific news may legitimately have nothing today; hide
          // rather than showing an empty header.
          if (symbol != null) return const SizedBox.shrink();
          return _ShellEmpty(title: title);
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: const Color(0xFF6366F1).withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.newspaper_outlined,
                      color: Color(0xFF6366F1),
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      '${items.length}',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            for (final item in items) _NewsTile(article: item),
          ],
        );
      },
    );
  }
}

class _NewsTile extends StatelessWidget {
  const _NewsTile({required this.article});
  final NewsArticle article;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ArticleScreen(
              title: article.title,
              url: article.link,
            ),
          ),
        ),
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
              Text(
                article.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  height: 1.3,
                ),
              ),
              if (article.summary.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  article.summary,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurface.withValues(alpha: 0.65),
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 8),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color:
                          const Color(0xFF6366F1).withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      article.source,
                      style: const TextStyle(
                        color: Color(0xFF6366F1),
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (article.publishedAt != null)
                    Text(
                      _relative(article.publishedAt!),
                      style: TextStyle(
                        fontSize: 11,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  const Spacer(),
                  Icon(
                    Icons.arrow_outward,
                    size: 13,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _relative(DateTime at) {
    final diff = DateTime.now().difference(at);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${at.day}/${at.month}/${at.year}';
  }
}

class _ShellWithSpinner extends StatelessWidget {
  const _ShellWithSpinner({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          const SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(width: 10),
          Text(
            'Loading $title…',
            style: TextStyle(
              fontSize: 12.5,
              color:
                  Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}

class _ShellEmpty extends StatelessWidget {
  const _ShellEmpty({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Text(
        '$title — temporarily unavailable',
        style: TextStyle(
          fontSize: 12.5,
          color:
              Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
        ),
      ),
    );
  }
}
