import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/analytics.dart';
import 'core/company_names.dart';
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
  // Company names (KOTAKBANK → "Kotak Mahindra Bank") must be ready before
  // the first frame so lists never flash bare tickers. ~100 KB, ~20 ms.
  await CompanyDirectory.instance.loadBundled();
  // Bundled Inter font is SIL OFL 1.1 — surface its licence in the
  // in-app licences page alongside the package licences.
  LicenseRegistry.addLicense(() async* {
    final ofl = await rootBundle.loadString('assets/fonts/OFL.txt');
    yield LicenseEntryWithLineBreaks(const ['Inter font'], ofl);
  });
  runApp(const ProviderScope(child: StockVirtueApp()));
}
