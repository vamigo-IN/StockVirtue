import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// Thin, crash-safe wrapper around Firebase Analytics.
///
/// Every call is guarded so the app behaves identically when Firebase isn't
/// configured (the dev / email-OTP fallback in [initFirebase]) — analytics
/// simply no-ops instead of throwing or blanking the UI. Initialise once in
/// `main()` after Firebase, then use the [instance] anywhere.
class Analytics {
  Analytics._();
  static final Analytics instance = Analytics._();

  FirebaseAnalytics? _fa;

  /// Navigator observer that auto-logs `screen_view` for named routes. Falls
  /// back to a no-op observer when analytics is unavailable, so it's always
  /// safe to pass to `MaterialApp.navigatorObservers`.
  NavigatorObserver _observer = NavigatorObserver();
  NavigatorObserver get navigatorObserver => _observer;

  bool get enabled => _fa != null;

  /// Call once after `Firebase.initializeApp()`. Safe to call when Firebase
  /// failed to initialise — it just leaves analytics disabled.
  Future<void> init() async {
    try {
      final fa = FirebaseAnalytics.instance;
      await fa.setAnalyticsCollectionEnabled(true);
      _fa = fa;
      _observer = FirebaseAnalyticsObserver(analytics: fa);
      if (kDebugMode) debugPrint('[analytics] enabled');
    } catch (err) {
      // No Firebase app / unsupported platform — stay disabled, never throw.
      if (kDebugMode) debugPrint('[analytics] unavailable: $err');
    }
  }

  /// Associates subsequent events with a stable user id (our backend user id,
  /// not PII). Pass null on logout to detach.
  Future<void> setUser(String? id) => _guard(() => _fa!.setUserId(id: id));

  /// Standard `login` event.
  Future<void> logLogin(String method) =>
      _guard(() => _fa!.logLogin(loginMethod: method));

  /// Standard `sign_up` event.
  Future<void> logSignUp(String method) =>
      _guard(() => _fa!.logSignUp(signUpMethod: method));

  Future<void> logLogout() => logEvent('logout');

  /// A placed order (filled or queued). Params must be String/num for GA4.
  Future<void> logTrade({
    required String side,
    required String symbol,
    required int quantity,
    required String orderType,
    required String status,
    double? value,
  }) {
    return logEvent('order_placed', {
      'side': side,
      'symbol': symbol,
      'quantity': quantity,
      'order_type': orderType,
      'status': status,
      'value': ?value,
    });
  }

  /// Manual screen view (for tab switches inside an IndexedStack, which the
  /// route observer can't see).
  Future<void> logScreen(String name) =>
      _guard(() => _fa!.logScreenView(screenName: name));

  /// Generic custom event.
  Future<void> logEvent(String name, [Map<String, Object>? params]) =>
      _guard(() => _fa!.logEvent(name: name, parameters: params));

  Future<void> _guard(Future<void> Function() body) async {
    if (_fa == null) return;
    try {
      await body();
    } catch (err) {
      if (kDebugMode) debugPrint('[analytics] event failed: $err');
    }
  }
}
