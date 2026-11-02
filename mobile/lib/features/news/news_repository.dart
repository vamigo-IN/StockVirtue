import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../auth/auth_controller.dart';
import 'news_models.dart';

/// A headline from the backend's RSS aggregator (other publishers' stories,
/// opened in the in-app browser). Shown only while the newsroom has no
/// stories of its own to show.
class NewsHeadline {
  final String title;
  final String link;
  final String source;
  final DateTime? publishedAt;
  final String summary;

  const NewsHeadline({
    required this.title,
    required this.link,
    required this.source,
    required this.publishedAt,
    required this.summary,
  });

  factory NewsHeadline.fromJson(Map<String, dynamic> json) => NewsHeadline(
        title: json['title'] as String,
        link: json['link'] as String,
        source: json['source'] as String,
        publishedAt: json['publishedAt'] is String
            ? DateTime.tryParse(json['publishedAt'] as String)
            : null,
        summary: json['summary'] as String? ?? '',
      );
}

/// StockVirtue's own stories (/api/v1/news) plus the old headline feed.
class NewsRepository {
  NewsRepository(this._dio);
  final Dio _dio;

  /// [symbol] is matched as a case-insensitive substring on the title /
  /// summary by the backend. Omit it to get the general markets feed.
  Future<List<NewsHeadline>> headlines({String? symbol, int limit = 20}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/news',
      queryParameters: {
        'limit': limit,
        if (symbol != null && symbol.isNotEmpty) 'symbol': symbol,
      },
    );
    final raw = (res.data!['items'] as List).cast<Map<String, dynamic>>();
    return raw.map(NewsHeadline.fromJson).toList();
  }

  Future<NewsPage> latest({
    int page = 1,
    int limit = 12,
    String? category,
    bool trending = false,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/news',
      queryParameters: {
        'page': page,
        'limit': limit,
        'category': ?category,
        if (trending) 'sort': 'trending',
      },
    );
    return NewsPage.fromJson(res.data!);
  }

  Future<List<NewsCard>> breaking({int limit = 3}) async {
    final res = await _dio.get<List<dynamic>>(
      '/v1/news/breaking',
      queryParameters: {'limit': limit},
    );
    return NewsCard.listFrom(res.data);
  }

  Future<List<NewsCategory>> categories() async {
    final res = await _dio.get<List<dynamic>>('/v1/news/categories');
    return [
      for (final c in res.data ?? const []) ?NewsCategory.fromJson(c),
    ];
  }

  /// Stories tagged with a listed company (NSE symbol).
  Future<NewsPage> stock(String symbol, {int page = 1, int limit = 8}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/news/stocks/${Uri.encodeComponent(symbol.toUpperCase())}',
      queryParameters: {'page': page, 'limit': limit},
    );
    return NewsPage.fromJson(res.data!);
  }

  Future<NewsPage> search(String q, {int page = 1}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/news/search',
      queryParameters: {'q': q, 'page': page, 'limit': 20},
    );
    return NewsPage.fromJson(res.data!);
  }

  /// The whole story, shaped for the native reader.
  Future<NewsArticle> article(String slug) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/news/${Uri.encodeComponent(slug)}',
      queryParameters: {'format': 'app'},
    );
    return NewsArticle.fromJson(res.data!);
  }

  /// One read, for "trending". Best effort: never surfaces an error.
  Future<void> recordView(String id) async {
    try {
      await _dio.post<void>('/v1/news/$id/view');
    } catch (e) {
      if (kDebugMode) debugPrint('[News] view not counted: $e');
    }
  }

  // ── Signed-in reader ────────────────────────────────────────────────

  Future<NewsPage> bookmarks({int page = 1}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/news/bookmarks',
      queryParameters: {'page': page, 'limit': 20},
    );
    return NewsPage.fromJson(res.data!);
  }

  Future<Set<String>> bookmarkIds() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/news/bookmarks/ids');
    return {...((res.data?['ids'] as List?) ?? const []).whereType<String>()};
  }

  Future<void> setBookmarked(String id, bool saved) async {
    if (saved) {
      await _dio.post<void>('/v1/news/$id/bookmark');
    } else {
      await _dio.delete<void>('/v1/news/$id/bookmark');
    }
  }

  Future<NewsAlerts> alerts() async {
    final res = await _dio.get<Map<String, dynamic>>('/v1/news/me/alerts');
    return NewsAlerts.fromJson(res.data!);
  }

  Future<NewsAlerts> setAlerts({bool? breaking, bool? followedStocks}) async {
    final res = await _dio.put<Map<String, dynamic>>(
      '/v1/news/me/alerts',
      data: {
        'breaking': ?breaking,
        'followedStocks': ?followedStocks,
      },
    );
    return NewsAlerts.fromJson(res.data!);
  }

  /// A news push was tapped (for the campaign's open count). Best effort.
  Future<void> pushOpened(String campaignId) async {
    try {
      await _dio.post<void>('/v1/news/push/$campaignId/opened');
    } catch (e) {
      if (kDebugMode) debugPrint('[News] open not counted: $e');
    }
  }
}

