class DepthLevel {
  final int quantity;
  final double price;
  final int orders;

  const DepthLevel({
    required this.quantity,
    required this.price,
    required this.orders,
  });

  factory DepthLevel.fromJson(Map<String, dynamic> json) => DepthLevel(
        quantity: (json['quantity'] as num).toInt(),
        price: (json['price'] as num).toDouble(),
        orders: (json['orders'] as num).toInt(),
      );
}

class Tick {
  final String? symbol;
  final String exchange;
  final String token;
  final double ltp;
  final int ts;
  // Mode 2 (Quote) extras.
  final double? open;
  final double? high;
  final double? low;
  final double? close;
  final int? volume;
  final int? lastTradedQty;
  // Mode 3 (SnapQuote) extras — depth + reference levels.
  final List<DepthLevel>? bids;
  final List<DepthLevel>? asks;
  final double? upperCircuit;
  final double? lowerCircuit;
  final double? yearHigh;
  final double? yearLow;

  const Tick({
    required this.symbol,
    required this.exchange,
    required this.token,
    required this.ltp,
    required this.ts,
    this.open,
    this.high,
    this.low,
    this.close,
    this.volume,
    this.lastTradedQty,
    this.bids,
    this.asks,
    this.upperCircuit,
    this.lowerCircuit,
    this.yearHigh,
    this.yearLow,
  });

  String get key => '$exchange:$token';

  static List<DepthLevel>? _parseDepth(Object? value) {
    if (value is! List) return null;
    return value
        .cast<Map<String, dynamic>>()
        .map(DepthLevel.fromJson)
        .toList();
  }

  factory Tick.fromJson(Map<String, dynamic> json) => Tick(
        symbol: json['symbol'] as String?,
        exchange: json['exchange'] as String,
        token: json['token'].toString(),
        ltp: (json['ltp'] as num).toDouble(),
        ts: (json['ts'] as num).toInt(),
        open: (json['open'] as num?)?.toDouble(),
        high: (json['high'] as num?)?.toDouble(),
        low: (json['low'] as num?)?.toDouble(),
        close: (json['close'] as num?)?.toDouble(),
        volume: (json['volume'] as num?)?.toInt(),
        lastTradedQty: (json['lastTradedQty'] as num?)?.toInt(),
        bids: _parseDepth(json['bids']),
        asks: _parseDepth(json['asks']),
        upperCircuit: (json['upperCircuit'] as num?)?.toDouble(),
        lowerCircuit: (json['lowerCircuit'] as num?)?.toDouble(),
        yearHigh: (json['yearHigh'] as num?)?.toDouble(),
        yearLow: (json['yearLow'] as num?)?.toDouble(),
      );
}
