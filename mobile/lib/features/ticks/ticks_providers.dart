import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
import '../../data/api_client.dart';
import '../../data/auth_storage.dart';
import '../../data/models/tick.dart';
import '../auth/auth_controller.dart';
import 'ticks_service.dart';

final ticksServiceProvider = Provider<TicksService>((ref) {
  final service = TicksService();
  ref.onDispose(service.dispose);
  return service;
});

/// Connects the Socket.IO client whenever a user is authenticated and
/// disconnects on logout. Watch this from the top of the widget tree.
final socketLifecycleProvider = Provider<void>((ref) {
  Future<void> sync() async {
    final service = ref.read(ticksServiceProvider);
    final auth = ref.read(authControllerProvider);
    final loggedIn = auth.value != null;
    if (loggedIn && !service.isConnected) {
      final tokens = await ref.read(authStorageProvider).read();
      if (tokens != null) {
        service.connect(
          defaultApiBaseUrl(),
          tokens.accessToken,
          // Reconnects can outlive the 15-min access token; hand the socket a
          // refreshed one so it re-authenticates instead of going silent.
          tokenProvider: () => _freshAccessToken(ref),
        );
      }
    } else if (!loggedIn && service.isConnected) {
      service.disconnect();
    }
  }

  ref.listen(authControllerProvider, (_, _) => sync(), fireImmediately: true);
});

/// A valid access token for the live-tick socket: the stored one if it still
/// has life left, otherwise a freshly-refreshed one (persisted for the REST
/// layer too). Null when the session can't be renewed.
Future<String?> _freshAccessToken(Ref ref) async {
  final storage = ref.read(authStorageProvider);
  final tokens = await storage.read();
  if (tokens == null) return null;
  if (!_jwtExpiringSoon(tokens.accessToken)) return tokens.accessToken;
  try {
    final dio = ref.read(apiClientProvider).dio;
    final refreshed = await refreshAuthTokens(dio, tokens.refreshToken);
    await storage.write(refreshed);
    return refreshed.accessToken;
  } catch (_) {
    return tokens.accessToken;
  }
}

/// True when [jwt] has expired or expires within [skewSeconds]. Treats any
/// unparseable token as expiring (forces a refresh attempt).
bool _jwtExpiringSoon(String jwt, {int skewSeconds = 60}) {
  try {
    final parts = jwt.split('.');
    if (parts.length != 3) return true;
    var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    switch (payload.length % 4) {
      case 1:
        return true;
      case 2:
        payload += '==';
        break;
      case 3:
        payload += '=';
        break;
    }
    final map =
        jsonDecode(utf8.decode(base64.decode(payload))) as Map<String, dynamic>;
    final exp = map['exp'];
    if (exp is! int) return true;
    final expiry = DateTime.fromMillisecondsSinceEpoch(exp * 1000);
    return DateTime.now().isAfter(
      expiry.subtract(Duration(seconds: skewSeconds)),
    );
  } catch (_) {
    return true;
  }
}

/// Map of `${exchange}:${token}` → latest tick. Components watch this with
/// `.select((m) => m[key])` to rebuild only when their own row updates.
class LatestTicks extends Notifier<Map<String, Tick>> {
  StreamSubscription<Tick>? _sub;

  @override
  Map<String, Tick> build() {
    final service = ref.watch(ticksServiceProvider);
    _sub = service.ticks.listen((tick) {
      state = {...state, tick.key: tick};
    });
    ref.onDispose(() => _sub?.cancel());
    return {};
  }
}

final latestTicksProvider =
    NotifierProvider<LatestTicks, Map<String, Tick>>(LatestTicks.new);

final socketConnectedProvider = StreamProvider<bool>((ref) {
  return ref.watch(ticksServiceProvider).connectionState;
});
