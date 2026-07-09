import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/candle.dart';
import '../../data/models/option_chain.dart';

class StockSearchResult {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final String type; // EQUITY | INDEX | FUTURE | OPTION | OTHER
  final int lotSize;
  final double tickSize;

  const StockSearchResult({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.type,
    required this.lotSize,
    required this.tickSize,
  });

  bool get isIndex => type == 'INDEX';

  factory StockSearchResult.fromJson(Map<String, dynamic> json) =>
      StockSearchResult(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        type: (json['type'] as String?) ?? 'EQUITY',
        lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
        tickSize: (json['tickSize'] as num?)?.toDouble() ?? 0.05,
      );
}

class FeedQuote {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final int lotSize;
  final double tickSize;
  final double? ltp;
  final double? open;
  final double? high;
  final double? low;
  final double? close;

  const FeedQuote({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.lotSize,
    required this.tickSize,
    required this.ltp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
  });

  String get key => '$exchange:$symboltoken';

  double? get change {
    if (ltp == null || close == null) return null;
    return ltp! - close!;
  }

  double? get changePct {
    if (ltp == null || close == null || close == 0) return null;
    return ((ltp! - close!) / close!) * 100;
  }

  factory FeedQuote.fromJson(Map<String, dynamic> json) => FeedQuote(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
        tickSize: (json['tickSize'] as num?)?.toDouble() ?? 0.05,
        ltp: (json['ltp'] as num?)?.toDouble(),
        open: (json['open'] as num?)?.toDouble(),
        high: (json['high'] as num?)?.toDouble(),
        low: (json['low'] as num?)?.toDouble(),
        close: (json['close'] as num?)?.toDouble(),
      );
}

/// One row in the `/market/movers` response. Server-computed % changes (day
/// and intraday) ship inline so the carousel doesn't recompute per render.
class MoverQuote {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final double? ltp;
  final double? open;
  final double? close;
  final double? dayPct;
  final double? intradayPct;

  const MoverQuote({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.ltp,
    required this.open,
    required this.close,
    required this.dayPct,
    required this.intradayPct,
  });

  String get key => '$exchange:$symboltoken';

  factory MoverQuote.fromJson(Map<String, dynamic> json) => MoverQuote(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        ltp: (json['ltp'] as num?)?.toDouble(),
        open: (json['open'] as num?)?.toDouble(),
        close: (json['close'] as num?)?.toDouble(),
        dayPct: (json['dayPct'] as num?)?.toDouble(),
        intradayPct: (json['intradayPct'] as num?)?.toDouble(),
      );
}

/// F&O gainer/loser row from SmartAPI marketData feed.
class FnoMover {
  final String tradingsymbol;
  final String symboltoken;
  final double percentChange;
  final double opnInterest;
  final double netChangeOpnInterest;

  const FnoMover({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.percentChange,
    required this.opnInterest,
    required this.netChangeOpnInterest,
  });

  factory FnoMover.fromJson(Map<String, dynamic> json) => FnoMover(
        // SmartAPI returns symbolToken as a number; coerce so the cast can't
        // blow up ("int is not a subtype of String").
        tradingsymbol: json['tradingsymbol']?.toString() ?? '',
        symboltoken: json['symboltoken']?.toString() ?? '',
        percentChange: (json['percentChange'] as num?)?.toDouble() ?? 0,
        opnInterest: (json['opnInterest'] as num?)?.toDouble() ?? 0,
        netChangeOpnInterest:
            (json['netChangeOpnInterest'] as num?)?.toDouble() ?? 0,
      );
}

/// One row from /market/oi-buildup — already classified server-side.
class OIBuildupRow {
  final String tradingsymbol;
  final String symboltoken;
  final double ltp;
  final double netChange;
  final double percentChange;
  final double opnInterest;
  final double netChangeOpnInterest;

  const OIBuildupRow({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.ltp,
    required this.netChange,
    required this.percentChange,
    required this.opnInterest,
    required this.netChangeOpnInterest,
  });

