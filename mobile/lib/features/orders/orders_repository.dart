import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api_client.dart';
import '../../data/models/order.dart';

class TradeExport {
  final Uint8List bytes;
  final String filename;
  final String mime;
  const TradeExport({
    required this.bytes,
    required this.filename,
    required this.mime,
  });
}

/// One leg of a basket order. Same shape as the single-place call, but
/// flat — the repository fans these into the `/orders/basket` body and
/// the backend places them in order.
class BasketLeg {
  final String symbol;
  final String exchange;
  final OrderSide side;
  final int quantity;
  final OrderType type;
  final OrderProduct product;
  final double? limitPrice;
  final double? triggerPrice;
  final double? trailAmount;

  const BasketLeg({
    required this.symbol,
    required this.exchange,
    required this.side,
    required this.quantity,
    this.type = OrderType.market,
    this.product = OrderProduct.delivery,
    this.limitPrice,
    this.triggerPrice,
    this.trailAmount,
  });
}

/// Per-leg outcome from the basket endpoint. Failures don't roll back
/// successful legs — the caller decides what to do with mixed results.
class BasketLegResult {
  final bool ok;
  final OrderRecord? order;
  final String? error;
  const BasketLegResult({required this.ok, this.order, this.error});

  factory BasketLegResult.fromJson(Map<String, dynamic> json) =>
      BasketLegResult(
        ok: json['ok'] as bool? ?? false,
        order: json['order'] is Map<String, dynamic>
            ? OrderRecord.fromJson(json['order'] as Map<String, dynamic>)
            : null,
        error: json['error'] as String?,
      );
}

class BasketResult {
  final int filled;
  final int failed;
  final List<BasketLegResult> legs;
  const BasketResult({
    required this.filled,
    required this.failed,
    required this.legs,
  });

  factory BasketResult.fromJson(Map<String, dynamic> json) => BasketResult(
        filled: (json['filled'] as num?)?.toInt() ?? 0,
        failed: (json['failed'] as num?)?.toInt() ?? 0,
        legs: ((json['legs'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(BasketLegResult.fromJson)
            .toList(),
      );
}

class OrdersRepository {
  OrdersRepository(this._dio);
  final Dio _dio;

  Future<OrderRecord> place({
    required String symbol,
    required String exchange,
    required OrderSide side,
    required int quantity,
    OrderType type = OrderType.market,
    OrderProduct product = OrderProduct.delivery,
    double? limitPrice,
    double? triggerPrice,
    double? trailAmount,
  }) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/orders',
      data: {
        'symbol': symbol,
        'exchange': exchange,
        'side': side == OrderSide.buy ? 'BUY' : 'SELL',
        'quantity': quantity,
        'type': _typeToString(type),
        'product': orderProductToWire(product),
        if ((type == OrderType.limit || type == OrderType.stopLossLimit) &&
            limitPrice != null)
          'limitPrice': limitPrice,
        if ((type == OrderType.stopLoss || type == OrderType.stopLossLimit) &&
            triggerPrice != null)
          'triggerPrice': triggerPrice,
        if (type == OrderType.trailingStop && trailAmount != null)
          'trailAmount': trailAmount,
      },
    );
    return OrderRecord.fromJson(res.data!);
  }

  static String _typeToString(OrderType t) {
    switch (t) {
      case OrderType.market:
        return 'MARKET';
      case OrderType.limit:
        return 'LIMIT';
      case OrderType.stopLoss:
        return 'STOP_LOSS';
      case OrderType.stopLossLimit:
        return 'STOP_LOSS_LIMIT';
      case OrderType.trailingStop:
        return 'TRAILING_STOP';
    }
  }

  /// Leg of a basket order. The repository serialises it the same way
  /// `place()` does so the backend's PlaceOrderDto accepts each entry
  /// without special-casing.
  Future<BasketResult> placeBasket(List<BasketLeg> legs) async {
    final body = {
      'legs': [
        for (final leg in legs)
          {
            'symbol': leg.symbol,
            'exchange': leg.exchange,
            'side': leg.side == OrderSide.buy ? 'BUY' : 'SELL',
            'quantity': leg.quantity,
            'type': _typeToString(leg.type),
            'product': orderProductToWire(leg.product),
            if ((leg.type == OrderType.limit ||
                    leg.type == OrderType.stopLossLimit) &&
                leg.limitPrice != null)
              'limitPrice': leg.limitPrice,
            if ((leg.type == OrderType.stopLoss ||
                    leg.type == OrderType.stopLossLimit) &&
                leg.triggerPrice != null)
              'triggerPrice': leg.triggerPrice,
            if (leg.type == OrderType.trailingStop && leg.trailAmount != null)
              'trailAmount': leg.trailAmount,
          },
      ],
    };
    final res = await _dio.post<Map<String, dynamic>>(
      '/orders/basket',
      data: body,
    );
    return BasketResult.fromJson(res.data!);
  }

  Future<OrderRecord> cancel(String orderId) async {
    final res = await _dio.post<Map<String, dynamic>>(
      '/orders/$orderId/cancel',
    );
    return OrderRecord.fromJson(res.data!);
  }

  /// Edits a pending order's price / quantity in place. The backend
  /// keeps the order id stable so the orders list doesn't re-shuffle —
  /// callers can `invalidate(ordersListProvider)` after `await` to
  /// repaint with the new threshold.
  Future<OrderRecord> modify(
    String orderId, {
    int? quantity,
    double? limitPrice,
    double? triggerPrice,
  }) async {
    final res = await _dio.patch<Map<String, dynamic>>(
      '/orders/$orderId',
      data: {
        'quantity': ?quantity,
        'limitPrice': ?limitPrice,
        'triggerPrice': ?triggerPrice,
      },
    );
    return OrderRecord.fromJson(res.data!);
  }

  Future<List<OrderRecord>> list({int limit = 50, OrderStatus? status}) async {
    final res = await _dio.get<List<dynamic>>(
      '/orders',
      queryParameters: {
        'limit': limit,
        if (status != null) 'status': _statusToString(status),
      },
    );
    return res.data!
        .map((e) => OrderRecord.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<TradeExport> export({
    String format = 'csv',
    DateTime? from,
    DateTime? to,
  }) async {
    final res = await _dio.get<List<int>>(
      '/orders/export',
      queryParameters: {
        'format': format,
        if (from != null) 'from': from.toIso8601String(),
        if (to != null) 'to': to.toIso8601String(),
      },
      options: Options(responseType: ResponseType.bytes),
    );
    final today = DateTime.now().toIso8601String().substring(0, 10);
    return TradeExport(
      bytes: Uint8List.fromList(res.data!),
      filename: 'stockvirtue-trades-$today.$format',
      mime: format == 'json' ? 'application/json' : 'text/csv',
    );
  }

  static String _statusToString(OrderStatus s) {
    switch (s) {
      case OrderStatus.pending:
        return 'PENDING';
      case OrderStatus.filled:
        return 'FILLED';
      case OrderStatus.cancelled:
        return 'CANCELLED';
      case OrderStatus.rejected:
        return 'REJECTED';
    }
  }
}

final ordersRepositoryProvider = Provider<OrdersRepository>((ref) {
  return OrdersRepository(ref.watch(apiClientProvider).dio);
});
