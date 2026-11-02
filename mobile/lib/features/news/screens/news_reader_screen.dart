import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/config.dart';
import '../../../core/design/tokens.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_format.dart';
import '../news_models.dart';
import '../news_repository.dart';
import '../reader/doc_view.dart';
import '../reader/story_links.dart';
import '../reader/story_widgets.dart';
import '../widgets/news_tiles.dart';

/// The newest document version this reader understands (see the server's
/// APP_DOC_VERSION). A newer one opens the story on the website instead.
const kReaderDocVersion = 1;

/// A StockVirtue story, drawn natively from the newsroom's stored document.
class NewsReaderScreen extends ConsumerStatefulWidget {
  const NewsReaderScreen({
    super.key,
    required this.slug,
    this.preview,
    this.campaignId,
  });

  final String slug;

  /// The card the reader tapped, shown while the full story loads.
  final NewsCard? preview;

  /// Set when opened from a news push, to count the open.
  final String? campaignId;

  @override
  ConsumerState<NewsReaderScreen> createState() => _NewsReaderScreenState();
}

class _NewsReaderScreenState extends ConsumerState<NewsReaderScreen> {
  late final NewsRepository _repo;
  String? _counted;

  @override
  void initState() {
    super.initState();
    _repo = ref.read(newsRepositoryProvider);
    // The saved-story list failed to load earlier: try again now.
    if (ref.read(newsBookmarksProvider).hasError) {
      ref.invalidate(newsBookmarksProvider);
    }
    final campaign = widget.campaignId;
    if (campaign != null) _repo.pushOpened(campaign);
    // One read per opening, once the story has loaded.
    ref.listenManual(
      newsArticleProvider(widget.slug),
      (_, next) => next.whenData(_countView),
      fireImmediately: true,
    );
  }

  void _countView(NewsArticle a) {
    if (_counted == a.id) return;
    _counted = a.id;
    _repo.recordView(a.id);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(newsArticleProvider(widget.slug));
    final card = async.value?.card ?? widget.preview;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          card?.category?.name ?? 'News',
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        actions: [
          if (card != null) ...[
            _BookmarkButton(id: card.id),
            IconButton(
              tooltip: 'Share',
              icon: const Icon(Icons.ios_share_rounded),
              onPressed: () => SharePlus.instance.share(
                ShareParams(
                  text: '${card.title}\n${newsArticleUrl(card.slug)}',
                  subject: card.title,
                ),
              ),
            ),
          ],
        ],
      ),
      body: async.when(
        skipLoadingOnRefresh: true,
        loading: () => card == null
            ? const Center(child: CircularProgressIndicator())
            : _ReaderBody(card: card, article: null),
        error: (err, _) {
          final gone = err is DioException && err.response?.statusCode == 404;
          return SafeArea(
            child: ErrorRetryView(
              error: gone
                  ? 'This story isn’t available. It may have been taken down.'
                  : err,
              errorContext: 'news',
              onRetry: gone
                  ? null
                  : () => ref.invalidate(newsArticleProvider(widget.slug)),
            ),
          );
        },
        data: (a) => RefreshIndicator(
          onRefresh: () =>
              ref.refresh(newsArticleProvider(widget.slug).future),
          child: _ReaderBody(card: a.card, article: a),
        ),
      ),
    );
  }
}

class _BookmarkButton extends ConsumerWidget {
  const _BookmarkButton({required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(
      newsBookmarksProvider.select((s) => s.value?.contains(id) ?? false),
    );
    return IconButton(
      tooltip: saved ? 'Remove from saved' : 'Save story',
      icon: Icon(
        saved ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
      ),
      onPressed: () async {
        final messenger = ScaffoldMessenger.of(context);
        try {
          final now = await ref.read(newsBookmarksProvider.notifier).toggle(id);
          messenger.showSnackBar(SnackBar(
            duration: const Duration(seconds: 2),
            content: Text(now ? 'Saved to your stories' : 'Removed from saved'),
          ));
        } catch (_) {
          messenger.showSnackBar(const SnackBar(
            content: Text('Couldn’t update your saved stories. Try again.'),
          ));
        }
      },
    );
  }
}

class _ReaderBody extends StatelessWidget {
  const _ReaderBody({required this.card, required this.article});
  final NewsCard card;

