/// Deterministic referral codes derived from the user id. We use the
/// first 6 hex digits of a FNV-1a hash, uppercased — short enough to
/// type, stable per-user, no collisions in practice for any plausible
/// number of users.
///
/// Backend redemption (mapping incoming code → referrer + crediting the
/// referrer) is intentionally deferred — once that's built, the code we
/// emit here matches what the redemption endpoint will look up.
library;

import '../../core/config.dart';

String referralCodeFor(String userId) {
  if (userId.isEmpty) return 'SV-STOCKV';
  // FNV-1a 32-bit
  var hash = 0x811c9dc5;
  for (final c in userId.codeUnits) {
    hash ^= c;
    hash = (hash * 0x01000193) & 0xFFFFFFFF;
  }
  final hex = hash.toRadixString(16).padLeft(8, '0').toUpperCase();
  // "SV" prefix makes the code feel branded and recognisable in chat.
  return 'SV-${hex.substring(0, 6)}';
}

/// One-liner the user can paste into a message app. We rebuild it on each
/// share so we can change the wording without touching the share helper.
String referralInviteMessage(String code) {
  return 'Join me on StockVirtue — practise trading the Indian markets with '
      'virtual ₹10,00,000 of capital. Use my invite code $code when you '
      'sign up.\n\nGet the app: $kPlayStoreUrl';
}
