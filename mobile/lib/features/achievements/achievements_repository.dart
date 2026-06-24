import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

/// Talks to the server-authoritative achievements API. The server decides what
/// is unlocked (anti-spoof, full history); the app just renders it against the
/// local visual catalog in badge_definitions.dart.
class AchievementsRepository {
  AchievementsRepository(this._dio);
  final Dio _dio;

  /// GET /achievements → the set of unlocked badge ids.
  Future<Set<String>> fetchUnlocked() async {
    final res = await _dio.get<Map<String, dynamic>>('/achievements');
    final list = (res.data?['badges'] as List?) ?? const [];
    final out = <String>{};
    for (final b in list) {
      if (b is Map && b['unlocked'] == true && b['id'] is String) {
        out.add(b['id'] as String);
      }
    }
    return out;
  }
}

final achievementsRepositoryProvider = Provider<AchievementsRepository>((ref) {
  return AchievementsRepository(ref.watch(apiClientProvider).dio);
});
