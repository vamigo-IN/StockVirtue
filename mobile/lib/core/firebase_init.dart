import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Web/server OAuth client ID from `google-services.json` (the `oauth_client`
/// entry with `client_type: 3`). Passed to GoogleSignIn so the returned ID
/// token is minted for the Firebase web client and therefore accepted by
/// Firebase Auth. Safe to embed — it is a public client identifier, not a
/// secret.
const String googleServerClientId =
    '524853413405-0719u29hhml63nnbl8pfrn2nud2c56t4.apps.googleusercontent.com';

/// Initializes Firebase at app start. Real auth (Email/Password, Phone, Google)
/// depends on this succeeding. On Android the config is read from
/// `google-services.json`, which the `com.google.gms.google-services` Gradle
/// plugin compiles into app resources.
///
/// We don't rethrow on failure: a missing/invalid config shouldn't blank the
/// whole app. Instead the auth screens surface the error when the user tries
/// to sign in (Firebase calls will throw a clear "no Firebase app" message).
Future<void> initFirebase() async {
  try {
    await Firebase.initializeApp();
    if (kDebugMode) debugPrint('[firebase] initialized');
  } catch (err) {
    if (kDebugMode) debugPrint('[firebase] init FAILED: $err');
  }
  // For web, generate firebase_options.dart via `flutterfire configure` and
  // pass `options: DefaultFirebaseOptions.currentPlatform` to initializeApp.
}
