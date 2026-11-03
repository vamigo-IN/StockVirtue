import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart'
    show Color, MaterialPageRoute, WidgetsBinding;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/navigation.dart';
import '../../core/preferences.dart';
import '../auth/auth_controller.dart';
import '../news/screens/news_reader_screen.dart';
import '../ticks/ticks_providers.dart';
import 'notifications_provider.dart';
import 'notifications_repository.dart';

const _androidChannel = AndroidNotificationChannel(
  'stockvirtue_default',
  'StockVirtue',
  description: 'Order fills, price alerts, reminders and updates.',
  importance: Importance.high,
);

/// News pushes have their own channel (the server names it in each push),
/// so readers can silence news in Android settings without losing order
/// fills and price alerts.
const _newsChannel = AndroidNotificationChannel(
  'stockvirtue_news',
  'News alerts',
  description: 'Breaking news and stories about stocks you follow.',
  importance: Importance.high,
);

/// A news push's story: from FCM data, or a local notification's payload.
typedef NewsTap = ({String slug, String? campaignId});

NewsTap? _newsFromData(Map<String, dynamic> data) {
  final slug = data['slug'];
  if (data['type'] != 'news' || slug is! String || slug.isEmpty) return null;
  final campaign = data['campaignId'];
  return (slug: slug, campaignId: campaign is String ? campaign : null);
}

NewsTap? _newsFromPayload(String? payload) {
  if (payload == null || !payload.startsWith('news|')) return null;
  final parts = payload.split('|');
  if (parts.length < 2 || parts[1].isEmpty) return null;
  return (
    slug: parts[1],
    campaignId: parts.length > 2 && parts[2].isNotEmpty ? parts[2] : null,
  );
}

/// Shows OS notifications and manages the FCM device token. Transport only:
/// the backend decides what/when to notify; this displays what arrives and
/// keeps the device token registered so background pushes reach a closed app.
class PushService {
  final _local = FlutterLocalNotificationsPlugin();
  bool _localReady = false;

  /// Called when the reader taps a news notification the app displayed.
  void Function(NewsTap tap)? onNewsTap;

  Future<void> _ensureLocal() async {
    if (_localReady) return;
    // Status-bar icons are alpha-only: a white "SV" silhouette, not the
    // full-colour launcher icon (which would show as a white square).
    const init = InitializationSettings(
      android: AndroidInitializationSettings('@drawable/ic_stat_notify'),
      iOS: DarwinInitializationSettings(),
    );
    await _local.initialize(
      init,
      onDidReceiveNotificationResponse: (response) {
        final tap = _newsFromPayload(response.payload);
        if (tap != null) onNewsTap?.call(tap);
      },
    );
    final android = _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(_androidChannel);
    await android?.createNotificationChannel(_newsChannel);
    _localReady = true;
  }

