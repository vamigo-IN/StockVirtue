import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/api_client.dart';

/// Market data for the widgets inside news stories, from /api/v1/market.
/// Signed in, the app is served under the licence the newsroom set for the
/// app; every value comes back labelled LIVE, DELAYED or EOD with its time,
/// and is shown exactly as given (the app never makes up a price).

double? _num(Object? v) => v is num ? v.toDouble() : null;
String? _str(Object? v) => v is String && v.isNotEmpty ? v : null;
DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
List<Map<String, dynamic>> _maps(Object? v) => v is List
    ? v.whereType<Map>().map((m) => m.cast<String, dynamic>()).toList()
    : const [];

/// A labelled price.
class StoryQuote {
  const StoryQuote({
    required this.ref,
    required this.kind,
    required this.exchange,
    required this.symbol,
    required this.name,
    required this.ltp,
    this.open,
    this.high,
    this.low,
    this.prevClose,
    this.change,
    this.changePct,
    this.label,
    this.asOf,
    this.unit,
    this.contract,
    this.inTicker = false,
  });

  final String ref;
  final String kind; // INDEX | STOCK | COMMODITY | CURRENCY
  final String exchange;
  final String symbol;
  final String name;
  final double ltp;
  final double? open;
  final double? high;
  final double? low;
  final double? prevClose;
  final double? change;
  final double? changePct;
  final String? label;
  final DateTime? asOf;
  final String? unit;
  final String? contract;
  final bool inTicker;

  bool get isStock => kind == 'STOCK';

  static StoryQuote? fromJson(Map<String, dynamic> j) {
    final ref = _str(j['ref']);
    final ltp = _num(j['ltp']);
    if (ref == null || ltp == null) return null;
    final parts = ref.split(':');
    return StoryQuote(
      ref: ref,
      kind: _str(j['kind']) ?? 'STOCK',
      exchange: _str(j['exchange']) ?? parts.first,
      symbol: _str(j['symbol']) ?? (parts.length > 1 ? parts[1] : ref),
      name: _str(j['name']) ?? (parts.length > 1 ? parts[1] : ref),
      ltp: ltp,
      open: _num(j['open']),
      high: _num(j['high']),
      low: _num(j['low']),
      prevClose: _num(j['prevClose']),
      change: _num(j['change']),
      changePct: _num(j['changePct']),
      label: _str(j['label']),
      asOf: _date(j['asOf']),
      unit: _str(j['unit']),
      contract: _str(j['contract']),
      inTicker: j['inTicker'] == true,
    );
  }
}

/// Quotes plus the licence they were served under.
class StoryQuotes {
  const StoryQuotes({
    required this.right,
    required this.attribution,
    required this.quotes,
    this.delayMinutes,
  });
  final String right; // LIVE | DELAYED | EOD | OFF
  final String attribution;
  final List<StoryQuote> quotes;
  final int? delayMinutes;

  bool get off => right == 'OFF';

  static StoryQuotes fromJson(Map<String, dynamic> j, String listKey) =>
      StoryQuotes(
        right: _str(j['right']) ?? 'OFF',
        attribution: _str(j['attribution']) ?? '',
        delayMinutes: _num(j['delayMinutes'])?.toInt(),
        quotes: [
          for (final q in _maps(j[listKey])) ?StoryQuote.fromJson(q),
        ],
      );
}

/// A ranked list (movers, sectors, heatmap) with its label.
class StoryListRow {
  const StoryListRow({
    required this.ref,
    required this.symbol,
    required this.name,
    required this.ltp,
    this.change,
    this.changePct,
  });
  final String ref;
  final String symbol;
  final String name;
  final double ltp;
  final double? change;
  final double? changePct;
}

class StoryList {
  const StoryList({
    required this.available,
    required this.rows,
    this.reason,
    this.label,
    this.asOf,
    this.attribution = '',
  });
  final bool available;
  final String? reason; // rights | upstream
  final String? label;
  final DateTime? asOf;
  final String attribution;
  final List<StoryListRow> rows;

  static StoryList fromJson(Map<String, dynamic> j) => StoryList(
        available: j['available'] == true,
        reason: _str(j['reason']),
        label: _str(j['label']),
        asOf: _date(j['asOf']),
        attribution: _str(j['attribution']) ?? '',
        rows: [
          for (final r in _maps(j['data']))
            if (_str(r['ref']) != null && _num(r['ltp']) != null)
              StoryListRow(
                ref: r['ref'] as String,
                symbol: _str(r['symbol']) ?? r['ref'] as String,
                name: _str(r['name']) ?? _str(r['symbol']) ?? '',
                ltp: _num(r['ltp'])!,
                change: _num(r['change']),
                changePct: _num(r['changePct']),
              ),
        ],
      );
}

/// Candles for a chart, with its label.
class StoryChart {
  const StoryChart({
    required this.available,
    required this.closes,
    required this.candles,
    this.reason,
    this.label,
    this.asOf,
    this.attribution = '',
  });
  final bool available;
  final String? reason;
  final String? label;
  final DateTime? asOf;
  final String attribution;
  final List<double> closes;
  final List<({double o, double h, double l, double c})> candles;

