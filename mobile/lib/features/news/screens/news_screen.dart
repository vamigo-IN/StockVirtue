import 'dart:async';
import 'dart:math' show min;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/error_retry_view.dart';
import '../news_models.dart';
import '../news_repository.dart';
import '../widgets/news_separate_section.dart';
import '../widgets/news_tiles.dart';

/// All of StockVirtue's news: latest or most read, by category, with
/// breaking stories on top, search, and the reader's saved stories.
/// Sections the latest list leaves out (Official updates) have their chip
/// up front and a block of their own in the Latest view.
class NewsScreen extends ConsumerStatefulWidget {
  const NewsScreen({super.key});

  @override
  ConsumerState<NewsScreen> createState() => _NewsScreenState();
}

class _NewsScreenState extends ConsumerState<NewsScreen> {
  /// Stories in the Latest view before the separate sections' blocks: the
  /// website's front shows six Top stories on a phone, then Official updates.
  static const _storiesBeforeSections = 6;

  final _scroll = ScrollController();
  String? _category;
  bool _trending = false;

  NewsQuery get _query => (category: _category, trending: _trending);

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  /// Shows another list, from its top.
  void _show({String? category, bool trending = false}) {
    setState(() {
      _category = category;
      _trending = trending;
    });
    if (_scroll.hasClients) _scroll.jumpTo(0);
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(newsFeedProvider(_query));
    final all =
        ref.watch(newsCategoriesProvider).value ?? const <NewsCategory>[];
    final separate = [for (final c in all) if (c.keepSeparate) c];
    final categories = [
      ...separate,
      for (final c in all) if (!c.keepSeparate) c,
    ];
    final latest = !_trending && _category == null;
    final breaking = latest
        ? ref.watch(breakingNewsProvider).value ?? const <NewsCard>[]
        : const <NewsCard>[];
    final sections = latest
        ? [
            for (final c in separate)
              SeparateNewsSection(
                category: c,
                onSeeAll: () => _show(category: c.slug),
              ),
          ]
        : const <Widget>[];
    return Scaffold(
      appBar: AppBar(
        title: const Text('News', style: TextStyle(fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            tooltip: 'Search news',
            icon: const Icon(Icons.search_rounded),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const NewsSearchScreen()),
            ),
          ),
          IconButton(
            tooltip: 'Saved stories',
            icon: const Icon(Icons.bookmarks_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SavedStoriesScreen()),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () {
          ref.invalidate(breakingNewsProvider);
          ref.invalidate(newsCategoriesProvider);
          ref.invalidate(separateNewsProvider);
          return ref.refresh(newsFeedProvider(_query).future);
        },
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            // Only the feed itself (not the sideways category chips), and
            // after a failed page only the retry button asks again.
            if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
            final s = ref.read(newsFeedProvider(_query)).value;
            if (s == null || s.loadMoreFailed) return false;
            if (n.metrics.pixels > n.metrics.maxScrollExtent - 600) {
              ref.read(newsFeedProvider(_query).notifier).loadMore();
            }
            return false;
          },
          child: ListView(
            controller: _scroll,
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              SizedBox(
                height: 52,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  children: [
                    _Choice(
                      label: 'Latest',
                      selected: latest,
                      onTap: () => _show(),
                    ),
                    _Choice(
                      label: 'Most read',
                      selected: _trending,
                      onTap: () => _show(trending: true),
                    ),
                    for (final c in categories)
                      _Choice(
                        label: c.name,
                        selected: !_trending && _category == c.slug,
                        onTap: () => _show(category: c.slug),
                      ),
                  ],
                ),
              ),
              BreakingStrip(cards: breaking),
              ...feed.when(
                skipLoadingOnRefresh: true,
                loading: () => const [
                  Padding(
                    padding: EdgeInsets.all(48),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ],
                error: (err, _) => [
                  ErrorRetryView(
                    error: err,
                    errorContext: 'news',
                    compact: true,
                    onRetry: () => ref.invalidate(newsFeedProvider(_query)),
                  ),
                ],
                data: (s) => _stories(context, s, sections),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// The list, with [sections] (the separate sections' blocks, Latest view
  /// only) after its first few stories.
  List<Widget> _stories(
    BuildContext context,
    NewsFeedState s,
    List<Widget> sections,
  ) {
    final t = Theme.of(context).textTheme;
    if (s.items.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.all(40),
          child: Text(
            _trending
                ? 'Nothing has been read much yet today.'
                : 'No stories here yet.',
            textAlign: TextAlign.center,
            style: t.bodyMedium,
          ),
        ),
        ...sections,
      ];
    }
    final lead = !_trending && s.items.first.image != null;
    final tiles = [
      if (lead) NewsHeroCard(card: s.items.first),
      for (final c in lead ? s.items.skip(1) : s.items) NewsListTile(card: c),
    ];
    final at = min(_storiesBeforeSections, tiles.length);
    return [
      ...tiles.take(at),
      ...sections,
      ...tiles.skip(at),
      if (s.loadingMore)
        const Padding(
          padding: EdgeInsets.all(16),
          child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
        )
      else if (s.loadMoreFailed)
        Center(
          child: TextButton(
            onPressed: () =>
                ref.read(newsFeedProvider(_query).notifier).loadMore(),
            child: const Text("Couldn't load more — try again"),
          ),
        )
      else if (!s.hasMore && s.items.length > 6)
        Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            'You’re all caught up.',
            textAlign: TextAlign.center,
            style: t.bodySmall,
          ),
        ),
    ];
  }
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(
        label: Text(label),
        selected: selected,
        onSelected: (_) => onTap(),
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

/// The stories this account saved (here or on the website).
class SavedStoriesScreen extends ConsumerWidget {
  const SavedStoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(savedStoriesProvider);
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Saved stories',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(savedStoriesProvider.future),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => ListView(
            children: [
              ErrorRetryView(
                error: err,
                errorContext: 'news',
                onRetry: () => ref.invalidate(savedStoriesProvider),
              ),
            ],
          ),
          data: (page) => page.items.isEmpty
              ? ListView(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(32, 80, 32, 0),
                      child: Column(
                        children: [
                          Icon(
                            Icons.bookmark_border_rounded,
                            size: 44,
                            color: Theme.of(context).colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'No saved stories yet',
                            style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            'Tap the bookmark on a story to read it later. Stories you save on stockvirtue.com show up here too.',
                            textAlign: TextAlign.center,
                            style: t.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                )
              : ListView(
                  padding: const EdgeInsets.only(top: 8, bottom: 32),
                  children: [
                    for (final c in page.items) NewsListTile(card: c),
                    if (page.hasMore)
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          'Showing your ${page.items.length} most recent saves.',
                          textAlign: TextAlign.center,
                          style: t.bodySmall,
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Searches StockVirtue's stories (headline, summary and text).
class NewsSearchScreen extends ConsumerStatefulWidget {
  const NewsSearchScreen({super.key});

  @override
  ConsumerState<NewsSearchScreen> createState() => _NewsSearchScreenState();
}

class _NewsSearchScreenState extends ConsumerState<NewsSearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _query = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final ready = _query.length >= 2;
    final async = ready ? ref.watch(newsSearchProvider(_query)) : null;
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            hintText: 'Search news',
            border: InputBorder.none,
          ),
          onChanged: _onChanged,
          onSubmitted: (v) => setState(() => _query = v.trim()),
        ),
      ),
      body: !ready
          ? Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                'Search StockVirtue stories by company, topic or headline.',
                textAlign: TextAlign.center,
                style: t.bodySmall,
              ),
            )
          : async!.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => ErrorRetryView(
                error: err,
                errorContext: 'news',
                compact: true,
                onRetry: () => ref.invalidate(newsSearchProvider(_query)),
              ),
              data: (page) => page.items.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(32),
                      child: Text(
                        'No stories match “$_query”.',
                        textAlign: TextAlign.center,
                        style: t.bodyMedium,
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.only(top: 8, bottom: 32),
                      children: [
                        for (final c in page.items) NewsListTile(card: c),
                      ],
                    ),
            ),
    );
  }
}