final newsRepositoryProvider = Provider<NewsRepository>((ref) {
  return NewsRepository(ref.watch(apiClientProvider).dio);
});

// ── Home "Markets news" ─────────────────────────────────────────────────

/// The home "Markets news" list: StockVirtue's own stories, a page at a
/// time. Until the newsroom has published anything (or on a backend without
/// the newsroom), it falls back to the headline feed, 10 more per
/// "Load more" by growing `limit` (that feed is capped at 100).
class MarketsNewsFeed {
  const MarketsNewsFeed({
    this.stories = const [],
    this.headlines = const [],
    required this.hasMore,
    this.loadingMore = false,
    this.loadMoreFailed = false,
  });

  final List<NewsCard> stories;
  final List<NewsHeadline> headlines;
  final bool hasMore;
  final bool loadingMore;
  final bool loadMoreFailed;

  bool get isEmpty => stories.isEmpty && headlines.isEmpty;

  MarketsNewsFeed copyWith({
    List<NewsCard>? stories,
    List<NewsHeadline>? headlines,
    bool? hasMore,
    bool loadingMore = false,
    bool loadMoreFailed = false,
  }) =>
      MarketsNewsFeed(
        stories: stories ?? this.stories,
        headlines: headlines ?? this.headlines,
        hasMore: hasMore ?? this.hasMore,
        loadingMore: loadingMore,
        loadMoreFailed: loadMoreFailed,
      );
}

class MarketsNewsNotifier extends AsyncNotifier<MarketsNewsFeed> {
  static const pageSize = 10;

  /// The headline feed's hard cap on `limit`.
  static const maxHeadlines = 100;

  int _page = 1;
  int _headlineLimit = pageSize;

  /// Bumped on every (re)build, so a page that lands after a refresh is
  /// dropped instead of mixed into the new list.
  int _generation = 0;

