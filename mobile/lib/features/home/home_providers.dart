import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../market/market_repository.dart';
import 'indices_universe.dart';

/// Curated indices shown in the home strip — top of [broadIndices] so the
/// row stays compact. The full IndicesScreen renders every entry from
/// [indexGroups].
List<String> get homeIndices => homeStripIndexSymbols();

/// Curated "trending" large-cap equities. Hard-coded for now — when we ship
/// real popularity signals (e.g., most-bought-today) this list moves to a
/// server endpoint.
const homeTrending = <String>[
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'BHARTIARTL',
  'SBIN',
  'LT',
  'ITC',
  'HINDUNILVR',
  'AXISBANK',
  'KOTAKBANK',
];

/// Resolves a list of index symbols (each carrying its own exchange) into
/// FeedQuotes via batched multi-quote calls per exchange.
Future<List<FeedQuote>> _fetchIndexQuotes(
  MarketRepository repo,
  List<IndexEntry> entries,
) async {
  if (entries.isEmpty) return const [];
  final byExchange = <String, List<String>>{};
  for (final e in entries) {
    (byExchange[e.exchange] ??= []).add(e.symbol);
  }
  final calls = byExchange.entries
      .map((kv) => repo.getQuotes(kv.value, exchange: kv.key))
      .toList();
  final results = await Future.wait(calls);
  final bySymbol = <String, FeedQuote>{
    for (final list in results)
      for (final q in list) '${q.exchange}:${q.symbol.toUpperCase()}': q,
  };
  return [
    for (final e in entries)
      if (bySymbol['${e.exchange}:${e.symbol.toUpperCase()}'] != null)
        bySymbol['${e.exchange}:${e.symbol.toUpperCase()}']!,
  ];
}

final homeIndicesProvider = FutureProvider<List<FeedQuote>>((ref) {
  final repo = ref.watch(marketRepositoryProvider);
  return _fetchIndexQuotes(repo, broadIndices.take(6).toList());
});

/// Quotes for every index in [indexGroups] — drives the full IndicesScreen.
final allIndexQuotesProvider = FutureProvider<List<FeedQuote>>((ref) {
  final repo = ref.watch(marketRepositoryProvider);
  return _fetchIndexQuotes(repo, allIndices);
});

final homeTrendingProvider = FutureProvider<List<FeedQuote>>((ref) {
  return ref
      .watch(marketRepositoryProvider)
      .getQuotes(homeTrending, exchange: 'NSE');
});

/// (cap-segment, mover-type) tuple driving the [moversProvider].
class MoversArgs {
  final String segment;
  final String type;
  const MoversArgs({required this.segment, required this.type});

  @override
  bool operator ==(Object other) =>
      other is MoversArgs && other.segment == segment && other.type == type;

  @override
  int get hashCode => Object.hash(segment, type);
}

final moversProvider =
    FutureProvider.family<List<MoverQuote>, MoversArgs>((ref, args) {
  return ref.watch(marketRepositoryProvider).getMovers(
        segment: args.segment,
        type: args.type,
      );
});
