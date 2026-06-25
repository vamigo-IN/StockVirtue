import 'package:dio/dio.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

import '../../core/error_mapper.dart';

/// Turns an auth error into a short, user-facing message. Backend (Dio) errors
/// are delegated to the central [friendlyError] mapper with auth context;
/// Firebase/Google errors from the federated flows are handled here.
String friendlyAuthError(Object? err) {
  if (err is DioException) {
    return friendlyError(err, context: 'auth');
  }
  if (err is FirebaseAuthException) {
    switch (err.code) {
      case 'network-request-failed':
        return 'Network error. Check your connection and try again.';
      case 'too-many-requests':
        return 'Too many attempts. Please wait a moment and retry.';
      case 'invalid-verification-code':
        return 'Incorrect code. Please try again.';
      case 'invalid-phone-number':
        return 'That phone number looks invalid.';
      case 'operation-not-allowed':
        return 'This sign-in method is not enabled for the project.';
      default:
        return err.message ?? 'Authentication failed (${err.code}).';
    }
  }
  if (err is GoogleSignInException) {
    if (err.code == GoogleSignInExceptionCode.canceled) {
      return 'Sign-in cancelled.';
    }
    return 'Google sign-in failed. Please try again.';
  }
  if (err is StateError) return err.message;
  return err?.toString() ?? 'Something went wrong.';
}
