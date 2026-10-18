import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

class NewsArticle {
  final String title;
  final String link;
  final String source;
  final DateTime? publishedAt;
  final String summary;

  const NewsArticle({
    required this.title,
    required this.link,
    required this.source,
    required this.publishedAt,
    required this.summary,
  });

  factory NewsArticle.fromJson(Map<String, dynamic> json) => NewsArticle(
        title: json['title'] as String,
        link: json['link'] as String,
        source: json['source'] as String,
        publishedAt: json['publishedAt'] is String
            ? DateTime.tryParse(json['publishedAt'] as String)
            : null,
        summary: json['summary'] as String? ?? '',
      );
}

class NewsRepository {
  NewsRepository(this._dio);
  final Dio _dio;

  /// [symbol] is matched as a case-insensitive substring on the title /
  /// summary by the backend. Omit it to get the general markets feed.
  Future<List<NewsArticle>> list({String? symbol, int limit = 20}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/news',
      queryParameters: {
        'limit': limit,
        if (symbol != null && symbol.isNotEmpty) 'symbol': symbol,
      },
    );
    final raw = (res.data!['items'] as List).cast<Map<String, dynamic>>();
    return raw.map(NewsArticle.fromJson).toList();
  }
}

final newsRepositoryProvider = Provider<NewsRepository>((ref) {
  return NewsRepository(ref.watch(apiClientProvider).dio);
});

/// The home "Markets news" list: 10 articles first, 10 more per
/// [MarketsNewsNotifier.loadMore]. Pages by growing `limit` (the backend
/// serves newest-first from one cache, capped at 100), so every backend
/// version pages correctly and a refreshed feed never yields duplicates.
class MarketsNewsFeed {
  const MarketsNewsFeed({
    required this.items,
    required this.hasMore,
    this.loadingMore = false,
    this.loadMoreFailed = false,
  });

  final List<NewsArticle> items;
  final bool hasMore;
  final bool loadingMore;
  final bool loadMoreFailed;
}

class MarketsNewsNotifier extends AsyncNotifier<MarketsNewsFeed> {
  static const pageSize = 10;

  /// The backend's hard cap on `limit`.
  static const maxItems = 100;

  int _limit = pageSize;

  @override
  Future<MarketsNewsFeed> build() async {
    _limit = pageSize;
    return _fetch(ref.watch(newsRepositoryProvider), _limit);
  }

  Future<MarketsNewsFeed> _fetch(NewsRepository repo, int limit) async {
    final items = await repo.list(limit: limit);
    return MarketsNewsFeed(
      items: items,
      hasMore: items.length >= limit && limit < maxItems,
    );
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || !current.hasMore || current.loadingMore) return;
    state = AsyncData(
      MarketsNewsFeed(
        items: current.items,
        hasMore: current.hasMore,
        loadingMore: true,
      ),
    );
    final next = (_limit + pageSize).clamp(pageSize, maxItems);
    try {
      final feed = await _fetch(ref.read(newsRepositoryProvider), next);
      if (!ref.mounted) return;
      _limit = next;
      state = AsyncData(feed);
    } catch (_) {
      if (!ref.mounted) return;
      // Keep what's on screen; the button offers a retry.
      state = AsyncData(
        MarketsNewsFeed(
          items: current.items,
          hasMore: current.hasMore,
          loadMoreFailed: true,
        ),
      );
    }
  }
}

final marketsNewsProvider =
    AsyncNotifierProvider.autoDispose<MarketsNewsNotifier, MarketsNewsFeed>(
  MarketsNewsNotifier.new,
);

final symbolNewsProvider =
    FutureProvider.autoDispose.family<List<NewsArticle>, String>((ref, sym) {
  return ref.watch(newsRepositoryProvider).list(symbol: sym, limit: 8);
});