  @override
  Future<MarketsNewsFeed> build() async {
    _generation++;
    _page = 1;
    _headlineLimit = pageSize;
    final repo = ref.watch(newsRepositoryProvider);
    try {
      final first = await repo.latest(limit: pageSize);
      if (first.items.isNotEmpty) {
        return MarketsNewsFeed(stories: first.items, hasMore: first.hasMore);
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[News] newsroom unavailable: $e');
    }
    return _headlines(repo, _headlineLimit);
  }

  Future<MarketsNewsFeed> _headlines(NewsRepository repo, int limit) async {
    final items = await repo.headlines(limit: limit);
    return MarketsNewsFeed(
      headlines: items,
      hasMore: items.length >= limit && limit < maxHeadlines,
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.loadingMore) return;
    state = AsyncData(current.copyWith(loadingMore: true));
    final repo = ref.read(newsRepositoryProvider);
    final generation = _generation;
    bool stale() => !ref.mounted || generation != _generation;
    try {
      if (current.stories.isNotEmpty) {
        final next = await repo.latest(page: _page + 1, limit: pageSize);
        if (stale()) return;
        _page = next.page;
        final seen = {for (final s in current.stories) s.id};
        state = AsyncData(current.copyWith(
          stories: [
            ...current.stories,
            ...next.items.where((s) => !seen.contains(s.id)),
          ],
          hasMore: next.hasMore,
        ));
      } else {
        final limit =
            (_headlineLimit + pageSize).clamp(pageSize, maxHeadlines);
        final feed = await _headlines(repo, limit);
        if (stale()) return;
        _headlineLimit = limit;
        state = AsyncData(feed);
      }
    } catch (_) {
      if (stale()) return;
      // Keep what's on screen; the button offers a retry.
      state = AsyncData(current.copyWith(loadMoreFailed: true));
    }
  }
}

final marketsNewsProvider =
    AsyncNotifierProvider.autoDispose<MarketsNewsNotifier, MarketsNewsFeed>(
  MarketsNewsNotifier.new,
);

/// "News on X" for a stock: stories tagged with it, else headlines that
/// mention it.
typedef SymbolNews = ({List<NewsCard> stories, List<NewsHeadline> headlines});

final symbolNewsProvider =
    FutureProvider.autoDispose.family<SymbolNews, String>((ref, sym) async {
  final repo = ref.watch(newsRepositoryProvider);
  try {
    final page = await repo.stock(sym, limit: 6);
    if (page.items.isNotEmpty) {
      return (stories: page.items, headlines: const <NewsHeadline>[]);
    }
  } catch (e) {
    // 404 = no stories about it yet (or an older backend): fall through.
    if (kDebugMode) debugPrint('[News] no stories for $sym: $e');
  }
  return (
    stories: const <NewsCard>[],
    headlines: await repo.headlines(symbol: sym, limit: 8),
  );
});

// ── The News screen ─────────────────────────────────────────────────────

/// Which list the News screen shows: everything, a category, or most read.
typedef NewsQuery = ({String? category, bool trending});

class NewsFeedState {
  const NewsFeedState({
    required this.items,
    required this.page,
    required this.hasMore,
    this.loadingMore = false,
    this.loadMoreFailed = false,
  });
  final List<NewsCard> items;
  final int page;
  final bool hasMore;
  final bool loadingMore;
  final bool loadMoreFailed;
}

/// A paged story list; [loadMore] appends the next page (skipping repeats,
/// which a story published between pages would otherwise cause).
class NewsFeedNotifier extends AsyncNotifier<NewsFeedState> {
  NewsFeedNotifier(this.query);
  final NewsQuery query;

  static const pageSize = 12;

  /// See [MarketsNewsNotifier._generation].
  int _generation = 0;

  Future<NewsPage> _fetch(int page) =>
      ref.read(newsRepositoryProvider).latest(
            page: page,
            limit: pageSize,
            category: query.category,
            trending: query.trending,
          );

  @override
  Future<NewsFeedState> build() async {
    _generation++;
    ref.watch(newsRepositoryProvider);
    final first = await _fetch(1);
    return NewsFeedState(items: first.items, page: 1, hasMore: first.hasMore);
  }

