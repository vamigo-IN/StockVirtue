import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/analytics.dart';
import 'core/firebase_init.dart';

/// FCM background/terminated entry point. `notification`-type messages (what
/// the backend sends) are displayed automatically by the OS in this state, so
/// there's nothing to do — but the handler must be registered for FCM to run.
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackground(RemoteMessage message) async {}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initFirebase();
  try {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackground);
  } catch (_) {
    // Messaging unavailable (e.g. Firebase not configured) — non-fatal.
  }
  // Enable Firebase Analytics (no-ops when Firebase isn't configured).
  await Analytics.instance.init();
  runApp(const ProviderScope(child: StockVirtueApp()));
}
