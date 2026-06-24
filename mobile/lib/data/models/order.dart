enum OrderSide { buy, sell }

enum OrderType { market, limit, stopLoss, stopLossLimit, trailingStop }

enum OrderProduct { delivery, intraday }

OrderProduct _productFromString(String? s) =>
    s?.toUpperCase() == 'INTRADAY' ? OrderProduct.intraday : OrderProduct.delivery;

String orderProductToWire(OrderProduct p) =>
    p == OrderProduct.intraday ? 'INTRADAY' : 'DELIVERY';

enum OrderStatus { pending, filled, cancelled, rejected }

OrderSide _sideFromString(String s) =>
    s.toUpperCase() == 'SELL' ? OrderSide.sell : OrderSide.buy;

OrderType _typeFromString(String s) {
  switch (s.toUpperCase()) {
    case 'LIMIT':
      return OrderType.limit;
    case 'STOP_LOSS':
      return OrderType.stopLoss;
    case 'STOP_LOSS_LIMIT':
      return OrderType.stopLossLimit;
    case 'TRAILING_STOP':
      return OrderType.trailingStop;
    default:
      return OrderType.market;
  }
}

OrderStatus _statusFromString(String s) {
  switch (s.toUpperCase()) {
    case 'FILLED':
      return OrderStatus.filled;
    case 'CANCELLED':
      return OrderStatus.cancelled;
    case 'REJECTED':
      return OrderStatus.rejected;
    default:
      return OrderStatus.pending;
  }
}

class OrderRecord {
  final String id;
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final OrderSide side;
  final OrderType type;
  final OrderProduct product;
  final int quantity;
  final double? limitPrice;
  final double? triggerPrice;
  final double? trailAmount;
  final double? fillPrice;
  final double? notional;
  final double fees;
  final OrderStatus status;
  final String? rejectReason;
  final DateTime createdAt;
  final DateTime? filledAt;

  const OrderRecord({
    required this.id,
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.side,
    required this.type,
    required this.product,
    required this.quantity,
    required this.limitPrice,
    required this.triggerPrice,
    required this.trailAmount,
    required this.fillPrice,
    required this.notional,
    required this.fees,
    required this.status,
    required this.rejectReason,
    required this.createdAt,
    required this.filledAt,
  });

  bool get isPending => status == OrderStatus.pending;
  bool get isLimit => type == OrderType.limit;
  bool get isStopLoss => type == OrderType.stopLoss;
  bool get isIntraday => product == OrderProduct.intraday;
  bool get isStopLossLimit => type == OrderType.stopLossLimit;
  bool get isTrailingStop => type == OrderType.trailingStop;
  bool get isTriggered =>
      isLimit || isStopLoss || isStopLossLimit || isTrailingStop;

  factory OrderRecord.fromJson(Map<String, dynamic> json) => OrderRecord(
        id: json['id'] as String,
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        side: _sideFromString(json['side'] as String),
        type: _typeFromString(json['type'] as String),
        product: _productFromString(json['product'] as String?),
        quantity: (json['quantity'] as num).toInt(),
        limitPrice: (json['limitPrice'] as num?)?.toDouble(),
        triggerPrice: (json['triggerPrice'] as num?)?.toDouble(),
        trailAmount: (json['trailAmount'] as num?)?.toDouble(),
        fillPrice: (json['fillPrice'] as num?)?.toDouble(),
        notional: (json['notional'] as num?)?.toDouble(),
        fees: (json['fees'] as num?)?.toDouble() ?? 0,
        status: _statusFromString(json['status'] as String),
        rejectReason: json['rejectReason'] as String?,
        createdAt:
            DateTime.tryParse(json['createdAt'] as String) ?? DateTime.now(),
        filledAt: DateTime.tryParse(json['filledAt'] as String? ?? ''),
      );
}
