import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/leaderboard.dart';
import 'leaderboard_repository.dart';

final leaderboardProvider = FutureProvider<LeaderboardSnapshot>((ref) {
  return ref.watch(leaderboardRepositoryProvider).get();
});
