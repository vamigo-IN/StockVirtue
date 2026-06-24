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

final marketsNewsProvider =
    FutureProvider.autoDispose<List<NewsArticle>>((ref) {
  return ref.watch(newsRepositoryProvider).list(limit: 12);
});

final symbolNewsProvider =
    FutureProvider.autoDispose.family<List<NewsArticle>, String>((ref, sym) {
  return ref.watch(newsRepositoryProvider).list(symbol: sym, limit: 8);
});
