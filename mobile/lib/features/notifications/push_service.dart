import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/preferences.dart';
import '../auth/auth_controller.dart';
import '../ticks/ticks_providers.dart';
import 'notifications_provider.dart';
import 'notifications_repository.dart';

const _androidChannel = AndroidNotificationChannel(
  'stockvirtue_default',
  'StockVirtue',
  description: 'Order fills, price alerts, reminders and updates.',
  importance: Importance.high,
);

/// Shows OS notifications and manages the FCM device token. Transport only:
/// the backend decides what/when to notify; this displays what arrives and
/// keeps the device token registered so background pushes reach a closed app.
class PushService {
  final _local = FlutterLocalNotificationsPlugin();
  bool _localReady = false;

  Future<void> _ensureLocal() async {
    if (_localReady) return;
    const init = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
    );
    await _local.initialize(init);
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_androidChannel);
    _localReady = true;
  }

  /// Display an OS notification (used for realtime socket events while the app
  /// is in the foreground; background FCM messages are shown by the OS itself).
  Future<void> show(String title, String body) async {
    if (title.isEmpty) return;
    try {
      await _ensureLocal();
      await _local.show(
        DateTime.now().millisecondsSinceEpoch.remainder(1 << 31),
        title,
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            _androidChannel.id,
            _androidChannel.name,
            channelDescription: _androidChannel.description,
            importance: Importance.high,
            priority: Priority.high,
          ),
          iOS: const DarwinNotificationDetails(),
        ),
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] show failed: $e');
    }
  }

  /// Request notification permission and return the FCM token (or null when
  /// messaging isn't available — web/desktop/unconfigured).
  Future<String?> requestAndGetToken() async {
    try {
      final m = FirebaseMessaging.instance;
      await m.requestPermission();
      return await m.getToken();
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] getToken failed: $e');
      return null;
    }
  }
}

final pushServiceProvider = Provider<PushService>((ref) => PushService());

/// Wires push end-to-end while a user is signed in:
///  • registers/refreshes the FCM device token with the backend (so background
///    pushes reach the device),
///  • shows an OS notification + prepends to the inbox for realtime socket
///    `notification` events (foreground),
///  • refreshes the inbox when a foreground FCM message arrives.
/// Watch once from the widget tree, like [socketLifecycleProvider].
final pushLifecycleProvider = Provider<void>((ref) {
  final push = ref.read(pushServiceProvider);
  final subs = <StreamSubscription<dynamic>>[];
  String? registeredToken;

  Future<void> registerToken() async {
    final token = await push.requestAndGetToken();
    if (token == null || token == registeredToken) return;
    try {
      await ref
          .read(notificationsRepositoryProvider)
          .registerDevice(token, _platform());
      registeredToken = token;
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] register failed: $e');
    }
  }

  void start() {
    registerToken();
    // FCM token rotation → re-register.
    try {
      subs.add(FirebaseMessaging.instance.onTokenRefresh.listen((_) {
        registeredToken = null;
        registerToken();
      }));
    } catch (_) {}
    // Foreground FCM: the socket already displays it, so just reconcile the
    // inbox (covers the rare case the socket is momentarily disconnected).
    try {
      subs.add(FirebaseMessaging.onMessage.listen((_) {
        ref.read(notificationsProvider.notifier).refresh();
      }));
    } catch (_) {}
    // Realtime server notifications over the app's Socket.IO connection.
    subs.add(ref.read(ticksServiceProvider).notifications.listen((json) {
      final kind = kindFromServer(json['kind'] as String?);
      if (!ref.read(prefsProvider).isMuted(kind)) {
        push.show(
          (json['title'] as String?) ?? '',
          (json['body'] as String?) ?? '',
        );
      }
      ref.read(notificationsProvider.notifier).onRealtime(json);
    }));
  }

  void stop() {
    for (final s in subs) {
      s.cancel();
    }
    subs.clear();
  }

  ref.onDispose(stop);
  ref.listen(authControllerProvider, (_, _) {
    final loggedIn = ref.read(authControllerProvider).value != null;
    if (loggedIn && subs.isEmpty) {
      start();
    } else if (!loggedIn && subs.isNotEmpty) {
      stop();
    }
  }, fireImmediately: true);
});

String _platform() =>
    defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
