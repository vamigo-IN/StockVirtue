import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/notification_kinds.dart';
import '../../core/preferences.dart';
import 'notifications_repository.dart';

// AppNotificationKind lives in core/notification_kinds.dart so the core
// preferences module can reference it without a feature ↔ core cycle.
export '../../core/notification_kinds.dart' show AppNotificationKind;

/// Maps a backend notification `kind` string to the client's display enum.
/// The server uses: info | order | price | achievement | reminder | admin.
AppNotificationKind kindFromServer(String? kind) {
  switch (kind) {
    case 'order':
      return AppNotificationKind.orderFilled;
    case 'price':
      return AppNotificationKind.priceAlert;
    // achievement / reminder / admin / info all render with the info style.
    default:
      return AppNotificationKind.info;
  }
}

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

  /// From a `/notifications` inbox row.
  static AppNotification fromServer(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String,
      kind: kindFromServer(json['kind'] as String?),
      title: (json['title'] as String?) ?? '',
      body: (json['body'] as String?) ?? '',
      at: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      read: json['read'] as bool? ?? false,
    );
  }
}

/// Server-backed notification inbox. The backend owns the notifications
/// (fills, alerts, achievements, market-close reminders, admin broadcasts);
/// this fetches them, marks them read, and accepts real-time inserts pushed
/// over the Socket.IO connection.
class NotificationsNotifier extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() async {
    final rows = await ref.read(notificationsRepositoryProvider).list();
    return rows.map(AppNotification.fromServer).toList();
  }

  /// Re-fetch from the server, preserving any optimistic client-only entries
  /// (order placed/cancelled/rejected etc.) the server doesn't persist. Server
  /// rows are the source of truth for everything else.
  Future<void> refresh() async {
    final rows = await ref.read(notificationsRepositoryProvider).list();
    final serverList = rows.map(AppNotification.fromServer).toList();
    final localOnly = (state.value ?? const <AppNotification>[])
        .where((n) => n.id.startsWith('local:'));
    final merged = [...localOnly, ...serverList]
      ..sort((a, b) => b.at.compareTo(a.at));
    state = AsyncData(merged);
  }

  /// Optimistic, client-side-only notification for events the server doesn't
  /// emit (order placed / cancelled / rejected, basket & strategy results,
  /// local welcome messages). Server-generated events (fills, alerts,
  /// achievements, reminders, admin) arrive via [onRealtime] / [refresh].
  Future<void> push({
    required AppNotificationKind kind,
    required String title,
    required String body,
  }) async {
    // Respect the user's per-kind mute toggles (Settings → Notifications).
    if (ref.read(prefsProvider).isMuted(kind)) return;
    final entry = AppNotification(
      id: 'local:${DateTime.now().microsecondsSinceEpoch}',
      kind: kind,
      title: title,
      body: body,
      at: DateTime.now(),
    );
    final current = state.value ?? const <AppNotification>[];
    state = AsyncData([entry, ...current].take(60).toList());
  }

  Future<void> clear() async {
    state = const AsyncData([]);
  }

  /// Prepend a notification delivered in real time. Deduped by id so a
  /// subsequent refresh doesn't double it. A null/absent id (admin broadcast)
  /// triggers a refresh instead, so the caller gets their canonical row.
  Future<void> onRealtime(Map<String, dynamic> json) async {
    final id = json['id'] as String?;
    if (id == null) {
      await refresh();
      return;
    }
    final current = state.value ?? const <AppNotification>[];
    if (current.any((n) => n.id == id)) return;
    state = AsyncData([AppNotification.fromServer(json), ...current]);
  }

  Future<void> markAllRead() async {
    final list = state.value ?? const <AppNotification>[];
    state = AsyncData([for (final n in list) n.copyWith(read: true)]);
    try {
      await ref.read(notificationsRepositoryProvider).markAllRead();
    } catch (_) {
      // Best-effort; the next refresh reconciles from the server.
    }
  }
}

final notificationsProvider = AsyncNotifierProvider<NotificationsNotifier,
    List<AppNotification>>(NotificationsNotifier.new);

/// Unread count for the bell badge.
final unreadNotificationsCountProvider = Provider<int>((ref) {
  final list = ref.watch(notificationsProvider).value ?? const [];
  return list.where((n) => !n.read).length;
});
