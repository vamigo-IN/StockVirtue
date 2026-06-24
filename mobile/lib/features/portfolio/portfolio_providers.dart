import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/portfolio.dart';
import '../../data/models/portfolio_history.dart';
import 'portfolio_repository.dart';

final portfolioProvider = FutureProvider<PortfolioSnapshot>((ref) {
  return ref.watch(portfolioRepositoryProvider).get();
});

/// Trailing daily equity snapshots. The window (in days) is part of the
/// provider key so the history screen can switch between 30/90/365/All
/// without losing the other windows from cache.
final portfolioHistoryProvider =
    FutureProvider.family<PortfolioHistory, int>((ref, days) {
  return ref.watch(portfolioRepositoryProvider).getHistory(days: days);
});
