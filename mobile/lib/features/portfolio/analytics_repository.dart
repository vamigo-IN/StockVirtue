import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/analytics.dart';

class AnalyticsRepository {
  AnalyticsRepository(this._dio);
  final Dio _dio;

  Future<List<SymbolPnL>> bySymbol() async {
    final res = await _dio.get<List<dynamic>>('/portfolio/analytics/by-symbol');
    return res.data!
        .map((e) => SymbolPnL.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<RiskMetrics> risk() async {
    final res =
        await _dio.get<Map<String, dynamic>>('/portfolio/analytics/risk');
    return RiskMetrics.fromJson(res.data!);
  }

  Future<CapGainsReport> capitalGains({DateTime? from, DateTime? to}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/portfolio/analytics/capital-gains',
      queryParameters: {
        if (from != null) 'from': from.toIso8601String().substring(0, 10),
        if (to != null) 'to': to.toIso8601String().substring(0, 10),
      },
    );
    return CapGainsReport.fromJson(res.data!);
  }
}

final analyticsRepositoryProvider = Provider<AnalyticsRepository>((ref) {
  return AnalyticsRepository(ref.watch(apiClientProvider).dio);
});

final perSymbolPnLProvider = FutureProvider<List<SymbolPnL>>((ref) {
  return ref.watch(analyticsRepositoryProvider).bySymbol();
});

final riskMetricsProvider = FutureProvider<RiskMetrics>((ref) {
  return ref.watch(analyticsRepositoryProvider).risk();
});

final capitalGainsProvider = FutureProvider<CapGainsReport>((ref) {
  return ref.watch(analyticsRepositoryProvider).capitalGains();
});
