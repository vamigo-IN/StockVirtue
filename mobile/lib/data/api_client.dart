import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../core/config.dart';
import '../core/notice_events.dart';
import 'auth_storage.dart';
import 'models/tokens.dart';

class ApiClient {
  ApiClient(this.dio);
  final Dio dio;
}

final apiClientProvider = Provider<ApiClient>((ref) {
  final dio = Dio(
    BaseOptions(
      baseUrl: defaultApiBaseUrl(),
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
      contentType: 'application/json',
    ),
  );

  if (kDebugMode) {
    // Quiet logger: successful requests and their fetched response bodies are
    // no longer printed. Only failed requests are logged to the console.
    dio.interceptors.add(PrettyDioLogger(
      request: false,
      requestHeader: false,
      requestBody: false,
      responseHeader: false,
      responseBody: false,
      error: true,
      compact: true,
      maxWidth: 100,
    ));
  }

  // Attach the access token to every request when we have one, refreshing
  // it first when it is about to expire: public calls (news, market data)
  // never answer 401, so without this they'd quietly go out anonymous.
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final storage = ref.read(authStorageProvider);
        final tokens = await storage.read();
        if (tokens != null && !options.headers.containsKey('Authorization')) {
          var access = tokens.accessToken;
          if (_expiresSoon(access)) {
            try {
              access = (await _sharedRefresh(dio, storage, tokens)).accessToken;
            } catch (_) {
              // Authenticated calls will 401 and go through onError below.
            }
          }
          options.headers['Authorization'] = 'Bearer $access';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // 401 → refresh once (shared with any other request doing the same),
        // then retry the original request once.
        final retried = error.requestOptions.extra['svRetried'] == true;
        if (error.response?.statusCode == 401 && !retried) {
          final storage = ref.read(authStorageProvider);
          final current = await storage.read();
          if (current != null) {
            final AuthTokens fresh;
            try {
              // Another request may already have refreshed: just retry.
              final sent = error.requestOptions.headers['Authorization'];
              fresh = sent == 'Bearer ${current.accessToken}'
                  ? await _sharedRefresh(dio, storage, current)
                  : current;
            } catch (_) {
              await storage.clear();
              return handler.next(error);
            }
            final clone = error.requestOptions
              ..headers['Authorization'] = 'Bearer ${fresh.accessToken}'
              ..extra['svRetried'] = true;
            try {
              return handler.resolve(await dio.fetch(clone));
            } on DioException catch (e) {
              // The retry's own failure; the session itself is fine.
              return handler.next(e);
            }
          }
        }
        // 403 notice_required: the app notice gate refuses this account
        // until it accepts the current privacy notice. Tell the privacy
        // lifecycle, which brings the notice screen up; the error still
        // reaches the caller.
        final notice = noticeRequiredIn(
          error.response?.statusCode,
          error.response?.data,
        );
        if (notice != null) reportNoticeRequired(notice);
        handler.next(error);
      },
    ),
  );

  return ApiClient(dio);
});

Future<AuthTokens> _refresh(Dio dio, String refreshToken) async {
  // Use a fresh request that does NOT pass through our auth interceptor.
  final res = await dio.post<Map<String, dynamic>>(
    '/auth/refresh',
    data: {'refreshToken': refreshToken},
    options: Options(headers: {'Authorization': null}),
  );
  return AuthTokens.fromJson(res.data!);
}

/// The refresh in progress, shared by every caller: refresh tokens are
/// single-use on the server, so two refreshes at once would sign the reader
/// out.
Future<AuthTokens>? _refreshing;

Future<AuthTokens> _sharedRefresh(
  Dio dio,
  AuthStorage storage,
  AuthTokens current,
) {
  return _refreshing ??= () async {
    try {
      final fresh = await _refresh(dio, current.refreshToken);
      await storage.write(fresh);
      return fresh;
    } finally {
      _refreshing = null;
    }
  }();
}

/// Whether an access token (a JWT) expires within the next minute. A token
/// that can't be read is left to the server to judge.
bool _expiresSoon(String jwt) {
  try {
    final parts = jwt.split('.');
    if (parts.length != 3) return false;
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
    );
    final exp = payload is Map ? payload['exp'] : null;
    if (exp is! num) return false;
    final expiresAt = DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000);
    return expiresAt.isBefore(DateTime.now().add(const Duration(minutes: 1)));
  } catch (_) {
    return false;
  }
}

/// Public access-token refresh, used outside the Dio 401 path (e.g. the
/// live-tick socket, which must hand the server a valid token when it
/// reconnects — its access token expires while the connection is idle).
Future<AuthTokens> refreshAuthTokens(Dio dio, String refreshToken) =>
    _refresh(dio, refreshToken);
