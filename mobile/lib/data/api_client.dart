import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../core/config.dart';
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

  // Attach the access token to every request when we have one.
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final tokens = await ref.read(authStorageProvider).read();
        if (tokens != null && !options.headers.containsKey('Authorization')) {
          options.headers['Authorization'] = 'Bearer ${tokens.accessToken}';
        }
        handler.next(options);
      },
      onError: (error, handler) async {
        // 401 → try refresh once, then retry the original request.
        if (error.response?.statusCode == 401) {
          final storage = ref.read(authStorageProvider);
          final current = await storage.read();
          if (current != null) {
            try {
              final refreshed = await _refresh(dio, current.refreshToken);
              await storage.write(refreshed);
              final clone = error.requestOptions
                ..headers['Authorization'] = 'Bearer ${refreshed.accessToken}';
              final response = await dio.fetch(clone);
              return handler.resolve(response);
            } catch (_) {
              await storage.clear();
            }
          }
        }
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