  /// Creates the notification channels before any push arrives, so a news
  /// push received while the app is closed lands in "News alerts".
  Future<void> prepare() async {
    try {
      await _ensureLocal();
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] local setup failed: $e');
    }
  }

  /// A news notification tapped while the app was closed, if that is what
  /// launched it.
  Future<NewsTap?> launchedFromNews() async {
    try {
      await _ensureLocal();
      final details = await _local.getNotificationAppLaunchDetails();
      if (details?.didNotificationLaunchApp != true) return null;
      return _newsFromPayload(details?.notificationResponse?.payload);
    } catch (_) {
      return null;
    }
  }

  /// Display an OS notification (used for realtime socket events while the app
  /// is in the foreground; background FCM messages are shown by the OS itself).
  Future<void> show(String title, String body, {NewsTap? news}) async {
    if (title.isEmpty) return;
    try {
      await _ensureLocal();
      final channel = news == null ? _androidChannel : _newsChannel;
      await _local.show(
        DateTime.now().millisecondsSinceEpoch.remainder(1 << 31),
        title,
        body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            channel.id,
            channel.name,
            channelDescription: channel.description,
            importance: Importance.high,
            priority: Priority.high,
            color: const Color(0xFF22D38A), // brand emerald accent
            styleInformation: news == null ? null : BigTextStyleInformation(body),
          ),
          iOS: const DarwinNotificationDetails(),
        ),
        payload: news == null
            ? null
            : 'news|${news.slug}|${news.campaignId ?? ''}',
      );
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] show failed: $e');
    }
  }

  /// On sign-out, while still signed in: tells the server to stop pushing to
  /// this phone, then drops the FCM token so the next account gets a fresh
  /// one. Best effort and quick — never holds up signing out.
  Future<void> forgetDevice(NotificationsRepository repo) async {
    try {
      final token = await FirebaseMessaging.instance
          .getToken()
          .timeout(const Duration(seconds: 3));
      if (token != null) {
        await repo
            .unregisterDevice(token)
            .timeout(const Duration(seconds: 4));
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[Push] unregister failed: $e');
    }
    try {
      // Even if the server didn't hear us, FCM now refuses the old token,
      // so the next send drops it there.
      await FirebaseMessaging.instance
          .deleteToken()
          .timeout(const Duration(seconds: 3));
    } catch (_) {}
  }

  /// Deletes this phone's FCM token, so a token the server still holds stops
  /// working (signing out with an expired session, or after deleting the
  /// account). Never throws.
  Future<void> dropLocalToken() async {
    try {
      await FirebaseMessaging.instance
          .deleteToken()
          .timeout(const Duration(seconds: 3));
    } catch (_) {}
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

/// Opens a story from a tapped news push, on top of whatever is showing.
void _openNews(NewsTap tap) {
  void go() {
    rootNavigatorKey.currentState?.push(
      MaterialPageRoute(
        builder: (_) =>
            NewsReaderScreen(slug: tap.slug, campaignId: tap.campaignId),
      ),
    );
  }

  // On a cold start the navigator may not be built yet.
  if (rootNavigatorKey.currentState == null) {
    WidgetsBinding.instance.addPostFrameCallback((_) => go());
  } else {
    go();
  }
}

/// Wires push end-to-end while a user is signed in:
///  • registers/refreshes the FCM device token with the backend (so background
///    pushes reach the device),
///  • shows an OS notification + prepends to the inbox for realtime socket
///    `notification` events (foreground),
///  • refreshes the inbox when a foreground FCM message arrives, and shows
///    news pushes (which only come by FCM) on the news channel,
///  • opens the story when a news push is tapped (app closed, in the
///    background, or showing).
/// Watch once from the widget tree, like [socketLifecycleProvider].
final pushLifecycleProvider = Provider<void>((ref) {
  final push = ref.read(pushServiceProvider);
  final subs = <StreamSubscription<dynamic>>[];
  String? registeredToken;
  var launchChecked = false;
  push.onNewsTap = _openNews;

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

  /// A push tapped while the app was closed launched it: open the story
  /// (once per launch, not again after signing out and back in).
  Future<void> openLaunchTap() async {
    if (launchChecked) return;
    launchChecked = true;
    try {
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      final tap = initial == null ? null : _newsFromData(initial.data);
      if (tap != null) {
        _openNews(tap);
        return;
      }
    } catch (_) {}
    final local = await push.launchedFromNews();
    if (local != null) _openNews(local);
  }

  void start() {
    push.prepare();
    registerToken();
    openLaunchTap();
    // FCM token rotation → re-register.
    try {
      subs.add(FirebaseMessaging.instance.onTokenRefresh.listen((_) {
        registeredToken = null;
        registerToken();
      }));
    } catch (_) {}
    // Foreground FCM: the socket already displays inbox notifications, so
    // just reconcile the inbox (covers the rare case the socket is
    // momentarily disconnected). News pushes only come by FCM, so show them.
    try {
      subs.add(FirebaseMessaging.onMessage.listen((message) {
        final news = _newsFromData(message.data);
        if (news != null) {
          push.show(
            message.notification?.title ?? 'StockVirtue news',
            message.notification?.body ?? '',
            news: news,
          );
          return;
        }
        ref.read(notificationsProvider.notifier).refresh();
      }));
    } catch (_) {}
    // A news push tapped while the app was in the background.
    try {
      subs.add(FirebaseMessaging.onMessageOpenedApp.listen((message) {
        final news = _newsFromData(message.data);
        if (news != null) _openNews(news);
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
