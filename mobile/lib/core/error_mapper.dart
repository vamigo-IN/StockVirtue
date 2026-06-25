import 'package:dio/dio.dart';

/// Central, context-aware translator from any thrown error into a short,
/// friendly, CODE-FREE message for the UI. No HTTP status numbers, no broker
/// error codes, no exception dumps ever reach the user.
///
/// Pass [context] so the same status can mean different things per operation
/// (e.g. a 401 while logging in = wrong credentials; a 401 elsewhere = the
/// session expired). Screens should call this instead of `e.toString()` or
/// poking at `e.response.data` themselves.
String friendlyError(Object? error, {String? context}) {
  if (error is DioException) return _fromDio(error, context);
  if (error is String && error.trim().isNotEmpty && !_looksTechnical(error)) {
    return error.trim();
  }
  return 'Something went wrong. Please try again.';
}

String _fromDio(DioException error, String? context) {
  // Network / transport level — there's no HTTP response to read.
  switch (error.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
      return 'The server is taking too long to respond. Please try again.';
    case DioExceptionType.connectionError:
      return 'Can’t reach the server. Check your internet connection and try again.';
    case DioExceptionType.badCertificate:
      return 'Secure connection failed. Please try again later.';
    case DioExceptionType.cancel:
      return 'Request cancelled.';
    case DioExceptionType.badResponse:
    case DioExceptionType.unknown:
      break;
  }

  final status = error.response?.statusCode;
  final raw = _serverMessage(error.response?.data);

  // A known machine code from the backend → a human sentence.
  if (raw != null) {
    final mapped = _codeMessages[raw.trim().toUpperCase()];
    if (mapped != null) return mapped;
  }
  // A clean, human server message is usually the best thing to show.
  if (raw != null && !_looksTechnical(raw)) return raw;

  switch (status) {
    case 400:
      return 'That request couldn’t be completed. Please check your details and try again.';
    case 401:
      if (context == 'login' || context == 'auth') {
        return 'Incorrect email or password.';
      }
      return 'Your session has expired. Please sign in again.';
    case 403:
      return 'You don’t have permission to do that.';
    case 404:
      return 'We couldn’t find what you were looking for.';
    case 409:
      return 'That conflicts with something that already exists.';
    case 422:
      return 'Some details were invalid. Please review and try again.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    case 503:
      return 'This feature is temporarily unavailable. Please try again later.';
    default:
      if (status != null && status >= 500) {
        return 'Something went wrong on our end. Please try again shortly.';
      }
      return 'Something went wrong. Please try again.';
  }
}

/// Pulls the human message out of a NestJS error body, digging through the
/// nesting the global exception filter applies. The body can be:
///   { "message": "text" }
///   { "message": ["field error", ...] }              // validation
///   { "message": { "message": "text"|[...], ... } }  // re-wrapped HttpException
String? _serverMessage(dynamic data) {
  if (data is! Map) return null;
  dynamic m = data['message'];
  if (m is Map) m = m['message']; // unwrap one level
  if (m is List && m.isNotEmpty) return m.first.toString();
  if (m is String && m.trim().isNotEmpty) return m.trim();
  return null;
}

/// Known backend machine codes → friendly copy. Keeps the API stable (codes)
/// while the UI stays human.
const Map<String, String> _codeMessages = {
  'INSUFFICIENT_FUNDS':
      'You don’t have enough balance in your wallet for this order.',
  'INSUFFICIENT_MARGIN':
      'You don’t have enough margin available for this trade.',
  'INSUFFICIENT_QUANTITY':
      'You don’t hold enough quantity to place this order.',
};

/// Guards against leaking codes / raw exception text to users. Treats
/// SCREAMING_SNAKE codes, exception dumps, JSON blobs and bare HTTP status
/// words as "technical".
bool _looksTechnical(String s) {
  final t = s.trim();
  if (t.isEmpty) return true;
  if (t.startsWith('{') || t.startsWith('[')) return true;
  if (t.contains('Exception') || t.contains('\n')) return true;
  if (RegExp(r'^[A-Z][A-Z0-9_]{3,}$').hasMatch(t)) return true; // CODE_LIKE
  if (RegExp(
    r'^(bad request|unauthorized|forbidden|not found|conflict|internal server error|service unavailable)$',
    caseSensitive: false,
  ).hasMatch(t)) {
    return true;
  }
  return false;
}
