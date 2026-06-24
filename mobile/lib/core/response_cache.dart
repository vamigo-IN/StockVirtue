import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'secure_storage.dart';

/// Tiny last-known-good cache for handful of API endpoints. Lives in
/// secure storage so it survives app restarts. The whole point is
/// graceful-degradation when the network drops mid-session — every
/// repository that opts in calls [withCache] and gets either the live
/// response (cached as a side-effect) or, on error, the most recently
/// cached payload.
///
/// We don't try to be a real cache — no TTL invalidation, no LRU, no
/// per-resource size cap. The number of keys is fixed (portfolio,
/// watchlists, orders, indices) and each payload is small.
class ResponseCache {
  ResponseCache(this._storage);
  final FlutterSecureStorage _storage;

  Future<void> write(String key, Object value) async {
    try {
      await _storage.write(
        key: 'stockvirtue.cache.$key',
        value: jsonEncode(value),
      );
    } catch (e, st) {
      debugPrint('ResponseCache write($key) failed: $e\n$st');
    }
  }

  Future<T?> read<T>(String key) async {
    try {
      final raw = await _storage.read(key: 'stockvirtue.cache.$key');
      if (raw == null || raw.isEmpty) return null;
      return jsonDecode(raw) as T;
    } catch (_) {
      return null;
    }
  }
}

final responseCacheProvider = Provider<ResponseCache>((ref) {
  return ResponseCache(appSecureStorage);
});

/// Wraps [fetch] with stale-on-error semantics. On a successful fetch we
/// cache the JSON-able [serialize] result; on failure we look up the last
/// good payload and pass it through [deserialize] to reconstruct the model.
/// If nothing was ever cached, the original exception re-throws so the
/// caller's normal error path still kicks in.
Future<T> withCache<T>({
  required ResponseCache cache,
  required String key,
  required Future<T> Function() fetch,
  required Object Function(T value) serialize,
  required T Function(Object json) deserialize,
}) async {
  try {
    final fresh = await fetch();
    unawaited(cache.write(key, serialize(fresh)));
    return fresh;
  } catch (err) {
    final cached = await cache.read<Object>(key);
    if (cached == null) rethrow;
    return deserialize(cached);
  }
}
