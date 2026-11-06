import 'dart:async';

import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/analytics.dart';
import '../../core/firebase_init.dart';
import '../../core/local_data.dart';
import '../../core/notice_events.dart';
import '../../data/auth_storage.dart';
import '../../data/models/user.dart';
import '../bookmarks/bookmarks_storage.dart';
import '../home/recently_viewed_storage.dart';
import '../notifications/notifications_repository.dart';
import '../notifications/push_service.dart';
import '../orders/trade_notes_storage.dart';
import '../privacy/privacy_repository.dart';
import 'auth_errors.dart';
import 'auth_repository.dart';

/// How long a sign-up waits for the privacy notice's current version, per
/// try (it tries twice).
const kNoticeFetchTimeout = Duration(seconds: 8);

/// The machine code of an API error (`message.code`), or null.
String? apiErrorCode(Object? error) =>
    error is DioException ? errorBodyCode(error.response?.data) : null;

/// 409 `notice_outdated`: the privacy notice changed since the app read it,
/// or the analytics question is now due afresh.
bool isNoticeOutdated(Object? error) =>
    error is DioException &&
    error.response?.statusCode == 409 &&
    apiErrorCode(error) == 'notice_outdated';

/// The server refused a sign-up's agreement to the privacy notice: 428
/// `consent_required` (none was sent, for example because the notice couldn't
/// be read) or 409 `notice_outdated` (it changed meanwhile).
bool isConsentRefusal(Object? error) =>
    error is DioException &&
    (error.response?.statusCode == 428 || isNoticeOutdated(error));

/// The server's words from the last refused sign-up agreement (see
/// [isConsentRefusal]).
class ConsentRefusal {
  const ConsentRefusal(this.message);
  final String message;
}

class ConsentRefusalNotifier extends Notifier<ConsentRefusal?> {
  @override
  ConsentRefusal? build() => null;

  void report(String message) => state = ConsentRefusal(message);
}

/// The sign-in screen listens: it unticks its consent box and shows the
/// message, so the person ticks again, informed (never a silent retry).
final consentRefusalProvider =
    NotifierProvider<ConsentRefusalNotifier, ConsentRefusal?>(
  ConsentRefusalNotifier.new,
);

class AuthController extends AsyncNotifier<AppUser?> {
  /// A referral code the user typed on the sign-up form. It can't be redeemed
  /// until they're authenticated, so we stash it here and the complete-profile
  /// step claims it once the account exists. Cleared after it's consumed.
  String? pendingReferralCode;

  /// Ticked on the sign-in screen: "I'm 18 or older and I agree to the
  /// privacy notice and terms". Sent with sign-up so the server records the
  /// consent before the account exists (DPDP Act 2023 s.6).
  bool consentGiven = false;

