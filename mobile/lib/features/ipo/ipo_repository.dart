import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';

/// One IPO issue (open, upcoming or awaiting listing) from NSE's IPO feed.
class IpoIssue {
  const IpoIssue({
    required this.symbol,
    required this.companyName,
    required this.isSme,
    required this.priceRange,
    required this.priceBandLow,
    required this.priceBandHigh,
    required this.issueSize,
    required this.openDate,
    required this.closeDate,
    required this.subscription,
  });

  final String symbol;
  final String companyName;
  final bool isSme;
  final String? priceRange;
  final double? priceBandLow;
  final double? priceBandHigh;

  /// Shares on offer.
  final double? issueSize;
  final DateTime? openDate;
  final DateTime? closeDate;

  /// Overall subscription in times (5.2 = 5.2x). Open issues only.
  final double? subscription;

  /// Issue size in rupees at the upper price band.
  double? get issueValue => issueSize != null && priceBandHigh != null
      ? issueSize! * priceBandHigh!
      : null;

  factory IpoIssue.fromJson(Map<String, dynamic> json) => IpoIssue(
        symbol: json['symbol']?.toString() ?? '',
        companyName: json['companyName']?.toString() ?? '',
        isSme: json['segment'] == 'SME',
        priceRange: json['priceRange']?.toString(),
        priceBandLow: (json['priceBandLow'] as num?)?.toDouble(),
        priceBandHigh: (json['priceBandHigh'] as num?)?.toDouble(),
        issueSize: (json['issueSize'] as num?)?.toDouble(),
        openDate: _date(json['openDate']),
        closeDate: _date(json['closeDate']),
        subscription: (json['subscription'] as num?)?.toDouble(),
      );
}

/// A recently listed IPO with its live price and gain vs the issue price.
class ListedIpo {
  const ListedIpo({
    required this.symbol,
    required this.companyName,
    required this.isSme,
    required this.issuePrice,
    required this.listingDate,
    required this.tradeable,
    required this.exchange,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.ltp,
    required this.dayChangePct,
    required this.gainPct,
  });

  final String symbol;
  final String companyName;
  final bool isSme;
  final double? issuePrice;
  final DateTime? listingDate;

  /// Present in the trading universe — tap through to trade it.
  final bool tradeable;
  final String exchange;
  final String? tradingsymbol;
  final String? symboltoken;
  final double? ltp;
  final double? dayChangePct;
  final double? gainPct;

  factory ListedIpo.fromJson(Map<String, dynamic> json) => ListedIpo(
        symbol: json['symbol']?.toString() ?? '',
        companyName: json['companyName']?.toString() ?? '',
        isSme: json['segment'] == 'SME',
        issuePrice: (json['issuePrice'] as num?)?.toDouble(),
        listingDate: _date(json['listingDate']),
        tradeable: json['tradeable'] == true,
        exchange: json['exchange']?.toString() ?? 'NSE',
        tradingsymbol: json['tradingsymbol']?.toString(),
        symboltoken: json['symboltoken']?.toString(),
        ltp: (json['ltp'] as num?)?.toDouble(),
        dayChangePct: (json['dayChangePct'] as num?)?.toDouble(),
        gainPct: (json['gainPct'] as num?)?.toDouble(),
      );
}

class IpoBoard {
  const IpoBoard({
    required this.available,
    required this.open,
    required this.upcoming,
    required this.listingSoon,
    required this.recentlyListed,
  });

  /// False when NSE couldn't be reached — the IPO UI hides itself.
  final bool available;
  final List<IpoIssue> open;
  final List<IpoIssue> upcoming;
  final List<IpoIssue> listingSoon;
  final List<ListedIpo> recentlyListed;

  bool get isEmpty =>
      open.isEmpty &&
      upcoming.isEmpty &&
      listingSoon.isEmpty &&
      recentlyListed.isEmpty;

  factory IpoBoard.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) f) =>
        ((json[key] as List?) ?? const [])
            .whereType<Map<String, dynamic>>()
            .map(f)
            .toList();
    return IpoBoard(
      available: json['available'] == true,
      open: list('open', IpoIssue.fromJson),
      upcoming: list('upcoming', IpoIssue.fromJson),
      listingSoon: list('listingSoon', IpoIssue.fromJson),
      recentlyListed: list('recentlyListed', ListedIpo.fromJson),
    );
  }
}

DateTime? _date(Object? raw) =>
    raw is String && raw.isNotEmpty ? DateTime.tryParse(raw) : null;

class IpoRepository {
  IpoRepository(this._dio);
  final Dio _dio;

  Future<IpoBoard> getBoard() async {
    final res = await _dio.get<Map<String, dynamic>>('/ipo');
    return IpoBoard.fromJson(res.data ?? const {});
  }
}

final ipoRepositoryProvider = Provider<IpoRepository>((ref) {
  return IpoRepository(ref.watch(apiClientProvider).dio);
});

/// The IPO board. Kept alive across tab switches; pull-to-refresh
/// invalidates it.
final ipoBoardProvider = FutureProvider<IpoBoard>((ref) {
  return ref.watch(ipoRepositoryProvider).getBoard();
});
