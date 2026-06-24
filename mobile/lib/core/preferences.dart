import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../data/models/order.dart';
import '../features/notifications/notifications_provider.dart';
import 'money_format.dart';
import 'secure_storage.dart';

extension CurrencyFormatX on CurrencyFormat {
  String get label => switch (this) {
        CurrencyFormat.full => 'Full (₹12,34,567.89)',
        CurrencyFormat.abbreviated => 'Abbreviated (₹12.35 L / ₹1.23 Cr)',
      };
}

class AppPreferences {
  final OrderType defaultOrderType;
  final OrderProduct defaultProduct;
  final CurrencyFormat currencyFormat;
  // Notification gating — keyed by AppNotificationKind so future kinds can
  // default to "on" without a migration.
  final Set<AppNotificationKind> mutedKinds;

  const AppPreferences({
    this.defaultOrderType = OrderType.market,
    this.defaultProduct = OrderProduct.delivery,
    this.currencyFormat = CurrencyFormat.full,
    this.mutedKinds = const <AppNotificationKind>{},
  });

  bool isMuted(AppNotificationKind k) => mutedKinds.contains(k);

  AppPreferences copyWith({
    OrderType? defaultOrderType,
    OrderProduct? defaultProduct,
    CurrencyFormat? currencyFormat,
    Set<AppNotificationKind>? mutedKinds,
  }) =>
      AppPreferences(
        defaultOrderType: defaultOrderType ?? this.defaultOrderType,
        defaultProduct: defaultProduct ?? this.defaultProduct,
        currencyFormat: currencyFormat ?? this.currencyFormat,
        mutedKinds: mutedKinds ?? this.mutedKinds,
      );

  Map<String, dynamic> toJson() => {
        'defaultOrderType': defaultOrderType.name,
        'defaultProduct': defaultProduct.name,
        'currencyFormat': currencyFormat.name,
        'mutedKinds': [for (final k in mutedKinds) k.name],
      };

  factory AppPreferences.fromJson(Map<String, dynamic> json) {
    final orderName = json['defaultOrderType'] as String?;
    final productName = json['defaultProduct'] as String?;
    final fmtName = json['currencyFormat'] as String?;
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
      currencyFormat: CurrencyFormat.values.firstWhere(
        (c) => c.name == fmtName,
        orElse: () => CurrencyFormat.full,
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

  Future<void> setCurrencyFormat(CurrencyFormat fmt) =>
      _update((p) => p.copyWith(currencyFormat: fmt));

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
/// widget that just needs to know which currency format to render.
final prefsProvider = Provider<AppPreferences>((ref) {
  return ref.watch(preferencesProvider).value ??
      const AppPreferences();
});
