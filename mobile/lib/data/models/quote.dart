class Quote {
  final double? ltp;
  final double? open;
  final double? high;
  final double? low;
  final double? close;
  // FULL-mode extras (null on LTP/OHLC-only responses).
  final double? vwap; // average traded price
  final double? volume; // total traded quantity
  final double? opnInterest; // open interest (F&O / commodities)
  final double? totBuyQuan; // total bid quantity across the book
  final double? totSellQuan; // total ask quantity across the book

  const Quote({
    required this.ltp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    this.vwap,
    this.volume,
    this.opnInterest,
    this.totBuyQuan,
    this.totSellQuan,
  });

  double? get changePct {
    if (ltp == null || close == null || close == 0) return null;
    return ((ltp! - close!) / close!) * 100;
  }

  double? get change {
    if (ltp == null || close == null) return null;
    return ltp! - close!;
  }

  static Quote? fromJson(Map<String, dynamic>? json) {
    if (json == null) return null;
    return Quote(
      ltp: (json['ltp'] as num?)?.toDouble(),
      open: (json['open'] as num?)?.toDouble(),
      high: (json['high'] as num?)?.toDouble(),
      low: (json['low'] as num?)?.toDouble(),
      close: (json['close'] as num?)?.toDouble(),
      vwap: (json['vwap'] as num?)?.toDouble(),
      volume: (json['volume'] as num?)?.toDouble(),
      opnInterest: (json['opnInterest'] as num?)?.toDouble(),
      totBuyQuan: (json['totBuyQuan'] as num?)?.toDouble(),
      totSellQuan: (json['totSellQuan'] as num?)?.toDouble(),
    );
  }

  Quote withLtp(double newLtp) => Quote(
        ltp: newLtp,
        open: open,
        high: high,
        low: low,
        close: close,
        vwap: vwap,
        volume: volume,
        opnInterest: opnInterest,
        totBuyQuan: totBuyQuan,
        totSellQuan: totSellQuan,
      );
}
