import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/response_cache.dart';
import '../../data/api_client.dart';
import '../../data/models/portfolio.dart';
import '../../data/models/portfolio_history.dart';

class PortfolioRepository {
  PortfolioRepository(this._dio, this._cache);
  final Dio _dio;
  final ResponseCache _cache;

  /// Always returns the freshest portfolio snapshot we can produce. If the
  /// live `/portfolio` fetch fails (offline, DNS, backend down) we fall
  /// back to the last-cached payload so the UI still has numbers to show.
  Future<PortfolioSnapshot> get() async {
    return withCache<PortfolioSnapshot>(
      cache: _cache,
      key: 'portfolio',
      fetch: () async {
        final res = await _dio.get<Map<String, dynamic>>('/portfolio');
        return PortfolioSnapshot.fromJson(res.data!);
      },
      serialize: (snap) => _portfolioToJson(snap),
      deserialize: (json) =>
          PortfolioSnapshot.fromJson((json as Map).cast<String, dynamic>()),
    );
  }

  /// Trailing equity series from `/portfolio/history?days=…`. Cached so the
  /// history screen still renders something useful when offline. The window
  /// is part of the cache key so 30d, 90d, and 365d don't trample each other.
  Future<PortfolioHistory> getHistory({int days = 90}) async {
    return withCache<PortfolioHistory>(
      cache: _cache,
      key: 'portfolio.history.$days',
      fetch: () async {
        final res = await _dio.get<Map<String, dynamic>>(
          '/portfolio/history',
          queryParameters: {'days': days},
        );
        return PortfolioHistory.fromJson(res.data!);
      },
      serialize: (h) => _historyToJson(h),
      deserialize: (json) =>
          PortfolioHistory.fromJson((json as Map).cast<String, dynamic>()),
    );
  }
}

final portfolioRepositoryProvider = Provider<PortfolioRepository>((ref) {
  return PortfolioRepository(
    ref.watch(apiClientProvider).dio,
    ref.watch(responseCacheProvider),
  );
});

/// PortfolioSnapshot doesn't ship a toJson, and we don't want to bloat the
/// model just for caching. Re-walk the structure into a JSON shape that
/// matches the backend's `/portfolio` response so PortfolioSnapshot.fromJson
/// can round-trip it.
Map<String, dynamic> _portfolioToJson(PortfolioSnapshot s) => {
      'wallet': {
        'balance': s.wallet.balance,
        'reserved': s.wallet.reserved,
        'marginReserved': s.wallet.marginReserved,
        'available': s.wallet.available,
      },
      'positions': [
        for (final p in s.positions)
          {
            'symbol': p.symbol,
            'tradingsymbol': p.tradingsymbol,
            'symboltoken': p.symboltoken,
            'exchange': p.exchange,
            'product': p.product,
            'quantity': p.quantity,
            'reservedQty': p.reservedQty,
            'availableQty': p.availableQty,
            'avgPrice': p.avgPrice,
            'invested': p.invested,
            'ltp': p.ltp,
            'currentValue': p.currentValue,
            'unrealizedPnL': p.unrealizedPnL,
            'unrealizedPnLPct': p.unrealizedPnLPct,
            'realizedPnL': p.realizedPnL,
            'lotSize': p.lotSize,
            'leveraged': p.leveraged,
            'margin': p.margin,
            'contractValue': p.contractValue,
            'companyName': p.companyName,
            'lotLabel': p.lotLabel,
            'quoteUnit': p.quoteUnit,
          },
      ],
      'summary': {
        'invested': s.summary.invested,
        'currentValue': s.summary.currentValue,
        'unrealizedPnL': s.summary.unrealizedPnL,
        'totalRealizedPnL': s.summary.totalRealizedPnL,
        'totalFeesPaid': s.summary.totalFeesPaid,
        'totalEquity': s.summary.totalEquity,
        'positionsCount': s.summary.positionsCount,
        'totalCredits': s.summary.totalCredits,
      },
    };

Map<String, dynamic> _historyToJson(PortfolioHistory h) => {
      'points': [
        for (final p in h.points)
          {
            'asOfDate': p.asOfDate,
            'totalEquity': p.totalEquity,
            'invested': p.invested,
            'realizedPnL': p.realizedPnL,
            'unrealizedPnL': p.unrealizedPnL,
            'balance': p.balance,
            'marginReserved': p.marginReserved,
          },
      ],
      'fetchedAt': h.fetchedAt?.toIso8601String() ?? '',
    };
