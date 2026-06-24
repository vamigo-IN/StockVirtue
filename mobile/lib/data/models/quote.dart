class Quote {
  final double? ltp;
  final double? open;
  final double? high;
  final double? low;
  final double? close;

  const Quote({
    required this.ltp,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
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
    );
  }

  Quote withLtp(double newLtp) => Quote(
        ltp: newLtp,
        open: open,
        high: high,
        low: low,
        close: close,
      );
}