  factory OIBuildupRow.fromJson(Map<String, dynamic> json) => OIBuildupRow(
        tradingsymbol: json['tradingsymbol']?.toString() ?? '',
        symboltoken: json['symboltoken']?.toString() ?? '',
        ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
        netChange: (json['netChange'] as num?)?.toDouble() ?? 0,
        percentChange: (json['percentChange'] as num?)?.toDouble() ?? 0,
        opnInterest: (json['opnInterest'] as num?)?.toDouble() ?? 0,
        netChangeOpnInterest:
            (json['netChangeOpnInterest'] as num?)?.toDouble() ?? 0,
      );
}

class PcrRow {
  final String tradingsymbol;
  final double pcr;
  const PcrRow({required this.tradingsymbol, required this.pcr});
  factory PcrRow.fromJson(Map<String, dynamic> json) => PcrRow(
        tradingsymbol: json['tradingsymbol']?.toString() ?? '',
        pcr: (json['pcr'] as num?)?.toDouble() ?? 0,
      );
}

/// One strike's official greeks from /market/option-greeks. [iv] is a
/// percentage (e.g. 14.5 = 14.5%); [optionType] is 'CE' or 'PE'.
class OptionGreekRow {
  final double strike;
  final String optionType;
  final double delta;
  final double gamma;
  final double theta;
  final double vega;
  final double iv;
  final double tradeVolume;

  const OptionGreekRow({
    required this.strike,
    required this.optionType,
    required this.delta,
    required this.gamma,
    required this.theta,
    required this.vega,
    required this.iv,
    required this.tradeVolume,
  });

  /// Stable key for merging into an option-chain row: `strike:CE` / `strike:PE`.
  String get key => '${strike.toStringAsFixed(2)}:${optionType.toUpperCase()}';

  factory OptionGreekRow.fromJson(Map<String, dynamic> json) => OptionGreekRow(
        strike: (json['strikePrice'] as num?)?.toDouble() ?? 0,
        optionType: json['optionType']?.toString() ?? '',
        delta: (json['delta'] as num?)?.toDouble() ?? 0,
        gamma: (json['gamma'] as num?)?.toDouble() ?? 0,
        theta: (json['theta'] as num?)?.toDouble() ?? 0,
        vega: (json['vega'] as num?)?.toDouble() ?? 0,
        iv: (json['iv'] as num?)?.toDouble() ?? 0,
        tradeVolume: (json['tradeVolume'] as num?)?.toDouble() ?? 0,
      );
}

/// One MCX commodity, resolved to its front-month future, with live rate.
class CommodityQuote {
  final String name; // e.g. GOLD (the underlying / display key)
  final String label; // e.g. Gold
  final String unit; // e.g. 10 g
  final String tradingsymbol; // the actual front-month contract
  final String symboltoken;
  final String exchange; // MCX
  final int lotSize;
  final String? expiry;
  final double ltp;
  final double open;
  final double high;
  final double low;
  final double close;
  final double change;
  final double changePct;

  const CommodityQuote({
    required this.name,
    required this.label,
    required this.unit,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.lotSize,
    required this.expiry,
    required this.ltp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.change,
    required this.changePct,
  });

  /// Tick-map key (`exchange:token`) for the live LTP overlay.
  String get tickKey => '$exchange:$symboltoken';

  factory CommodityQuote.fromJson(Map<String, dynamic> json) => CommodityQuote(
        name: json['name']?.toString() ?? '',
        label: json['label']?.toString() ?? '',
        unit: json['unit']?.toString() ?? '',
        tradingsymbol: json['tradingsymbol']?.toString() ?? '',
        symboltoken: json['symboltoken']?.toString() ?? '',
        exchange: json['exchange']?.toString() ?? 'MCX',
        lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
        expiry: json['expiry']?.toString(),
        ltp: (json['ltp'] as num?)?.toDouble() ?? 0,
        open: (json['open'] as num?)?.toDouble() ?? 0,
        high: (json['high'] as num?)?.toDouble() ?? 0,
        low: (json['low'] as num?)?.toDouble() ?? 0,
        close: (json['close'] as num?)?.toDouble() ?? 0,
        change: (json['change'] as num?)?.toDouble() ?? 0,
        changePct: (json['changePct'] as num?)?.toDouble() ?? 0,
      );
}

