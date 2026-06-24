import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config.dart';
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
        service.connect(defaultApiBaseUrl(), tokens.accessToken);
      }
    } else if (!loggedIn && service.isConnected) {
      service.disconnect();
    }
  }

  ref.listen(authControllerProvider, (_, _) => sync(), fireImmediately: true);
});

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
