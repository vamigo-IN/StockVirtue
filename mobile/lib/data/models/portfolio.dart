class WalletInfo {
  final double balance;
  final double reserved;
  final double marginReserved;
  final double available;
  const WalletInfo({
    required this.balance,
    required this.reserved,
    required this.marginReserved,
    required this.available,
  });

  factory WalletInfo.fromJson(Map<String, dynamic> json) => WalletInfo(
        balance: (json['balance'] as num).toDouble(),
        reserved: (json['reserved'] as num?)?.toDouble() ?? 0,
        marginReserved: (json['marginReserved'] as num?)?.toDouble() ?? 0,
        available: (json['available'] as num?)?.toDouble() ??
            (json['balance'] as num).toDouble(),
      );
}

class PortfolioPosition {
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final String product; // 'DELIVERY' or 'INTRADAY'
  /// Contract lot size (1 for cash equity; the F&O lot for derivatives).
  final int lotSize;
  final int quantity;
  final int reservedQty;
  final int availableQty;
  final double avgPrice;
  final double invested;
  final double? ltp;
  final double currentValue;
  final double unrealizedPnL;
  final double unrealizedPnLPct;
  final double realizedPnL;

  /// Futures held on margin: [invested] is the blocked [margin] and the
  /// position adds only its P&L (not its contract value) to equity.
  final bool leveraged;
  final double margin;

  /// Full contract value at the last price — the real exposure.
  final double contractValue;
  final String? companyName;

  /// Commodities: what one unit is ("10 g", "1 bbl").
  final String? quoteUnit;

  const PortfolioPosition({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.product,
    required this.lotSize,
    required this.quantity,
    required this.reservedQty,
    required this.availableQty,
    required this.avgPrice,
    required this.invested,
    required this.ltp,
    required this.currentValue,
    required this.unrealizedPnL,
    required this.unrealizedPnLPct,
    required this.realizedPnL,
    this.leveraged = false,
    this.margin = 0,
    this.contractValue = 0,
    this.companyName,
    this.quoteUnit,
  });

  String get key => '$exchange:$symboltoken:$product';
  bool get isIntraday => product == 'INTRADAY';

  factory PortfolioPosition.fromJson(Map<String, dynamic> json) {
    final quantity = (json['quantity'] as num).toInt();
    final reservedQty = (json['reservedQty'] as num?)?.toInt() ?? 0;
    return PortfolioPosition(
      symbol: json['symbol'] as String,
      tradingsymbol: json['tradingsymbol'] as String,
      symboltoken: json['symboltoken'] as String,
      exchange: json['exchange'] as String,
      product: json['product'] as String? ?? 'DELIVERY',
      lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
      quantity: quantity,
      reservedQty: reservedQty,
      availableQty:
          (json['availableQty'] as num?)?.toInt() ?? (quantity - reservedQty),
      avgPrice: (json['avgPrice'] as num).toDouble(),
      invested: (json['invested'] as num).toDouble(),
      ltp: (json['ltp'] as num?)?.toDouble(),
      currentValue: (json['currentValue'] as num).toDouble(),
      unrealizedPnL: (json['unrealizedPnL'] as num).toDouble(),
      unrealizedPnLPct: (json['unrealizedPnLPct'] as num).toDouble(),
      realizedPnL: (json['realizedPnL'] as num).toDouble(),
      leveraged: json['leveraged'] as bool? ?? false,
      margin: (json['margin'] as num?)?.toDouble() ?? 0,
      contractValue: (json['contractValue'] as num?)?.toDouble() ??
          (json['currentValue'] as num).toDouble(),
      companyName: json['companyName'] as String?,
      quoteUnit: json['quoteUnit'] as String?,
    );
  }
}

class PortfolioSummary {
  final double invested;
  final double currentValue;
  final double unrealizedPnL;
  final double totalRealizedPnL;
  final double totalFeesPaid;
  final double totalEquity;
  final int positionsCount;

  /// Referral bonuses & promos received — money in, not trading profit.
  final double totalCredits;

  const PortfolioSummary({
    required this.invested,
    required this.currentValue,
    required this.unrealizedPnL,
    required this.totalRealizedPnL,
    required this.totalFeesPaid,
    required this.totalEquity,
    required this.positionsCount,
    this.totalCredits = 0,
  });

  factory PortfolioSummary.fromJson(Map<String, dynamic> json) =>
      PortfolioSummary(
        invested: (json['invested'] as num).toDouble(),
        currentValue: (json['currentValue'] as num).toDouble(),
        unrealizedPnL: (json['unrealizedPnL'] as num).toDouble(),
        totalRealizedPnL: (json['totalRealizedPnL'] as num).toDouble(),
        totalFeesPaid: (json['totalFeesPaid'] as num?)?.toDouble() ?? 0,
        totalEquity: (json['totalEquity'] as num).toDouble(),
        positionsCount: (json['positionsCount'] as num).toInt(),
        totalCredits: (json['totalCredits'] as num?)?.toDouble() ?? 0,
      );
}

class PortfolioSnapshot {
  final WalletInfo wallet;
  final List<PortfolioPosition> positions;
  final PortfolioSummary summary;

  const PortfolioSnapshot({
    required this.wallet,
    required this.positions,
    required this.summary,
  });

  factory PortfolioSnapshot.fromJson(Map<String, dynamic> json) =>
      PortfolioSnapshot(
        wallet: WalletInfo.fromJson(json['wallet'] as Map<String, dynamic>),
        positions: (json['positions'] as List)
            .cast<Map<String, dynamic>>()
            .map(PortfolioPosition.fromJson)
            .toList(),
        summary:
            PortfolioSummary.fromJson(json['summary'] as Map<String, dynamic>),
      );

  /// Returns the position for this symbol on this exchange. A user can hold
  /// both DELIVERY and INTRADAY positions for the same scrip simultaneously
  /// — for symbol-detail decisions (sell button, position card) we prefer
  /// DELIVERY since it's the dominant product, falling back to whatever
  /// matches if only INTRADAY exists.
  PortfolioPosition? positionFor(String exchange, String symboltoken) {
    PortfolioPosition? fallback;
    for (final p in positions) {
      if (p.exchange != exchange || p.symboltoken != symboltoken) continue;
      if (p.product == 'DELIVERY') return p;
      fallback ??= p;
    }
    return fallback;
  }
}
