import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/analytics.dart';
import 'core/firebase_init.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initFirebase();
  // Enable Firebase Analytics (no-ops when Firebase isn't configured).
  await Analytics.instance.init();
  runApp(const ProviderScope(child: StockVirtueApp()));
}
