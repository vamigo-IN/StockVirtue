import 'secure_storage.dart';

/// Keys that hold one person's data on this phone: cached portfolio and its
/// history, starred symbols, recently viewed, trade notes, badges and lesson
/// progress. Settings (theme, order defaults) and the onboarding flag stay.
const List<String> _personalKeyPrefixes = [
  'stockvirtue.cache.',
  'stockvirtue.bookmarks',
  'stockvirtue.recentlyViewed',
  'stockvirtue.tradeNotes',
  'stockvirtue.achievements.',
  'stockvirtue.academy.completed.',
];

/// Removes the signed-out (or deleted) person's data from this phone, so the
/// next person to use it sees none of it. Never throws.
Future<void> clearPersonalData() async {
  try {
    final all = await appSecureStorage.readAll();
    for (final key in all.keys) {
      if (_personalKeyPrefixes.any(key.startsWith)) {
        await appSecureStorage.delete(key: key);
      }
    }
  } catch (_) {
    // Storage unavailable: nothing more we can do here.
  }
}
