import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';
import '../academy/lesson_progress.dart';
import '../auth/auth_controller.dart';
import '../notifications/notifications_provider.dart';
import '../orders/orders_providers.dart';
import '../portfolio/portfolio_providers.dart';
import '../referral/referrals_repository.dart';
import 'achievements_repository.dart';
import 'badge_definitions.dart';

/// Local cache of the server's unlocked-badge set, keyed PER USER. Lets the
/// achievements UI render offline and lets us fire a one-time in-app
/// notification when the server reports a badge that's NEW vs. what we last saw
/// (a shared device never leaks one account's badges into another's).
class AchievementsStorage {
  AchievementsStorage(this._storage);
  final FlutterSecureStorage _storage;

  String _keyFor(String userId) => 'stockvirtue.achievements.$userId';

  /// Stored set, or null when nothing has ever been cached for this user (lets
  /// the notifier do a silent baseline on first sync).
  Future<Set<String>?> read(String userId) async {
    final raw = await _storage.read(key: _keyFor(userId));
    if (raw == null) return null;
    if (raw.isEmpty) return <String>{};
    try {
      return (jsonDecode(raw) as List).cast<String>().toSet();
    } catch (_) {
      return <String>{};
    }
  }

  Future<void> write(String userId, Set<String> ids) async {
    await _storage.write(key: _keyFor(userId), value: jsonEncode(ids.toList()));
  }
}

final achievementsStorageProvider = Provider<AchievementsStorage>((ref) {
  return AchievementsStorage(appSecureStorage);
});

/// Server-authoritative set of unlocked badge ids for the signed-in user.
/// Fetches GET /achievements, falls back to the local cache when offline, and
/// fires a one-time in-app notification for any badge newly unlocked since we
/// last looked. Achievement *decisions* are made on the server (off trades,
/// referrals, lessons); this notifier just surfaces and caches them.
class AchievementsNotifier extends AsyncNotifier<Set<String>> {
  String? _userId;
  // True until the first sync for this user; that sync snapshots silently so a
  // returning user isn't spammed for everything they already earned.
  bool _silentBaseline = false;
  bool _fetching = false;

  @override
  Future<Set<String>> build() async {
    final userId = ref.watch(authControllerProvider).value?.id;
    _userId = userId;
    if (userId == null) {
      _silentBaseline = false;
      return <String>{};
    }

    final cached = await ref.read(achievementsStorageProvider).read(userId);
    _silentBaseline = cached == null;

    // The server grants badges off trades, referrals and lessons. Re-sync when
    // any of those change so a fresh unlock appears (and notifies) promptly.
    ref.listen(ordersListProvider, (_, _) => unawaited(_refresh()));
    ref.listen(portfolioProvider, (_, _) => unawaited(_refresh()));
    ref.listen(referralStatsProvider, (_, _) => unawaited(_refresh()));
    ref.listen(lessonProgressProvider, (_, _) => unawaited(_refresh()));

    try {
      final server =
          await ref.read(achievementsRepositoryProvider).fetchUnlocked();
      await _reconcile(userId, server, cached ?? const <String>{});
      return server;
    } catch (_) {
      // Offline / transient: show whatever we last cached.
      return cached ?? <String>{};
    }
  }

  Future<void> _refresh() async {
    final userId = _userId;
    if (userId == null || _fetching) return;
    _fetching = true;
    try {
      final server =
          await ref.read(achievementsRepositoryProvider).fetchUnlocked();
      final known = state.value ?? const <String>{};
      await _reconcile(userId, server, known);
      state = AsyncData(server);
    } catch (_) {
      // Keep current state on transient failures.
    } finally {
      _fetching = false;
    }
  }

  /// Persist the server set; fire a one-time notification for each newly
  /// unlocked badge (skipped on the first, baseline sync).
  Future<void> _reconcile(
    String userId,
    Set<String> server,
    Set<String> known,
  ) async {
    await _persist(userId, server);
    if (_silentBaseline) {
      _silentBaseline = false;
      return;
    }
    final newly = server.difference(known);
    if (newly.isEmpty) return;
    final notifier = ref.read(notificationsProvider.notifier);
    for (final id in newly) {
      final matches = allBadges.where((b) => b.id == id);
      if (matches.isEmpty) continue; // unknown id (older app) — skip
      final badge = matches.first;
      unawaited(notifier.push(
        kind: AppNotificationKind.info,
        title: 'Badge unlocked — ${badge.name}',
        body: badge.hint,
      ));
    }
  }

  Future<void> _persist(String userId, Set<String> ids) async {
    try {
      await ref.read(achievementsStorageProvider).write(userId, ids);
    } catch (e, st) {
      debugPrint('Achievements persist failed: $e\n$st');
    }
  }
}

final achievementsProvider =
    AsyncNotifierProvider<AchievementsNotifier, Set<String>>(
  AchievementsNotifier.new,
);

/// Convenience selector for the profile chip ("3 / 20 unlocked").
final achievementsProgressProvider = Provider<(int unlocked, int total)>((ref) {
  final unlocked = ref.watch(achievementsProvider).value ?? const {};
  return (unlocked.length, allBadges.length);
});