  /// The notice the person agreed to on the sign-in screen: the server's
  /// current version, read afresh now (a version read earlier may be out of
  /// date), trying twice. Null when the box isn't ticked or the notice can't
  /// be read: never a version the app made up. An existing account signs in
  /// anyway and meets the notice screen if it needs it; a new account gets
  /// 428 `consent_required` in strict mode, and the sign-in screen asks again.
  Future<Map<String, dynamic>?> _consent() async {
    if (!consentGiven) return null;
    final privacy = ref.read(privacyRepositoryProvider);
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        final version =
            (await privacy.info().timeout(kNoticeFetchTimeout)).noticeVersion;
        return version == null ? null : {'noticeVersion': version, 'adult': true};
      } catch (_) {
        // Slow or offline: one more try, then no consent payload.
      }
    }
    return null;
  }

  /// A sign-up refused over the notice: untick (the person ticks again,
  /// informed), let the notice be read afresh, and tell the sign-in screen.
  /// The caller still gets the error.
  void _consentRefused(Object error) {
    if (!isConsentRefusal(error)) return;
    consentGiven = false;
    ref.invalidate(privacyInfoProvider);
    ref.read(consentRefusalProvider.notifier).report(friendlyAuthError(error));
  }

  @override
  Future<AppUser?> build() async {
    final storage = ref.read(authStorageProvider);
    final tokens = await storage.read();
    if (tokens == null) return null;
    try {
      final user = await ref.read(authRepositoryProvider).me();
      Analytics.instance.setCollection(user.analyticsConsent);
      return user;
    } catch (_) {
      // Either expired or invalid. The Dio interceptor will already have
      // attempted a refresh + retry on 401, so if we land here we are out.
      await storage.clear();
      return null;
    }
  }

  // ── Server email/password (no Firebase) ──────────────────────────

  /// Sign-up step 1: create the account + trigger an email OTP. No auth-state
  /// change yet — the UI routes to the verify screen on success. Throws on
  /// failure (e.g. email already registered) for the screen to surface.
  Future<void> registerWithEmail(String email, String password) async {
    try {
      await ref
          .read(authRepositoryProvider)
          .registerEmail(email, password, consent: await _consent());
    } catch (e) {
      _consentRefused(e);
      rethrow;
    }
  }

  /// Verify the emailed OTP and exchange it for app tokens (signs in).
  Future<void> verifyEmailOtp(String email, String code) async {
    state = const AsyncLoading<AppUser?>();
    state = await AsyncValue.guard(() async {
      final result =
          await ref.read(authRepositoryProvider).verifyEmail(email, code);
      await ref.read(authStorageProvider).write(result.tokens);
      await Analytics.instance.setCollection(result.user.analyticsConsent);
      Analytics.instance.logSignUp('email');
      return result.user;
    });
  }

  /// Email + password sign-in. Returns true when the account still needs email
  /// verification (UI routes to the verify screen); false once signed in.
  Future<bool> loginWithEmail(String email, String password) async {
    final outcome =
        await ref.read(authRepositoryProvider).loginEmail(email, password);
    final auth = outcome.auth;
    if (auth == null) return true; // requires verification
    await ref.read(authStorageProvider).write(auth.tokens);
    await Analytics.instance.setCollection(auth.user.analyticsConsent);
    Analytics.instance.logLogin('password');
    state = AsyncData<AppUser?>(auth.user);
    return false;
  }

  Future<void> resendEmailOtp(String email) {
    return ref.read(authRepositoryProvider).resendEmailOtp(email);
  }

  /// Forgot-password step 1: trigger a reset code email. No auth-state change.
  Future<void> requestPasswordReset(String email) {
    return ref.read(authRepositoryProvider).requestPasswordReset(email);
  }

  /// Forgot-password step 2: verify the code + set a new password (signs in).
  Future<void> resetPassword(String email, String code, String newPassword) async {
    state = const AsyncLoading<AppUser?>();
    state = await AsyncValue.guard(() async {
      final result = await ref
          .read(authRepositoryProvider)
          .resetPassword(email, code, newPassword);
      await ref.read(authStorageProvider).write(result.tokens);
      await Analytics.instance.setCollection(result.user.analyticsConsent);
      Analytics.instance.logLogin('password_reset');
      return result.user;
    });
  }

  // ── Firebase Phone Auth ──────────────────────────────────────────

  /// Kicks off Firebase phone verification. Returns the verificationId that
  /// the OtpScreen needs to pair with the user-entered SMS code.
  Future<String> sendFirebaseOtp(String phone) {
    final completer = Completer<String>();
    FirebaseAuth.instance.verifyPhoneNumber(
      phoneNumber: phone,
      timeout: const Duration(seconds: 60),
      verificationCompleted: (PhoneAuthCredential credential) async {
        // Android auto-retrieval: sign in immediately and exchange.
        state = const AsyncLoading<AppUser?>();
        state = await AsyncValue.guard(() async {
          final cred =
              await FirebaseAuth.instance.signInWithCredential(credential);
          return _exchangeUserCredential(cred, method: 'phone');
        });
      },
      verificationFailed: (FirebaseAuthException e) {
        if (!completer.isCompleted) completer.completeError(e);
      },
      codeSent: (String verificationId, int? _) {
        if (!completer.isCompleted) completer.complete(verificationId);
      },
      codeAutoRetrievalTimeout: (_) {},
    );
    return completer.future;
  }

  Future<void> verifyFirebaseOtp(String verificationId, String code) async {
    state = const AsyncLoading<AppUser?>();
    state = await AsyncValue.guard(() async {
      final credential = PhoneAuthProvider.credential(
        verificationId: verificationId,
        smsCode: code,
      );
      final cred =
          await FirebaseAuth.instance.signInWithCredential(credential);
      return _exchangeUserCredential(cred, method: 'phone');
    });
  }

  // ── Google sign-in ───────────────────────────────────────────────

  /// Throws when cancelled or refused. Auth state only changes on success:
  /// the login screen shows its own progress and the reason for a failure,
  /// and a loading or error state here would replace it (a cancelled sign-in
  /// used to land on a full-screen error).
  Future<void> signInWithGoogle() async {
    await _ensureGoogleInitialized();
    final GoogleSignInAccount googleUser;
    try {
      // v7: authenticate() throws on cancel/failure instead of returning null.
      googleUser = await GoogleSignIn.instance.authenticate();
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        throw StateError('Google sign-in cancelled');
      }
      rethrow;
    }
    // v7: authentication is synchronous and only exposes the ID token.
    final googleAuth = googleUser.authentication;
    final credential = GoogleAuthProvider.credential(
      idToken: googleAuth.idToken,
    );
    final cred = await FirebaseAuth.instance.signInWithCredential(credential);
    final user = await _exchangeUserCredential(cred, method: 'google');
    state = AsyncData<AppUser?>(user);
  }

  // ── Shared backend exchange ──────────────────────────────────────

  /// Pulls the Firebase ID token off a freshly-signed-in user and trades it
  /// with our backend for app JWTs. Used by every sign-in method.
  Future<AppUser> _exchangeUserCredential(
    UserCredential cred, {
    required String method,
  }) async {
    final idToken = await cred.user?.getIdToken();
    if (idToken == null) {
      throw StateError('Firebase did not return an ID token');
    }
    final AuthResult result;
    try {
      result = await ref
          .read(authRepositoryProvider)
          .firebaseLogin(idToken, consent: await _consent());
    } catch (e) {
      _consentRefused(e);
      rethrow;
    }
    await ref.read(authStorageProvider).write(result.tokens);
    await Analytics.instance.setCollection(result.user.analyticsConsent);
    Analytics.instance.logLogin(method);
    return result.user;
  }

  // ── Preferences ──────────────────────────────────────────────────

  /// Opt in/out of per-trade emails; reflects the saved value into auth state.
  Future<void> setTradeEmails(bool enabled) async {
    final value =
        await ref.read(authRepositoryProvider).setTradeEmails(enabled);
    final current = state.value;
    if (current != null) {
      state = AsyncData<AppUser?>(current.copyWith(tradeEmailsOptIn: value));
    }
  }

  // ── Profile updates ──────────────────────────────────────────────

  Future<void> updateProfile({
    String? displayName,
    String? email,
    String? phone,
  }) async {
    final updated = await ref
        .read(authRepositoryProvider)
        .updateProfile(displayName: displayName, email: email, phone: phone);
    state = AsyncData<AppUser?>(updated);
  }

  // ── Privacy ──────────────────────────────────────────────────────

  /// Accepts the privacy notice the screen showed, confirms 18+, and records
  /// the analytics box.
  ///
  /// [noticeVersion] is the `currentNoticeVersion` the screen drew, never one
  /// read at the tap: a version published while the screen was open has a
  /// date and summary the person never saw. [analyticsPrefilled] is the value
  /// the analytics box started at, given only when the screen set the box to
  /// the person's current choice. On 409 `notice_outdated` (a newer notice,
  /// or the analytics question is now due afresh) the status is read again,
  /// so the screen redraws with the new summary and boxes, and the server's
  /// message reaches the screen.
  Future<void> acceptPrivacyNotice({
    required String? noticeVersion,
    required bool analytics,
    bool? analyticsPrefilled,
  }) async {
    if (noticeVersion == null) {
      // The server didn't say which notice is current: read it again, so the
      // screen shows it, and let the person accept that one.
      await refreshPrivacy();
      throw StateError('No notice version to accept');
    }
    final PrivacyStatus status;
    try {
      status = await ref.read(privacyRepositoryProvider).acceptNotice(
            noticeVersion: noticeVersion,
            adult: true,
            analytics: analytics,
            analyticsPrefilled: analyticsPrefilled,
          );
    } catch (e) {
      if (isNoticeOutdated(e)) {
        try {
          await refreshPrivacy();
        } catch (_) {
          // The message still shows; the next resume or tap reads it again.
        }
      }
      rethrow;
    }
    await Analytics.instance.setCollection(status.analytics);
    final current = state.value;
    if (current != null) {
      state = AsyncData<AppUser?>(current.withNotice(status.notice));
    }
  }

  /// Reads the account's privacy status again (GET /v1/privacy/me, open while
  /// the notice is pending) and takes its notice fields, so the notice screen
  /// shows, hides or redraws. Throws when the call fails; does nothing while
  /// signed out.
  Future<void> refreshPrivacy() async {
    final before = state.value;
    if (before == null) return;
    final status = await ref.read(privacyRepositoryProvider).status();
    final current = state.value;
    // Signed out, or another account signed in, while it was loading.
    if (current == null || current.id != before.id) return;
    if (_sameNotice(current, status.notice)) return;
    state = AsyncData<AppUser?>(current.withNotice(status.notice));
    if (status.analytics != current.analyticsConsent) {
      // Changed elsewhere (another phone, or a withdrawal request): follow it.
      await Analytics.instance.setCollection(status.analytics);
    }
  }

  static bool _sameNotice(AppUser user, NoticeState notice) =>
      user.needsPrivacyNotice == notice.needsNotice &&
      user.analyticsConsent == notice.analytics &&
      user.acceptedNoticeVersion == notice.acceptedVersion &&
      user.currentNoticeVersion == notice.currentVersion &&
      user.noticeUpdatedAt == notice.updatedAt &&
      user.noticeChangeSummary?.en == notice.changeSummary?.en &&
      user.noticeChangeSummary?.hi == notice.changeSummary?.hi &&
      (user.noticeChangeSummary == null) == (notice.changeSummary == null) &&
      user.analyticsReask == notice.analyticsReask;

  /// Gives or withdraws consent to app analytics.
  Future<void> setAnalyticsConsent(bool allowed) async {
    final status =
        await ref.read(privacyRepositoryProvider).setAnalytics(allowed);
    await Analytics.instance.setCollection(status.analytics);
    final current = state.value;
    if (current != null) {
      state = AsyncData<AppUser?>(
        current.copyWith(analyticsConsent: status.analytics),
      );
    }
  }

  /// Deletes the account on the server, then everything about it here.
  Future<DateTime?> deleteAccount({String? reason}) async {
    final eraseAfter = await ref
        .read(privacyRepositoryProvider)
        .deleteAccount(reason: reason);
    // The server already dropped this phone's push token and every session.
    await _signOutLocally();
    return eraseAfter;
  }

  /// Signs out of Firebase and Google and clears this phone: tokens, the
  /// person's cached data, the push token and analytics.
  Future<void> _signOutLocally() async {
    try {
      await FirebaseAuth.instance.signOut();
    } catch (_) {}
    try {
      await _ensureGoogleInitialized();
      await GoogleSignIn.instance.signOut();
    } catch (_) {}
    await ref.read(authStorageProvider).clear();
    await ref.read(pushServiceProvider).dropLocalToken();
    await clearPersonalData();
    ref
      ..invalidate(bookmarksProvider)
      ..invalidate(recentlyViewedProvider)
      ..invalidate(tradeNotesProvider);
    await Analytics.instance.setCollection(false);
    consentGiven = false;
    state = const AsyncData<AppUser?>(null);
  }

  // ── Logout ───────────────────────────────────────────────────────

  Future<void> logout() async {
    final storage = ref.read(authStorageProvider);
    final tokens = await storage.read();
    if (tokens != null) {
      // Stop pushes to this phone (they name the account's stocks) while
      // the session can still say so.
      await ref
          .read(pushServiceProvider)
          .forgetDevice(ref.read(notificationsRepositoryProvider));
      try {
        await ref.read(authRepositoryProvider).logout(tokens.refreshToken);
      } catch (_) {
        // ignore network errors — we still want to clear local state
      }
    }
    Analytics.instance.logLogout();
    await _signOutLocally();
  }
}

/// v7 requires [GoogleSignIn.initialize] to be called exactly once before any
/// other method. Cache the future so concurrent callers share one init, and
/// drop the cache on failure so a later attempt can retry.
Future<void>? _googleInitFuture;
Future<void> _ensureGoogleInitialized() {
  return _googleInitFuture ??= () async {
    try {
      // serverClientId makes the returned ID token target the Firebase web
      // client so FirebaseAuth.signInWithCredential accepts it on Android.
      await GoogleSignIn.instance.initialize(
        serverClientId: googleServerClientId,
      );
    } catch (_) {
      _googleInitFuture = null;
      rethrow;
    }
  }();
}

final authControllerProvider =
    AsyncNotifierProvider<AuthController, AppUser?>(AuthController.new);
