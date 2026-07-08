/// Returns the backend base URL used by the REST client and (via its origin)
/// the realtime ticks WebSocket.
///
/// Defaults to PRODUCTION so release builds and ordinary runs talk to the live
/// server with no flags. The compile-time `API_BASE_URL` override ALWAYS wins —
/// pass it to point at a local backend during development, e.g.:
///   • Android emulator        : --dart-define=API_BASE_URL=http://10.0.2.2:3000/api
///   • iOS sim / web / desktop  : --dart-define=API_BASE_URL=http://localhost:3000/api
///   • Physical device on LAN   : --dart-define=API_BASE_URL=http://192.168.x.y:3000/api
///
/// The `/api` suffix is required — the backend serves every route under it
/// (except /admin). The ticks service strips `/api` to derive the socket
/// origin, so an https base automatically yields a secure wss connection.
String defaultApiBaseUrl() {
  const fromEnv = String.fromEnvironment('API_BASE_URL');
  if (fromEnv.isNotEmpty) return fromEnv;
  return 'https://api.stockvirtue.com/api';
}

/// Android package id for the published app.
const String kAndroidPackageId = 'com.vamigo.stockvirtue';

/// Google Play listing for the app. Shared by the "Rate us" tile, the invite
/// share message, and room-share messages so the link lives in one place.
const String kPlayStoreUrl =
    'https://play.google.com/store/apps/details?id=$kAndroidPackageId';
