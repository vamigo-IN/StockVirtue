import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';

/// Per-order trader notes. Stored locally in secure storage so the user can
/// jot down the rationale for a trade ("breakout above 50DMA on volume",
/// "earnings tomorrow, hedged with PE") without anything ever leaving the
/// device. A real-app extension would PATCH the note to the backend but
/// for the paper-trading sim local-only is honest enough.
class TradeNotesStorage {
  TradeNotesStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.tradeNotes';

  Future<Map<String, String>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const {};
    try {
      final m = (jsonDecode(raw) as Map).cast<String, dynamic>();
      return m.map((k, v) => MapEntry(k, v as String));
    } catch (_) {
      return const {};
    }
  }

  Future<void> write(Map<String, String> notes) async {
    await _storage.write(key: _key, value: jsonEncode(notes));
  }
}

final tradeNotesStorageProvider = Provider<TradeNotesStorage>((ref) {
  return TradeNotesStorage(appSecureStorage);
});

class TradeNotesNotifier extends AsyncNotifier<Map<String, String>> {
  @override
  Future<Map<String, String>> build() =>
      ref.read(tradeNotesStorageProvider).read();

  Future<void> set(String orderId, String note) async {
    final cur = state.value ?? await future;
    final next = Map<String, String>.from(cur);
    final trimmed = note.trim();
    if (trimmed.isEmpty) {
      next.remove(orderId);
    } else {
      next[orderId] = trimmed;
    }
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> _persist(Map<String, String> notes) async {
    try {
      await ref.read(tradeNotesStorageProvider).write(notes);
    } catch (e, st) {
      debugPrint('Trade-notes persist failed: $e\n$st');
    }
  }
}

final tradeNotesProvider =
    AsyncNotifierProvider<TradeNotesNotifier, Map<String, String>>(
  TradeNotesNotifier.new,
);

/// Lookup helper — returns null when no note exists for this order.
final tradeNoteProvider = Provider.family<String?, String>((ref, orderId) {
  final notes = ref.watch(tradeNotesProvider).value ?? const {};
  return notes[orderId];
});