  /// Null while loading (the header shows from the tapped card).
  final NewsArticle? article;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final a = article;
    final url = newsArticleUrl(card.slug);
    const side = EdgeInsets.symmetric(horizontal: 16);
    final published = a?.firstPublishedAt ?? card.publishedAt;
    return SelectionArea(
      child: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          if (a?.retractedAt != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: InfoBanner(
                tone: BannerTone.danger,
                icon: Icons.warning_amber_rounded,
                title: 'This story has been retracted on ${istDateTime(a!.retractedAt!)}.',
                message: a.retractionNote ?? 'It is kept here for the record.',
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: NewsLabels(card: card),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              card.title,
              style: t.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                height: 1.2,
              ),
            ),
          ),
          if (card.subtitle != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(
                card.subtitle!,
                style: t.titleMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  height: 1.4,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _Byline(card: card, published: published, article: a),
          ),
          if (card.isAiGenerated)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: InfoBanner(
                icon: Icons.smart_toy_outlined,
                message:
                    'AI tools helped prepare this story. It was approved for publication by the StockVirtue newsroom.',
              ),
            ),
          if (card.image != null) ...[
            const SizedBox(height: 16),
            NewsPicture(image: card.image!, radius: 0, aspectRatio: 16 / 9),
            if (a?.imageCaption != null || card.image!.credit != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
                child: Text(
                  [?a?.imageCaption, ?card.image!.credit].join(' · '),
                  style: t.bodySmall,
                ),
              ),
          ],
          const SizedBox(height: 18),
          if (a == null)
            const Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (a.doc == null || a.docVersion > kReaderDocVersion)
            Padding(padding: side, child: StoryFallbackCard(url: url))
          else
            Padding(
              padding: side,
              child: StoryDocView(doc: a.doc!, articleUrl: url),
            ),
          if (a != null) ..._after(context, a),
        ],
      ),
    );
  }

  List<Widget> _after(BuildContext context, NewsArticle a) {
    final t = Theme.of(context).textTheme;
    return [
      if (a.correctionNote != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: InfoBanner(
            tone: BannerTone.warning,
            icon: Icons.edit_note_rounded,
            title: 'Correction',
            message: a.correctionNote!,
          ),
        ),
      if (a.sources.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Sources', style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              for (final s in a.sources)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: s.url == null
                      ? Text(
                          [s.name, ?s.note].join(' · '),
                          style: t.bodySmall,
                        )
                      : InkWell(
                          onTap: () => openStoryLink(context, s.url!),
                          child: Text.rich(TextSpan(children: [
                            TextSpan(
                              text: s.name,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.primary,
                                decoration: TextDecoration.underline,
                              ),
                            ),
                            if (s.note != null) TextSpan(text: ' · ${s.note}'),
                          ]), style: t.bodySmall),
                        ),
                ),
            ],
          ),
        ),
      if (a.stocks.isNotEmpty || a.tags.isNotEmpty)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: _Chips(article: a),
        ),
      if (a.card.author?.bio != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
          child: AppCard(
            radius: AppRadius.md,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Avatar(author: a.card.author!, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        a.card.author!.name,
                        style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(a.card.author!.bio!, style: t.bodySmall?.copyWith(height: 1.45)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      if (a.related.isNotEmpty) ...[
        const SectionHeader(title: 'Related stories'),
        for (final c in a.related) NewsListTile(card: c),
      ],
    ];
  }
}

class _Byline extends StatelessWidget {
  const _Byline({required this.card, required this.published, this.article});
  final NewsCard card;
  final DateTime? published;
  final NewsArticle? article;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final updated = article?.wasUpdated == true ? card.updatedAt : null;
    final meta = [
      if (published != null) istDateTime(published!),
      if (updated != null) 'Updated ${istClock(updated)}',
      '${card.readingMinutes} min read',
    ].join(' · ');
    return Row(
      children: [
        if (card.author != null) ...[
          _Avatar(author: card.author!, size: 32),
          const SizedBox(width: 10),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                card.author?.name ?? 'StockVirtue Newsroom',
                style: t.labelLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(meta, style: t.labelSmall?.copyWith(color: scheme.onSurfaceVariant)),
            ],
          ),
        ),
      ],
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.author, required this.size});
  final NewsAuthorRef author;
  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final initial = author.name.isEmpty ? '?' : author.name[0].toUpperCase();
    final fallback = CircleAvatar(
      radius: size / 2,
      backgroundColor: scheme.primary.withValues(alpha: 0.15),
      child: Text(
        initial,
        style: TextStyle(
          color: scheme.primary,
          fontWeight: FontWeight.w800,
          fontSize: size * 0.42,
        ),
      ),
    );
    final url = author.avatarUrl;
    if (url == null) return fallback;
    return ClipOval(
      child: Image.network(
        url,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
      ),
    );
  }
}

/// Companies (open the app's stock screen) and topics.
class _Chips extends ConsumerWidget {
  const _Chips({required this.article});
  final NewsArticle article;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final s in article.stocks)
          ActionChip(
            avatar: const Icon(Icons.show_chart_rounded, size: 16),
            label: Text(s.name == null ? s.symbol : '${s.symbol} · ${s.name}'),
            onPressed: () => openStoryStock(context, ref, s.exchange, s.symbol),
          ),
        for (final tag in article.tags)
          Chip(
            label: Text('#${tag.name}'),
            backgroundColor: scheme.surface,
          ),
      ],
    );
  }
}
