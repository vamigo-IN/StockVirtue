import 'dart:async';
import 'dart:convert';

/// A 403 `notice_required` answer: while the app notice gate is on, the API
/// refuses app use to an account that hasn't accepted the current privacy
/// notice (only reading and accepting it, signing out, deleting the account
/// and the person's data rights stay open).
class NoticeRequired {
  const NoticeRequired({this.currentNoticeVersion});

  /// The notice version the server wants accepted, when it said.
  final String? currentNoticeVersion;
}

final StreamController<NoticeRequired> _events =
    StreamController<NoticeRequired>.broadcast();

/// Every `notice_required` answer, from any call. The HTTP client adds them
/// and `privacyLifecycleProvider` listens (it refreshes the account's
/// privacy status at most once per 5 s). Deliberately no provider, so the
/// HTTP client doesn't depend on the auth controller.
Stream<NoticeRequired> get noticeRequiredEvents => _events.stream;

/// Adds one event. The failed call still reaches its caller.
void reportNoticeRequired(NoticeRequired event) => _events.add(event);

/// The machine code in an API error body, or null. Nest's exception filter
/// sends `{statusCode, message: {message, code, ...}, timestamp}`; a bare
/// `{code}` is accepted too, and so is the body as text.
String? errorBodyCode(Object? body) {
  final map = _asMap(body);
  if (map == null) return null;
  final message = map['message'];
  if (message is Map && message['code'] is String) {
    return message['code'] as String;
  }
  final code = map['code'];
  return code is String ? code : null;
}

/// The `notice_required` refusal in an answer with [status] and [body], or
/// null when it is anything else.
NoticeRequired? noticeRequiredIn(int? status, Object? body) {
  if (status != 403 || errorBodyCode(body) != 'notice_required') return null;
  final map = _asMap(body)!;
  final message = map['message'];
  final version = (message is Map ? message : map)['currentNoticeVersion'];
  return NoticeRequired(
    currentNoticeVersion:
        version is String && version.isNotEmpty ? version : null,
  );
}

Map<dynamic, dynamic>? _asMap(Object? body) {
  if (body is Map) return body;
  if (body is String && body.trimLeft().startsWith('{')) {
    try {
      final decoded = jsonDecode(body);
      return decoded is Map ? decoded : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}
