import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';

/// A single bookmarked stock. Bookmarks are lighter-weight than watchlists:
/// no naming, no folders — just a star you tap on a symbol-detail screen.
/// Persisted locally, never synced to the backend.
class BookmarkedSymbol {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final DateTime starredAt;

  const BookmarkedSymbol({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.starredAt,
  });

  String get key => '$exchange:$symboltoken';

  Map<String, dynamic> toJson() => {
        'symbol': symbol,
        'tradingsymbol': tradingsymbol,
        'symboltoken': symboltoken,
        'exchange': exchange,
        'starredAt': starredAt.toIso8601String(),
      };

  factory BookmarkedSymbol.fromJson(Map<String, dynamic> json) =>
      BookmarkedSymbol(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        starredAt: DateTime.parse(json['starredAt'] as String),
      );
}

class BookmarksStorage {
  BookmarksStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.bookmarks';

  Future<List<BookmarkedSymbol>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(BookmarkedSymbol.fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> write(List<BookmarkedSymbol> list) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(list.map((b) => b.toJson()).toList()),
    );
  }
}

final bookmarksStorageProvider = Provider<BookmarksStorage>((ref) {
  return BookmarksStorage(appSecureStorage);
});

/// In-memory bookmarks list. Same race-free pattern as recently-viewed —
/// toggle mutates the cached list immediately, persistence happens async.
class BookmarksNotifier extends AsyncNotifier<List<BookmarkedSymbol>> {
  @override
  Future<List<BookmarkedSymbol>> build() =>
      ref.read(bookmarksStorageProvider).read();

  Future<void> toggle({
    required String symbol,
    required String tradingsymbol,
    required String symboltoken,
    required String exchange,
  }) async {
    if (symboltoken.isEmpty || exchange.isEmpty) return;
    final existing = state.value ?? await future;
    final key = '$exchange:$symboltoken';
    final hasIt = existing.any((b) => b.key == key);
    final next = hasIt
        ? existing.where((b) => b.key != key).toList()
        : [
            BookmarkedSymbol(
              symbol: symbol,
              tradingsymbol: tradingsymbol,
              symboltoken: symboltoken,
              exchange: exchange,
              starredAt: DateTime.now(),
            ),
            ...existing,
          ];
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  bool isBookmarked(String exchange, String symboltoken) {
    final list = state.value ?? const [];
    return list.any((b) => b.key == '$exchange:$symboltoken');
  }

  Future<void> _persist(List<BookmarkedSymbol> list) async {
    try {
      await ref.read(bookmarksStorageProvider).write(list);
    } catch (e, st) {
      debugPrint('Bookmarks persist failed: $e\n$st');
    }
  }
}

final bookmarksProvider = AsyncNotifierProvider<BookmarksNotifier,
    List<BookmarkedSymbol>>(BookmarksNotifier.new);

/// Tiny selector so individual cards can rebuild only when their own
/// bookmarked state changes.
final isBookmarkedProvider =
    Provider.family<bool, String>((ref, key) {
  final list = ref.watch(bookmarksProvider).value ?? const [];
  return list.any((b) => b.key == key);
});
