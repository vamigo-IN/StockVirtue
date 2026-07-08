import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

/// Talks to the server-owned notification inbox. The backend is the source of
/// truth (order fills, price alerts, achievements, market-close reminders,
/// admin broadcasts); the app fetches history, unread count, and marks read.
class NotificationsRepository {
  NotificationsRepository(this._dio);
  final Dio _dio;

  /// GET /notifications → the caller's inbox (newest first).
  Future<List<Map<String, dynamic>>> list() async {
    final res = await _dio.get<List<dynamic>>('/notifications');
    return (res.data ?? const [])
        .whereType<Map>()
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }

  Future<int> unreadCount() async {
    final res =
        await _dio.get<Map<String, dynamic>>('/notifications/unread-count');
    return (res.data?['count'] as num?)?.toInt() ?? 0;
  }

  Future<void> markRead(String id) async {
    await _dio.post<void>('/notifications/$id/read');
  }

  Future<void> markAllRead() async {
    await _dio.post<void>('/notifications/read-all');
  }

  /// Register this device's FCM token so the backend can push in the
  /// background. [platform] is 'android' | 'ios' | 'web'.
  Future<void> registerDevice(String token, String platform) async {
    await _dio.post<void>(
      '/notifications/devices',
      data: {'token': token, 'platform': platform},
    );
  }

  Future<void> unregisterDevice(String token) async {
    await _dio.delete<void>('/notifications/devices/$token');
  }
}

final notificationsRepositoryProvider =
    Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.watch(apiClientProvider).dio);
});