/// Backend's `/market/holidays` response. `source` flags whether the
/// list came from NSE's live API or our curated fallback.
class MarketHolidayEntry {
  final DateTime date;
  final String name;
  const MarketHolidayEntry({required this.date, required this.name});

  factory MarketHolidayEntry.fromJson(Map<String, dynamic> json) {
    final raw = json['date'] as String? ?? '';
    final parsed = DateTime.tryParse(raw) ?? DateTime(2000);
    return MarketHolidayEntry(
      date: DateTime(parsed.year, parsed.month, parsed.day),
      name: json['name'] as String? ?? 'Holiday',
    );
  }
}

class MarketHolidaysPayload {
  final String source; // "nse" | "curated"
  final DateTime fetchedAt;
  final List<MarketHolidayEntry> holidays;
  const MarketHolidaysPayload({
    required this.source,
    required this.fetchedAt,
    required this.holidays,
  });

  factory MarketHolidaysPayload.fromJson(Map<String, dynamic> json) =>
      MarketHolidaysPayload(
        source: json['source'] as String? ?? 'curated',
        fetchedAt: DateTime.tryParse(json['fetchedAt'] as String? ?? '') ??
            DateTime.now(),
        holidays: ((json['holidays'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(MarketHolidayEntry.fromJson)
            .toList(),
      );
}

class CandleOI {
  final String t;
  final double o;
  final double h;
  final double l;
  final double c;
  final double v;
  final double oi;
  const CandleOI({
    required this.t,
    required this.o,
    required this.h,
    required this.l,
    required this.c,
    required this.v,
    required this.oi,
  });
  factory CandleOI.fromJson(Map<String, dynamic> json) => CandleOI(
        t: json['t'] as String,
        o: (json['o'] as num).toDouble(),
        h: (json['h'] as num).toDouble(),
        l: (json['l'] as num).toDouble(),
        c: (json['c'] as num).toDouble(),
        v: (json['v'] as num).toDouble(),
        oi: (json['oi'] as num).toDouble(),
      );
}

/// One row from /market/scanners — works for volume, 52w-high and 52w-low.
class ScannerHit {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final double? ltp;
  final double? close;
  final double? dayChangePct;
  final double? tradeVolume;
  final double? yearHigh;
  final double? yearLow;
  final double? fromHighPct;
  final double? fromLowPct;

  const ScannerHit({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.ltp,
    required this.close,
    required this.dayChangePct,
    required this.tradeVolume,
    required this.yearHigh,
    required this.yearLow,
    required this.fromHighPct,
    required this.fromLowPct,
  });

  String get key => '$exchange:$symboltoken';

  factory ScannerHit.fromJson(Map<String, dynamic> json) => ScannerHit(
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        ltp: (json['ltp'] as num?)?.toDouble(),
        close: (json['close'] as num?)?.toDouble(),
        dayChangePct: (json['dayChangePct'] as num?)?.toDouble(),
        tradeVolume: (json['tradeVolume'] as num?)?.toDouble(),
        yearHigh: (json['yearHigh'] as num?)?.toDouble(),
        yearLow: (json['yearLow'] as num?)?.toDouble(),
        fromHighPct: (json['fromHighPct'] as num?)?.toDouble(),
        fromLowPct: (json['fromLowPct'] as num?)?.toDouble(),
      );
}

/// One constituent of a curated index. Same identity fields as a
/// search result so the row tap can push straight into
/// SymbolDetailScreen with no extra lookup. LTP / change fields come
/// from the multi-quote pass the backend stitches onto the response.
class IndexMember {
  final String symbol;
  final String name;
  final String exchange;
  final String? tradingsymbol;
  final String? symboltoken;
  final double? ltp;
  final double? close;
  final double? change;
  final double? changePct;

  const IndexMember({
    required this.symbol,
    required this.name,
    required this.exchange,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.ltp,
    required this.close,
    required this.change,
    required this.changePct,
  });

  factory IndexMember.fromJson(Map<String, dynamic> json) => IndexMember(
        symbol: json['symbol'] as String,
        name: json['name'] as String,
        exchange: json['exchange'] as String? ?? 'NSE',
        tradingsymbol: json['tradingsymbol'] as String?,
        symboltoken: json['symboltoken'] as String?,
        ltp: (json['ltp'] as num?)?.toDouble(),
        close: (json['close'] as num?)?.toDouble(),
        change: (json['change'] as num?)?.toDouble(),
        changePct: (json['changePct'] as num?)?.toDouble(),
      );
}

class MarketRepository {
  MarketRepository(this._dio);
  final Dio _dio;

  Future<List<StockSearchResult>> search(
    String query, {
    String exchange = 'NSE',
    int limit = 20,
  }) async {
    if (query.trim().isEmpty) return [];
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/search',
      queryParameters: {'q': query, 'exchange': exchange, 'limit': limit},
    );
    final results = (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return results.map(StockSearchResult.fromJson).toList();
  }

  /// Scanner endpoint. [type] is one of `volume`, `52w-high`, `52w-low`.
  Future<List<ScannerHit>> runScanner({
    required String type,
    int limit = 15,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/scanners',
      queryParameters: {'type': type, 'limit': limit},
    );
    final raw = (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return raw.map(ScannerHit.fromJson).toList();
  }

  Future<List<FnoMover>> getFnoMovers({
    String type = 'PercPriceGainers',
    String expiry = 'NEAR',
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/fno-movers',
      queryParameters: {'type': type, 'expiry': expiry},
    );
    final raw =
        (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return raw.map(FnoMover.fromJson).toList();
  }

  Future<List<OIBuildupRow>> getOIBuildup({
    String type = 'Long Built Up',
    String expiry = 'NEAR',
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/oi-buildup',
      queryParameters: {'type': type, 'expiry': expiry},
    );
    final raw =
        (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return raw.map(OIBuildupRow.fromJson).toList();
  }

  Future<List<PcrRow>> getPCR() async {
    final res = await _dio.get<Map<String, dynamic>>('/market/pcr');
    final raw =
        (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return raw.map(PcrRow.fromJson).toList();
  }

  /// Major MCX commodities, each as its front-month future with a live rate.
  Future<List<CommodityQuote>> getCommodities() async {
    final res = await _dio.get<Map<String, dynamic>>('/market/commodities');
    final raw = (res.data!['results'] as List?)?.cast<Map<String, dynamic>>() ??
        const [];
    return raw.map(CommodityQuote.fromJson).toList();
  }

  /// Official delta/gamma/theta/vega + IV per strike for an underlying at one
  /// expiry ("DDMMMYYYY"). Empty when SmartAPI has no live greeks for it.
  Future<List<OptionGreekRow>> getOptionGreeks(
    String underlying,
    String expiry,
  ) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/option-greeks/$underlying',
      queryParameters: {'expiry': expiry},
    );
    final raw = (res.data!['results'] as List?)?.cast<Map<String, dynamic>>() ??
        const [];
    return raw.map(OptionGreekRow.fromJson).toList();
  }

  Future<List<CandleOI>> getCandlesWithOI(
    String symbol, {
    String exchange = 'NFO',
    String interval = 'ONE_DAY',
    int hours = 720,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/candles-oi/$symbol',
      queryParameters: {
        'exchange': exchange,
        'interval': interval,
        'hours': hours,
      },
    );
    final raw = (res.data!['candles'] as List).cast<Map<String, dynamic>>();
    return raw.map(CandleOI.fromJson).toList();
  }

  Future<List<MoverQuote>> getMovers({
    required String segment, // 'largecap' | 'midcap' | 'smallcap'
    required String type, // 'gainers' | 'losers' | 'intraday'
    int limit = 10,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/movers',
      queryParameters: {'segment': segment, 'type': type, 'limit': limit},
    );
    final raw =
        (res.data!['results'] as List).cast<Map<String, dynamic>>();
    return raw.map(MoverQuote.fromJson).toList();
  }

  Future<List<FeedQuote>> getQuotes(
    List<String> symbols, {
    String exchange = 'NSE',
  }) async {
    if (symbols.isEmpty) return [];
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/quotes',
      queryParameters: {'symbols': symbols.join(','), 'exchange': exchange},
    );
    final raw = (res.data!['quotes'] as List).cast<Map<String, dynamic>>();
    return raw.map(FeedQuote.fromJson).toList();
  }

  Future<Map<String, dynamic>> getRawQuote(String symbol, String exchange) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/quote/$symbol',
      queryParameters: {'exchange': exchange},
    );
    return res.data!;
  }

  /// Curated constituents for a popular Indian index, each enriched
  /// with live LTP + day change. Returns null when the index isn't
  /// in the backend's curated set so the caller can hide the section
  /// without showing an error.
  Future<List<IndexMember>?> getIndexConstituents(String indexSymbol) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/market/indices/$indexSymbol/constituents',
      );
      final list =
          (res.data!['members'] as List).cast<Map<String, dynamic>>();
      return list.map(IndexMember.fromJson).toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 400 || e.response?.statusCode == 404) {
        return null;
      }
      rethrow;
    }
  }

  /// Resolves the same equity on the opposite exchange (NSE → BSE or
  /// vice versa). Returns null when the stock isn't dual-listed so the
  /// detail screen can grey-out / hide the toggle without an exception.
  Future<StockSearchResult?> getCounterpart(
    String symbol,
    String exchange,
  ) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/market/counterpart/$symbol',
        queryParameters: {'exchange': exchange},
      );
      return StockSearchResult.fromJson(res.data!);
    } on DioException catch (e) {
      // 400/404 → not dual-listed; surface as `null` so UI can degrade
      // gracefully. Other errors (5xx, network) re-throw so the caller
      // can show a snack.
      final status = e.response?.statusCode;
      if (status == 400 || status == 404) return null;
      rethrow;
    }
  }

  /// FULL-mode snapshot: LTP + OHLC + 5-level depth + 52w hi/lo + circuit
  /// limits. Used by SymbolDetailScreen to paint the depth book before the
  /// first live tick arrives.
  Future<Map<String, dynamic>> getSnapshot(String symbol, String exchange) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/snapshot/$symbol',
      queryParameters: {'exchange': exchange},
    );
    return res.data!;
  }

  Future<List<String>> getExpiries(String underlying) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/expiries/$underlying',
    );
    return (res.data!['expiries'] as List).cast<String>();
  }

  Future<OptionChain> getOptionChain(String underlying, String expiry) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/option-chain/$underlying',
      queryParameters: {'expiry': expiry},
    );
    return OptionChain.fromJson(res.data!);
  }

  /// Trading-holiday calendar. Backend tries NSE first, falls back to a
  /// curated list. Mobile callers should cache the response (it changes
  /// at most once per day).
  Future<MarketHolidaysPayload> getHolidays() async {
    final res = await _dio.get<Map<String, dynamic>>('/market/holidays');
    return MarketHolidaysPayload.fromJson(res.data!);
  }

  Future<List<Candle>> getCandles(
    String symbol, {
    String exchange = 'NSE',
    String interval = 'ONE_MINUTE',
    int hours = 4,
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/market/candles/$symbol',
      queryParameters: {
        'exchange': exchange,
        'interval': interval,
        'hours': hours,
      },
    );
    final list = (res.data!['candles'] as List).cast<Map<String, dynamic>>();
    return list.map(Candle.fromJson).toList();
  }
}

final marketRepositoryProvider = Provider<MarketRepository>((ref) {
  return MarketRepository(ref.watch(apiClientProvider).dio);
});
