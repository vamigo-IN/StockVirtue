import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/notification_kinds.dart';
import '../../core/preferences.dart';
import '../../core/secure_storage.dart';

// AppNotificationKind lives in core/notification_kinds.dart so the core
// preferences module can mute kinds without creating a feature ↔ core
// import cycle. Re-exported here for backwards-compat with all the call
// sites that already import this file.
export '../../core/notification_kinds.dart' show AppNotificationKind;

class AppNotification {
  final String id;
  final AppNotificationKind kind;
  final String title;
  final String body;
  final DateTime at;
  final bool read;

  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.at,
    this.read = false,
  });

  AppNotification copyWith({bool? read}) => AppNotification(
        id: id,
        kind: kind,
        title: title,
        body: body,
        at: at,
        read: read ?? this.read,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind.name,
        'title': title,
        'body': body,
        'at': at.toIso8601String(),
        'read': read,
      };

  static AppNotification fromJson(Map<String, dynamic> json) {
    final kindName = json['kind'] as String? ?? 'info';
    final kind = AppNotificationKind.values.firstWhere(
      (k) => k.name == kindName,
      orElse: () => AppNotificationKind.info,
    );
    return AppNotification(
      id: json['id'] as String,
      kind: kind,
      title: json['title'] as String,
      body: json['body'] as String,
      at: DateTime.parse(json['at'] as String),
      read: json['read'] as bool? ?? false,
    );
  }
}

/// Storage wrapper. Persists the notification log so it survives restarts.
class NotificationsStorage {
  NotificationsStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.notifications';
  static const max = 50;

  Future<List<AppNotification>> read() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list.map(AppNotification.fromJson).toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> write(List<AppNotification> list) async {
    await _storage.write(
      key: _key,
      value: jsonEncode(list.map((n) => n.toJson()).toList()),
    );
  }
}

final notificationsStorageProvider = Provider<NotificationsStorage>((ref) {
  return NotificationsStorage(appSecureStorage);
});

/// In-memory notification log. Race-free: writes go through one Notifier
/// instance, persistence is fire-and-forget after the in-memory mutation
/// (mirrors the pattern used by [RecentlyViewedNotifier]).
class NotificationsNotifier extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() =>
      ref.read(notificationsStorageProvider).read();

  Future<void> push({
    required AppNotificationKind kind,
    required String title,
    required String body,
  }) async {
    // Drop muted kinds before they hit the log. Reading the prefs provider
    // synchronously is safe because [prefsProvider] always returns the
    // default until storage has loaded — worst case is the first launch
    // sees an extra notification it would otherwise have suppressed.
    final prefs = ref.read(prefsProvider);
    if (prefs.isMuted(kind)) return;
    final existing = state.value ?? await future;
    final entry = AppNotification(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      kind: kind,
      title: title,
      body: body,
      at: DateTime.now(),
    );
    final next = [entry, ...existing].take(NotificationsStorage.max).toList();
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> markAllRead() async {
    final list = state.value ?? await future;
    final next = [for (final n in list) n.copyWith(read: true)];
    state = AsyncData(next);
    unawaited(_persist(next));
  }

  Future<void> clear() async {
    state = const AsyncData([]);
    unawaited(_persist(const []));
  }

  Future<void> _persist(List<AppNotification> list) async {
    try {
      await ref.read(notificationsStorageProvider).write(list);
    } catch (e, st) {
      debugPrint('Notifications persist failed: $e\n$st');
    }
  }
}

final notificationsProvider = AsyncNotifierProvider<NotificationsNotifier,
    List<AppNotification>>(NotificationsNotifier.new);

/// Convenience selector — unread count for the bell badge.
final unreadNotificationsCountProvider = Provider<int>((ref) {
  final list = ref.watch(notificationsProvider).value ?? const [];
  return list.where((n) => !n.read).length;
});
