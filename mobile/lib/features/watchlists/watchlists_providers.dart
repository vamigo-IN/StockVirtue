import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/watchlist.dart';
import 'watchlists_repository.dart';

final watchlistsListProvider = FutureProvider<List<Watchlist>>((ref) async {
  return ref.watch(watchlistsRepositoryProvider).list();
});

/// Single watchlist by id, served from the list response.
final watchlistDetailProvider =
    FutureProvider.family<Watchlist?, String>((ref, id) async {
  final all = await ref.watch(watchlistsListProvider.future);
  try {
    return all.firstWhere((w) => w.id == id);
  } catch (_) {
    return null;
  }
});

final watchlistInitialQuotesProvider =
    FutureProvider.autoDispose.family<WatchlistQuotes, String>(
  (ref, id) async => ref.watch(watchlistsRepositoryProvider).quotes(id),
);
