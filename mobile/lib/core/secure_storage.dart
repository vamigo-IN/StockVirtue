import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// One shared [FlutterSecureStorage] instance for the whole app. Every
/// feature that persists state across launches (auth tokens, onboarding
/// flag, achievements, lesson progress, bookmarks, chart drawings, trade
/// notes, recently-viewed, notifications, response cache, preferences)
/// should grab this instance via [appSecureStorage] instead of calling
/// `const FlutterSecureStorage()` itself.
///
/// Why this matters:
///   * On Android, flutter_secure_storage v10 stores values encrypted with
///     per-key ciphers backed by the Keystore by default (the old
///     `encryptedSharedPreferences` flag is deprecated and ignored — existing
///     data is migrated automatically on first access), so no extra option is
///     needed for durable token / state storage.
///   * On iOS we pin keychain accessibility to "first unlock" so the
///     data survives reboots without becoming readable on the lock
///     screen — same trade-off Apple uses for app credentials.
const FlutterSecureStorage appSecureStorage = FlutterSecureStorage(
  iOptions: IOSOptions(
    accessibility: KeychainAccessibility.first_unlock,
  ),
);
