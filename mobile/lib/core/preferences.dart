import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../data/models/order.dart';
import '../features/notifications/notifications_provider.dart';
import 'secure_storage.dart';

class AppPreferences {
  final OrderType defaultOrderType;
  final OrderProduct defaultProduct;
  // Notification gating — keyed by AppNotificationKind so future kinds can
  // default to "on" without a migration.
  final Set<AppNotificationKind> mutedKinds;

  const AppPreferences({
    this.defaultOrderType = OrderType.market,
    this.defaultProduct = OrderProduct.delivery,
    this.mutedKinds = const <AppNotificationKind>{},
  });

  bool isMuted(AppNotificationKind k) => mutedKinds.contains(k);

  AppPreferences copyWith({
    OrderType? defaultOrderType,
    OrderProduct? defaultProduct,
    Set<AppNotificationKind>? mutedKinds,
  }) =>
      AppPreferences(
        defaultOrderType: defaultOrderType ?? this.defaultOrderType,
        defaultProduct: defaultProduct ?? this.defaultProduct,
        mutedKinds: mutedKinds ?? this.mutedKinds,
      );

  Map<String, dynamic> toJson() => {
        'defaultOrderType': defaultOrderType.name,
        'defaultProduct': defaultProduct.name,
        'mutedKinds': [for (final k in mutedKinds) k.name],
      };

  factory AppPreferences.fromJson(Map<String, dynamic> json) {
    final orderName = json['defaultOrderType'] as String?;
    final productName = json['defaultProduct'] as String?;
    final muted = (json['mutedKinds'] as List?)?.cast<String>() ?? const [];
    return AppPreferences(
      defaultOrderType: OrderType.values.firstWhere(
        (t) => t.name == orderName,
        orElse: () => OrderType.market,
      ),
      defaultProduct: OrderProduct.values.firstWhere(
        (p) => p.name == productName,
        orElse: () => OrderProduct.delivery,
      ),
      mutedKinds: {
        for (final name in muted)
          AppNotificationKind.values.firstWhere(
            (k) => k.name == name,
            orElse: () => AppNotificationKind.info,
          ),
      },
    );
  }
}

class _PreferencesStorage {
  _PreferencesStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.preferences';

  Future<AppPreferences> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const AppPreferences();
    try {
      return AppPreferences.fromJson(
        (jsonDecode(raw) as Map).cast<String, dynamic>(),
      );
    } catch (_) {
      return const AppPreferences();
    }
  }

  Future<void> write(AppPreferences p) async {
    await _storage.write(key: _key, value: jsonEncode(p.toJson()));
  }
}

class PreferencesNotifier extends AsyncNotifier<AppPreferences> {
  late final _PreferencesStorage _storage;

  @override
  Future<AppPreferences> build() {
    _storage = _PreferencesStorage(appSecureStorage);
    return _storage.read();
  }

  Future<void> _update(AppPreferences Function(AppPreferences) f) async {
    final current = state.value ?? await future;
    final next = f(current);
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> setDefaultOrderType(OrderType t) =>
      _update((p) => p.copyWith(defaultOrderType: t));

  Future<void> setDefaultProduct(OrderProduct p) =>
      _update((prev) => prev.copyWith(defaultProduct: p));

  Future<void> setMuted(AppNotificationKind kind, bool muted) =>
      _update((p) {
        final next = Set<AppNotificationKind>.of(p.mutedKinds);
        if (muted) {
          next.add(kind);
        } else {
          next.remove(kind);
        }
        return p.copyWith(mutedKinds: next);
      });

  Future<void> _persist(AppPreferences p) async {
    try {
      await _storage.write(p);
    } catch (e, st) {
      debugPrint('Preferences persist failed: $e\n$st');
    }
  }
}

final preferencesProvider =
    AsyncNotifierProvider<PreferencesNotifier, AppPreferences>(
  PreferencesNotifier.new,
);

/// Synchronous, default-resolved view — every consumer treats prefs as
/// "always loaded" so we don't ladder AsyncValue.when() through every
/// widget that just needs the default order type / product.
final prefsProvider = Provider<AppPreferences>((ref) {
  return ref.watch(preferencesProvider).value ??
      const AppPreferences();
});
