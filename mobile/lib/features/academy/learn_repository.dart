import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

/// Syncs Academy progress with the server. Lesson *content* is bundled in the
/// app; *completion* + quiz attempts live server-side so progress follows the
/// user across devices and feeds learning achievements.
class LearnRepository {
  LearnRepository(this._dio);
  final Dio _dio;

  /// GET /learn/progress → completed lesson ids.
  Future<Set<String>> fetchCompleted() async {
    final res = await _dio.get<Map<String, dynamic>>('/learn/progress');
    final list = (res.data?['completedLessons'] as List?) ?? const [];
    return list.map((e) => e.toString()).toSet();
  }

  /// POST /learn/lessons/:id/complete, optionally recording the end-of-lesson
  /// quiz result. Returns the refreshed completed-lesson set.
  Future<Set<String>> complete(String lessonId, {int? score, int? total}) async {
    final body = <String, dynamic>{};
    if (score != null) body['score'] = score;
    if (total != null) body['total'] = total;
    final res = await _dio.post<Map<String, dynamic>>(
      '/learn/lessons/$lessonId/complete',
      data: body,
    );
    final list = (res.data?['completedLessons'] as List?) ?? const [];
    return list.map((e) => e.toString()).toSet();
  }
}

final learnRepositoryProvider = Provider<LearnRepository>((ref) {
  return LearnRepository(ref.watch(apiClientProvider).dio);
});
