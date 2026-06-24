import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';

/// One annotation on the price chart. Stored in **canvas-normalised** space
/// (each coordinate is in [0,1] relative to the chart's drawable rect) so
/// drawings stick to the viewport rather than to absolute prices/times.
/// Switching range chips therefore keeps the drawing on screen even though
/// it may no longer line up with the same price — acceptable for a first-
/// pass; we can upgrade to price/time-anchored later if needed.
class ChartDrawing {
  /// Two points: trendline uses both; horizontal uses [a.dy] only.
  final Offset a;
  final Offset b;
  final ChartDrawingKind kind;
  final int createdAtMs;

  const ChartDrawing({
    required this.a,
    required this.b,
    required this.kind,
    required this.createdAtMs,
  });

  Map<String, dynamic> toJson() => {
        'ax': a.dx,
        'ay': a.dy,
        'bx': b.dx,
        'by': b.dy,
        'kind': kind.name,
        'at': createdAtMs,
      };

  factory ChartDrawing.fromJson(Map<String, dynamic> json) => ChartDrawing(
        a: Offset(
          (json['ax'] as num).toDouble(),
          (json['ay'] as num).toDouble(),
        ),
        b: Offset(
          (json['bx'] as num).toDouble(),
          (json['by'] as num).toDouble(),
        ),
        kind: ChartDrawingKind.values.firstWhere(
          (k) => k.name == json['kind'],
          orElse: () => ChartDrawingKind.trendline,
        ),
        createdAtMs: (json['at'] as num).toInt(),
      );
}

enum ChartDrawingKind { trendline, horizontal }

class ChartDrawingsStorage {
  ChartDrawingsStorage(this._storage);
  final FlutterSecureStorage _storage;

  static String _keyFor(String symbol, String exchange) =>
      'stockvirtue.drawings.$exchange.$symbol';

  Future<List<ChartDrawing>> read(String symbol, String exchange) async {
    final raw = await _storage.read(key: _keyFor(symbol, exchange));
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(ChartDrawing.fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> write(
    String symbol,
    String exchange,
    List<ChartDrawing> list,
  ) async {
    await _storage.write(
      key: _keyFor(symbol, exchange),
      value: jsonEncode(list.map((d) => d.toJson()).toList()),
    );
  }
}

final chartDrawingsStorageProvider = Provider<ChartDrawingsStorage>((ref) {
  return ChartDrawingsStorage(appSecureStorage);
});

/// Family key — both symbol and exchange identify a unique chart so the
/// same ticker on NSE and BSE keeps separate annotations.
class ChartDrawingsArgs {
  final String symbol;
  final String exchange;
  const ChartDrawingsArgs({required this.symbol, required this.exchange});

  @override
  bool operator ==(Object other) =>
      other is ChartDrawingsArgs &&
      other.symbol == symbol &&
      other.exchange == exchange;

  @override
  int get hashCode => Object.hash(symbol, exchange);
}

class ChartDrawingsNotifier
    extends AsyncNotifier<List<ChartDrawing>> {
  // Riverpod 3.x passes the family argument to the notifier's constructor
  // (via `ChartDrawingsNotifier.new`), not to `build()`.
  ChartDrawingsNotifier(this._args);
  final ChartDrawingsArgs _args;

  @override
  Future<List<ChartDrawing>> build() {
    return ref
        .read(chartDrawingsStorageProvider)
        .read(_args.symbol, _args.exchange);
  }

  Future<void> add(ChartDrawing d) async {
    final existing = state.value ?? await future;
    final next = [...existing, d];
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> clear() async {
    state = const AsyncData([]);
    unawaited(_persist(const []));
  }

  Future<void> removeAt(int index) async {
    final existing = state.value ?? await future;
    if (index < 0 || index >= existing.length) return;
    final next = [...existing]..removeAt(index);
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> _persist(List<ChartDrawing> list) async {
    try {
      await ref
          .read(chartDrawingsStorageProvider)
          .write(_args.symbol, _args.exchange, list);
    } catch (e, st) {
      debugPrint('Chart drawings persist failed: $e\n$st');
    }
  }
}

final chartDrawingsProvider = AsyncNotifierProvider.family<
    ChartDrawingsNotifier,
    List<ChartDrawing>,
    ChartDrawingsArgs>(ChartDrawingsNotifier.new);
