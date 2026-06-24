import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/quote.dart';
import '../../data/models/watchlist.dart';

class WatchlistQuotes {
  final String watchlistId;
  final DateTime fetchedAt;
  /// keyed by `${exchange}:${symboltoken}`
  final Map<String, Quote> quotes;
  const WatchlistQuotes({
    required this.watchlistId,
    required this.fetchedAt,
    required this.quotes,
  });
}

class WatchlistsRepository {
  WatchlistsRepository(this._dio);
  final Dio _dio;

  Future<List<Watchlist>> list() async {
    final res = await _dio.get<List<dynamic>>('/watchlists');
    return res.data!
        .map((e) => Watchlist.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Watchlist> create(String name) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/watchlists',
      data: {'name': name},
    );
    return Watchlist.fromJson({...res.data!, 'items': []});
  }

  Future<Watchlist> rename(String id, String name) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      '/watchlists/$id',
      data: {'name': name},
    );
    return Watchlist.fromJson({...res.data!, 'items': []});
  }

  Future<void> delete(String id) async {
    await _dio.delete('/watchlists/$id');
  }

  Future<WatchlistItem> addItem(
    String watchlistId,
    String symbol,
    String exchange,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/watchlists/$watchlistId/items',
      data: {'symbol': symbol, 'exchange': exchange},
    );
    return WatchlistItem.fromJson(res.data!);
  }

  Future<void> removeItem(String watchlistId, String itemId) async {
    await _dio.delete('/watchlists/$watchlistId/items/$itemId');
  }

  /// Persists a new item ordering. [itemIds] must enumerate every item in
  /// the watchlist exactly once — the backend rejects partial reorderings
  /// to prevent accidental drops.
  Future<void> reorderItems(String watchlistId, List<String> itemIds) async {
    await _dio.patch<Map<String, dynamic>>(
      '/watchlists/$watchlistId/items/order',
      data: {'itemIds': itemIds},
    );
  }

  Future<WatchlistQuotes> quotes(String watchlistId) async {
    final res =
        await _dio.get<Map<String, dynamic>>('/watchlists/$watchlistId/quotes');
    final data = res.data!;
    final items = (data['items'] as List).cast<Map<String, dynamic>>();
    final map = <String, Quote>{};
    for (final item in items) {
      final q = Quote.fromJson(item['quote'] as Map<String, dynamic>?);
      if (q != null) {
        map['${item['exchange']}:${item['symboltoken']}'] = q;
      }
    }
    return WatchlistQuotes(
      watchlistId: watchlistId,
      fetchedAt: DateTime.tryParse(data['fetchedAt'] as String? ?? '') ??
          DateTime.now(),
      quotes: map,
    );
  }
}

final watchlistsRepositoryProvider = Provider<WatchlistsRepository>((ref) {
  return WatchlistsRepository(ref.watch(apiClientProvider).dio);
});
