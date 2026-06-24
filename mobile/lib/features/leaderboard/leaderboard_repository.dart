import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/leaderboard.dart';

class LeaderboardRepository {
  LeaderboardRepository(this._dio);
  final Dio _dio;

  Future<LeaderboardSnapshot> get({int limit = 50}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/leaderboard',
      queryParameters: {'limit': limit},
    );
    return LeaderboardSnapshot.fromJson(res.data!);
  }
}

final leaderboardRepositoryProvider = Provider<LeaderboardRepository>((ref) {
  return LeaderboardRepository(ref.watch(apiClientProvider).dio);
});