  static StoryChart fromJson(Map<String, dynamic> j) {
    final data = j['data'] is Map ? (j['data'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final candles = [
      for (final c in _maps(data['candles']))
        if (_num(c['c']) != null)
          (
            o: _num(c['o']) ?? _num(c['c'])!,
            h: _num(c['h']) ?? _num(c['c'])!,
            l: _num(c['l']) ?? _num(c['c'])!,
            c: _num(c['c'])!,
          ),
    ];
    return StoryChart(
      available: j['available'] == true && candles.isNotEmpty,
      reason: _str(j['reason']),
      label: _str(j['label']),
      asOf: _date(j['asOf']),
      attribution: _str(j['attribution']) ?? '',
      candles: candles,
      closes: [for (final c in candles) c.c],
    );
  }
}

class StoryIpo {
  const StoryIpo({
    required this.symbol,
    required this.name,
    this.priceRange,
    this.openDate,
    this.closeDate,
    this.subscription,
    this.listingDate,
    this.issuePrice,
    this.gainPct,
  });
  final String symbol;
  final String name;
  final String? priceRange;
  final String? openDate;
  final String? closeDate;
  final double? subscription;
  final String? listingDate;
  final double? issuePrice;
  final double? gainPct;
}

class StoryIpoBoard {
  const StoryIpoBoard({
    required this.available,
    this.open = const [],
    this.upcoming = const [],
    this.listingSoon = const [],
    this.listed = const [],
    this.attribution = '',
  });
  final bool available;
  final List<StoryIpo> open;
  final List<StoryIpo> upcoming;
  final List<StoryIpo> listingSoon;
  final List<StoryIpo> listed;
  final String attribution;

  static List<StoryIpo> _issues(Object? v) => [
        for (final i in _maps(v))
          if (_str(i['symbol']) != null)
            StoryIpo(
              symbol: i['symbol'] as String,
              name: _str(i['companyName']) ?? i['symbol'] as String,
              priceRange: _str(i['priceRange']),
              openDate: _str(i['openDate']),
              closeDate: _str(i['closeDate']),
              subscription: _num(i['subscription']),
              listingDate: _str(i['listingDate']),
              issuePrice: _num(i['issuePrice']),
              gainPct: _num(i['gainPct']),
            ),
      ];

  static StoryIpoBoard fromJson(Map<String, dynamic> j) => StoryIpoBoard(
        available: j['available'] != false,
        open: _issues(j['open']),
        upcoming: _issues(j['upcoming']),
        listingSoon: _issues(j['listingSoon']),
        listed: _issues(j['recentlyListed']),
        attribution: _str(j['attribution']) ?? '',
      );
}

class StoryMarketRepository {
  StoryMarketRepository(this._dio);
  final Dio _dio;

  Future<Map<String, dynamic>> _get(String path, [Map<String, Object?>? q]) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/v1/market/$path',
      queryParameters: q,
    );
    return res.data ?? const {};
  }

  Future<StoryQuotes> snapshot() async =>
      StoryQuotes.fromJson(await _get('snapshot'), 'instruments');

  Future<StoryQuotes> quotes(List<String> refs) async =>
      StoryQuotes.fromJson(
        await _get('quotes', {'symbols': refs.join(',')}),
        'quotes',
      );

  Future<StoryList> movers(String type, String segment, int limit) async =>
      StoryList.fromJson(await _get('movers', {
        'type': type,
        if (type != 'active') 'segment': segment,
        'limit': limit,
      }));

  Future<StoryList> sectors() async => StoryList.fromJson(await _get('sectors'));

  Future<StoryList> heatmap(String index) async =>
      StoryList.fromJson(await _get('heatmap', {'index': index}));

  Future<StoryChart> chart(String ref, String range) async =>
      StoryChart.fromJson(await _get('chart', {'symbol': ref, 'range': range}));

  Future<StoryIpoBoard> ipos() async =>
      StoryIpoBoard.fromJson(await _get('ipos'));
}

final storyMarketProvider = Provider<StoryMarketRepository>((ref) {
  return StoryMarketRepository(ref.watch(apiClientProvider).dio);
});

final storySnapshotProvider = FutureProvider.autoDispose<StoryQuotes>((ref) {
  return ref.watch(storyMarketProvider).snapshot();
});

/// Keyed by the comma-joined refs, so equal lists share one request.
final storyQuotesProvider =
    FutureProvider.autoDispose.family<StoryQuotes, String>((ref, refs) {
  return ref.watch(storyMarketProvider).quotes(refs.split(','));
});

typedef MoversArgs = ({String type, String segment, int limit});

final storyMoversProvider =
    FutureProvider.autoDispose.family<StoryList, MoversArgs>((ref, a) {
  return ref.watch(storyMarketProvider).movers(a.type, a.segment, a.limit);
});

final storySectorsProvider = FutureProvider.autoDispose<StoryList>((ref) {
  return ref.watch(storyMarketProvider).sectors();
});

final storyHeatmapProvider =
    FutureProvider.autoDispose.family<StoryList, String>((ref, index) {
  return ref.watch(storyMarketProvider).heatmap(index);
});

typedef ChartArgs = ({String ref, String range});

final storyChartProvider =
    FutureProvider.autoDispose.family<StoryChart, ChartArgs>((ref, a) {
  return ref.watch(storyMarketProvider).chart(a.ref, a.range);
});

final storyIposProvider = FutureProvider.autoDispose<StoryIpoBoard>((ref) {
  return ref.watch(storyMarketProvider).ipos();
});
