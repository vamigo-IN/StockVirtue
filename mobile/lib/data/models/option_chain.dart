class OptionLeg {
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final int lotSize;
  final double tickSize;
  final double? ltp;
  final double? changePct;
  final double? opnInterest;

  const OptionLeg({
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.lotSize,
    required this.tickSize,
    required this.ltp,
    required this.changePct,
    required this.opnInterest,
  });

  factory OptionLeg.fromJson(Map<String, dynamic> json) => OptionLeg(
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        lotSize: (json['lotSize'] as num?)?.toInt() ?? 1,
        tickSize: (json['tickSize'] as num?)?.toDouble() ?? 0.05,
        ltp: (json['ltp'] as num?)?.toDouble(),
        changePct: (json['changePct'] as num?)?.toDouble(),
        opnInterest: (json['opnInterest'] as num?)?.toDouble(),
      );
}

class OptionChainRow {
  final double strike;
  final OptionLeg? call;
  final OptionLeg? put;

  const OptionChainRow({
    required this.strike,
    required this.call,
    required this.put,
  });

  factory OptionChainRow.fromJson(Map<String, dynamic> json) => OptionChainRow(
        strike: (json['strike'] as num).toDouble(),
        call: json['call'] is Map<String, dynamic>
            ? OptionLeg.fromJson(json['call'] as Map<String, dynamic>)
            : null,
        put: json['put'] is Map<String, dynamic>
            ? OptionLeg.fromJson(json['put'] as Map<String, dynamic>)
            : null,
      );
}

class OptionChain {
  final String underlying;
  final String expiry;
  /// Underlying spot LTP at chain-fetch time. Drives the ATM marker and
  /// ITM/OTM tinting. May be null when the spot couldn't be resolved.
  final double? spot;
  final List<OptionChainRow> strikes;
  final DateTime? fetchedAt;

  const OptionChain({
    required this.underlying,
    required this.expiry,
    required this.spot,
    required this.strikes,
    required this.fetchedAt,
  });

  factory OptionChain.fromJson(Map<String, dynamic> json) => OptionChain(
        underlying: json['underlying'] as String,
        expiry: json['expiry'] as String,
        spot: (json['spot'] as num?)?.toDouble(),
        strikes: (json['strikes'] as List)
            .cast<Map<String, dynamic>>()
            .map(OptionChainRow.fromJson)
            .toList(),
        fetchedAt: DateTime.tryParse(json['fetchedAt'] as String? ?? ''),
      );

  /// Strike closest to spot — the "at-the-money" pin. Returns null when no
  /// spot was returned. Used by the UI to anchor scroll position and tint.
  double? get atmStrike {
    final s = spot;
    if (s == null || strikes.isEmpty) return null;
    double? best;
    double bestDist = double.infinity;
    for (final row in strikes) {
      final d = (row.strike - s).abs();
      if (d < bestDist) {
        bestDist = d;
        best = row.strike;
      }
    }
    return best;
  }

  /// Largest |OI| across both legs — used to scale per-strike OI bars so the
  /// row with peak open interest fills the bar.
  double get peakOI {
    double m = 0;
    for (final row in strikes) {
      final c = row.call?.opnInterest ?? 0;
      final p = row.put?.opnInterest ?? 0;
      if (c > m) m = c;
      if (p > m) m = p;
    }
    return m;
  }
}
