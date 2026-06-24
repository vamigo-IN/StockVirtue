import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';

/// One entry in the recently-viewed list. Stored locally — never shipped to
/// the backend. We capture the full instrument identity so the row tap can
/// open SymbolDetailScreen without another lookup.
class RecentSymbol {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final DateTime viewedAt;

  const RecentSymbol({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.viewedAt,
  });

  String get key => '$exchange:$symboltoken';

  Map<String, dynamic> toJson() => {
        'symbol': symbol,
        'tradingsymbol': tradingsymbol,
        'symboltoken': symboltoken,
        'exchange': exchange,
        'viewedAt': viewedAt.toIso8601String(),
      };

  factory RecentSymbol.fromJson(Map<String, dynamic> json) => RecentSymbol(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        viewedAt: DateTime.parse(json['viewedAt'] as String),
      );
}

/// Thin wrapper around secure storage. Only owns serialization — list state
/// lives in the [RecentlyViewedNotifier] in memory so we never race against
/// disk on rapid taps.
class RecentlyViewedStorage {
  RecentlyViewedStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.recentlyViewed';

  Future<List<RecentSymbol>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(RecentSymbol.fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> write(List<RecentSymbol> list) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(list.map((e) => e.toJson()).toList()),
    );
  }

  Future<void> clear() => _storage.delete(key: _key);
}

final recentlyViewedStorageProvider = Provider<RecentlyViewedStorage>((ref) {
  return RecentlyViewedStorage(appSecureStorage);
});

/// Up to ten entries — leaves comfortable headroom over the "last 5" the
/// user expects to see on the home strip without crowding the carousel.
const _maxRecentEntries = 10;

/// Holds the recently-viewed list in memory as the canonical source of
/// truth. Writes to secure-storage happen async after every mutation, so
/// rapid taps that previously raced against the disk now serialize through
/// a single in-memory list and every entry is preserved.
class RecentlyViewedNotifier extends AsyncNotifier<List<RecentSymbol>> {
  @override
  Future<List<RecentSymbol>> build() async {
    return ref.read(recentlyViewedStorageProvider).read();
  }

  Future<void> record({
    required String symbol,
    required String tradingsymbol,
    required String symboltoken,
    required String exchange,
  }) async {
    // Skip records that would collapse to an empty key — those would dedupe
    // every other entry to a single placeholder row.
    if (symboltoken.isEmpty || exchange.isEmpty) return;

    // Wait for the initial storage read to land so we don't shadow on-disk
    // history with a list containing only this one entry.
    final existing = state.value ?? await future;
    final entry = RecentSymbol(
      symbol: symbol,
      tradingsymbol: tradingsymbol,
      symboltoken: symboltoken,
      exchange: exchange,
      viewedAt: DateTime.now(),
    );
    // In-memory dedupe + prepend + trim. No round-trip to storage.
    final filtered = existing.where((e) => e.key != entry.key).toList();
    final next = [entry, ...filtered].take(_maxRecentEntries).toList();
    state = AsyncData(next);

    // Best-effort persistence. A failure here is non-fatal (we'll still
    // show the in-memory list this session); log so it's debuggable.
    unawaited(_persist(next));
  }

  Future<void> _persist(List<RecentSymbol> list) async {
    try {
      await ref.read(recentlyViewedStorageProvider).write(list);
    } catch (e, st) {
      debugPrint('Recently-viewed persist failed: $e\n$st');
    }
  }
}

final recentlyViewedProvider = AsyncNotifierProvider<RecentlyViewedNotifier,
    List<RecentSymbol>>(RecentlyViewedNotifier.new);
