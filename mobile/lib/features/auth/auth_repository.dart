import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/tokens.dart';
import '../../data/models/user.dart';

class AuthResult {
  final AppUser user;
  final AuthTokens tokens;
  const AuthResult({required this.user, required this.tokens});
}

/// Result of an email/password login: either signed in ([auth] set) or the
/// account still needs email verification (server has re-sent the OTP).
class EmailLoginOutcome {
  final AuthResult? auth;
  const EmailLoginOutcome.success(this.auth);
  const EmailLoginOutcome.needsVerification() : auth = null;
  bool get requiresVerification => auth == null;
}

/// Which sign-in methods the app should offer, from GET /auth/config. The
/// Mobile-OTP flag is admin-controlled (paused/resumed from the admin panel).
class AuthConfig {
  final bool emailPasswordEnabled;
  final bool googleEnabled;
  final bool mobileOtpEnabled;
  const AuthConfig({
    required this.emailPasswordEnabled,
    required this.googleEnabled,
    required this.mobileOtpEnabled,
  });
  factory AuthConfig.fromJson(Map<String, dynamic> j) => AuthConfig(
        emailPasswordEnabled: j['emailPasswordEnabled'] as bool? ?? true,
        googleEnabled: j['googleEnabled'] as bool? ?? true,
        mobileOtpEnabled: j['mobileOtpEnabled'] as bool? ?? false,
      );
}

class AuthRepository {
  AuthRepository(this._dio);
  final Dio _dio;

  /// Exchanges a Firebase ID token (from email/password, phone, or Google
  /// sign-in) for our own access + refresh JWTs. The backend verifies the
  /// token via firebase-admin and upserts the User row — this is the single
  /// sign-in path for every method.
  Future<AuthResult> firebaseLogin(String idToken) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/firebase/login',
      data: {'idToken': idToken},
    );
    final data = res.data!;
    return AuthResult(
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(data),
    );
  }

  // ── Server email/password (no Firebase) ──────────────────────────

  /// Step 1 of sign-up: create the (unverified) account and trigger an
  /// email OTP. Throws on failure (e.g. email already registered).
  Future<void> registerEmail(String email, String password) async {
    await _dio.post(
      '/auth/email/register',
      data: {'email': email, 'password': password},
    );
  }

  /// Step 2 of sign-up: verify the emailed OTP → signed in.
  Future<AuthResult> verifyEmail(String email, String code) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/email/verify',
      data: {'email': email, 'code': code},
    );
    final data = res.data!;
    return AuthResult(
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(data),
    );
  }

  /// Email + password login. Returns tokens, or signals that the email still
  /// needs verifying (the server re-sends the OTP in that case).
  Future<EmailLoginOutcome> loginEmail(String email, String password) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/email/login',
      data: {'email': email, 'password': password},
    );
    final data = res.data!;
    if (data['requiresVerification'] == true) {
      return const EmailLoginOutcome.needsVerification();
    }
    return EmailLoginOutcome.success(
      AuthResult(
        user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
        tokens: AuthTokens.fromJson(data),
      ),
    );
  }

  Future<void> resendEmailOtp(String email) async {
    await _dio.post('/auth/email/resend', data: {'email': email});
  }

  /// Step 1 of forgot-password: ask the server to email a reset code. Returns
  /// nothing (the server responds neutrally whether or not the account exists).
  Future<void> requestPasswordReset(String email) async {
    await _dio.post('/auth/email/forgot', data: {'email': email});
  }

  /// Step 2 of forgot-password: verify the code + set a new password → signed in.
  Future<AuthResult> resetPassword(
    String email,
    String code,
    String newPassword,
  ) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/auth/email/reset',
      data: {'email': email, 'code': code, 'newPassword': newPassword},
    );
    final data = res.data!;
    return AuthResult(
      user: AppUser.fromJson(data['user'] as Map<String, dynamic>),
      tokens: AuthTokens.fromJson(data),
    );
  }

  Future<AuthConfig> fetchAuthConfig() async {
    final res = await _dio.get<Map<String, dynamic>>('/auth/config');
    return AuthConfig.fromJson(res.data!);
  }

  Future<AppUser> me() async {
    final res = await _dio.get<Map<String, dynamic>>('/auth/me');
    return AppUser.fromJson(res.data!);
  }

  /// Toggles the per-trade email opt-in. Returns the saved value.
  Future<bool> setTradeEmails(bool enabled) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      '/notifications/preferences',
      data: {'tradeEmails': enabled},
    );
    return res.data!['tradeEmails'] as bool? ?? enabled;
  }

  Future<AppUser> updateProfile({
    String? displayName,
    String? email,
    String? phone,
  }) async {
    final body = <String, dynamic>{};
    if (displayName != null) body['displayName'] = displayName;
    if (email != null) body['email'] = email;
    if (phone != null) body['phone'] = phone;
    final res = await _dio.patch<Map<String, dynamic>>(
      '/auth/me',
      data: body,
    );
    return AppUser.fromJson(res.data!);
  }

  Future<void> logout(String refreshToken) async {
    await _dio.post('/auth/logout', data: {'refreshToken': refreshToken});
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final api = ref.watch(apiClientProvider);
  return AuthRepository(api.dio);
});

/// Auth-method availability (which buttons to show on the login screen).
/// Re-fetched on demand; the Mobile-OTP option is gated on this.
final authConfigProvider = FutureProvider<AuthConfig>((ref) {
  return ref.watch(authRepositoryProvider).fetchAuthConfig();
});
