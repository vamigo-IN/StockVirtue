import 'package:flutter/foundation.dart';

/// Returns the backend base URL appropriate for the current platform.
///
/// The compile-time `API_BASE_URL` override ALWAYS wins — production/staging
/// release builds MUST pass an HTTPS URL, e.g.:
///   flutter build appbundle --dart-define=API_BASE_URL=https://api.stockvirtue.com/api
/// (wire this into your release/CI command). The defaults below are dev-only:
/// - Web / iOS sim / desktop: `localhost`
/// - Android emulator: `10.0.2.2` (the emulator's alias for the host machine)
/// - Physical device on LAN: `--dart-define=API_BASE_URL=http://192.168.x.y:3000/api`
String defaultApiBaseUrl() {
  const fromEnv = String.fromEnvironment('API_BASE_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  if (kIsWeb) return 'http://localhost:3000/api';
  if (defaultTargetPlatform == TargetPlatform.android) {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://localhost:3000/api';
}