  Future<void> loadMore() async {
    final s = state.value;
    if (s == null || !s.hasMore || s.loadingMore) return;
    state = AsyncData(NewsFeedState(
      items: s.items,
      page: s.page,
      hasMore: s.hasMore,
      loadingMore: true,
    ));
    final generation = _generation;
    bool stale() => !ref.mounted || generation != _generation;
    try {
      final next = await _fetch(s.page + 1);
      if (stale()) return;
      final seen = {for (final c in s.items) c.id};
      state = AsyncData(NewsFeedState(
        items: [...s.items, ...next.items.where((c) => !seen.contains(c.id))],
        page: next.page,
        hasMore: next.hasMore,
      ));
    } catch (_) {
      if (stale()) return;
      state = AsyncData(NewsFeedState(
        items: s.items,
        page: s.page,
        hasMore: s.hasMore,
        loadMoreFailed: true,
      ));
    }
  }
}

final newsFeedProvider = AsyncNotifierProvider.autoDispose
    .family<NewsFeedNotifier, NewsFeedState, NewsQuery>(NewsFeedNotifier.new);

final newsCategoriesProvider =
    FutureProvider.autoDispose<List<NewsCategory>>((ref) {
  return ref.watch(newsRepositoryProvider).categories();
});

final breakingNewsProvider = FutureProvider.autoDispose<List<NewsCard>>((ref) {
  return ref.watch(newsRepositoryProvider).breaking();
});

final newsSearchProvider =
    FutureProvider.autoDispose.family<NewsPage, String>((ref, q) {
  return ref.watch(newsRepositoryProvider).search(q);
});

final newsArticleProvider =
    FutureProvider.autoDispose.family<NewsArticle, String>((ref, slug) {
  return ref.watch(newsRepositoryProvider).article(slug);
});

// ── Bookmarks (saved on the account) ────────────────────────────────────

/// Ids of the stories this account has saved, shared with the website.
/// Toggling updates the screen at once and undoes just that story if the
/// server says no. If the list can't be loaded the provider is in error
/// (the reader asks again when it opens) rather than showing nothing saved.
class NewsBookmarksNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final signedIn = ref.watch(
      authControllerProvider.select((a) => a.value != null),
    );
    if (!signedIn) return <String>{};
    return ref.read(newsRepositoryProvider).bookmarkIds();
  }

  bool isSaved(String id) => state.value?.contains(id) ?? false;

  /// Returns the new state, or throws (that story restored) when it can't
  /// be saved.
  Future<bool> toggle(String id) async {
    final save = !isSaved(id);
    Set<String> apply(bool saved) {
      final now = {...?state.value};
      return saved ? (now..add(id)) : (now..remove(id));
    }

    state = AsyncData(apply(save));
    try {
      await ref.read(newsRepositoryProvider).setBookmarked(id, save);
      ref.invalidate(savedStoriesProvider);
      return save;
    } catch (_) {
      if (ref.mounted) state = AsyncData(apply(!save));
      rethrow;
    }
  }
}

final newsBookmarksProvider =
    AsyncNotifierProvider<NewsBookmarksNotifier, Set<String>>(
  NewsBookmarksNotifier.new,
);

/// The Saved stories screen's list (first page; most saves fit).
final savedStoriesProvider = FutureProvider.autoDispose<NewsPage>((ref) {
  return ref.watch(newsRepositoryProvider).bookmarks();
});

// ── News alerts (push settings, on the account) ─────────────────────────

class NewsAlertsNotifier extends AsyncNotifier<NewsAlerts> {
  @override
  Future<NewsAlerts> build() => ref.watch(newsRepositoryProvider).alerts();

  Future<void> set({bool? breaking, bool? followedStocks}) async {
    /// The current settings with just these switches changed.
    void show({bool? b, bool? f}) {
      final now = state.value;
      if (now == null) return;
      state = AsyncData(NewsAlerts(
        breaking: b ?? now.breaking,
        followedStocks: f ?? now.followedStocks,
        followedCount: now.followedCount,
      ));
    }

    show(b: breaking, f: followedStocks);
    try {
      await ref
          .read(newsRepositoryProvider)
          .setAlerts(breaking: breaking, followedStocks: followedStocks);
    } catch (_) {
      // Undo only the switch that failed; another may have been saved since.
      if (ref.mounted) {
        show(
          b: breaking == null ? null : !breaking,
          f: followedStocks == null ? null : !followedStocks,
        );
      }
      rethrow;
    }
  }
}

final newsAlertsProvider =
    AsyncNotifierProvider.autoDispose<NewsAlertsNotifier, NewsAlerts>(
  NewsAlertsNotifier.new,
);
