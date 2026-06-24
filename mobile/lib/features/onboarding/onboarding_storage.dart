import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../core/secure_storage.dart';

/// Persists whether the user has seen the post-signup learning slides.
/// Uses the same secure-storage config as auth (EncryptedSharedPreferences
/// on Android, first-unlock keychain on iOS) so the flag actually survives
/// across app launches — the bare-`FlutterSecureStorage()` default uses
/// the Android Keystore backend, which has known flakiness around
/// app-upgrade and cold-start.
///
/// "Seen" follows the install, not the account: skipping once on this
/// device means "don't show me again on this device", even after logout.
class OnboardingStorage {
  OnboardingStorage(this._storage);
  final FlutterSecureStorage _storage;
  static const _key = 'stockvirtue.onboarded';

  Future<bool> hasSeen() async {
    try {
      final v = await _storage.read(key: _key);
      return v == '1';
    } catch (e, st) {
      // Corrupted keystore / migrated install — never block the user on
      // the onboarding screen because storage glitched. The AuthGate's
      // createdAt-fallback catches this on the returning-user side.
      debugPrint('OnboardingStorage.hasSeen failed: $e\n$st');
      return false;
    }
  }

  Future<void> markSeen() async {
    try {
      await _storage.write(key: _key, value: '1');
    } catch (e, st) {
      debugPrint('OnboardingStorage.markSeen failed: $e\n$st');
    }
  }
}

final onboardingStorageProvider = Provider<OnboardingStorage>((ref) {
  return OnboardingStorage(appSecureStorage);
});

/// Cached AsyncNotifier so the AuthGate can react synchronously after the
/// markSeen() call without re-reading from storage.
class OnboardingSeen extends AsyncNotifier<bool> {
  @override
  Future<bool> build() => ref.read(onboardingStorageProvider).hasSeen();

  Future<void> markSeen() async {
    await ref.read(onboardingStorageProvider).markSeen();
    state = const AsyncData(true);
  }
}

final onboardingSeenProvider =
    AsyncNotifierProvider<OnboardingSeen, bool>(OnboardingSeen.new);
