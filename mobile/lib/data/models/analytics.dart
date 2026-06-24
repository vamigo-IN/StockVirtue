/// One row in the per-symbol P&L list. Mirrors the SymbolPnL DTO on
/// the backend — `currentValue` is null when the analytics call
/// couldn't quote the symbol (rare; the screen falls back to drawing
/// the realized number only).
class SymbolPnL {
  final String symbol;
  final String exchange;
  final double invested;
  final double realizedPnL;
  final int openQty;
  final double avgPrice;
  final double? currentValue;
  final double totalPnL;
  final int trades;
  final double fees;

  const SymbolPnL({
    required this.symbol,
    required this.exchange,
    required this.invested,
    required this.realizedPnL,
    required this.openQty,
    required this.avgPrice,
    required this.currentValue,
    required this.totalPnL,
    required this.trades,
    required this.fees,
  });

  factory SymbolPnL.fromJson(Map<String, dynamic> json) => SymbolPnL(
        symbol: json['symbol'] as String,
        exchange: json['exchange'] as String,
        invested: (json['invested'] as num).toDouble(),
        realizedPnL: (json['realizedPnL'] as num).toDouble(),
        openQty: (json['openQty'] as num).toInt(),
        avgPrice: (json['avgPrice'] as num).toDouble(),
        currentValue: (json['currentValue'] as num?)?.toDouble(),
        totalPnL: (json['totalPnL'] as num).toDouble(),
        trades: (json['trades'] as num).toInt(),
        fees: (json['fees'] as num).toDouble(),
      );
}

/// Risk metrics derived from the trailing snapshot curve.
class RiskMetrics {
  final int points;
  final double totalReturnPct;
  final double annualisedVolPct;
  final double sharpe;
  final double sortino;
  final double maxDrawdownPct;
  final double cagrPct;
  final double? beta;

  const RiskMetrics({
    required this.points,
    required this.totalReturnPct,
    required this.annualisedVolPct,
    required this.sharpe,
    required this.sortino,
    required this.maxDrawdownPct,
    required this.cagrPct,
    required this.beta,
  });

  factory RiskMetrics.fromJson(Map<String, dynamic> json) => RiskMetrics(
        points: (json['points'] as num).toInt(),
        totalReturnPct: (json['totalReturnPct'] as num).toDouble(),
        annualisedVolPct: (json['annualisedVolPct'] as num).toDouble(),
        sharpe: (json['sharpe'] as num).toDouble(),
        sortino: (json['sortino'] as num).toDouble(),
        maxDrawdownPct: (json['maxDrawdownPct'] as num).toDouble(),
        cagrPct: (json['cagrPct'] as num).toDouble(),
        beta: (json['beta'] as num?)?.toDouble(),
      );
}

class CapGainRow {
  final String symbol;
  final String exchange;
  final int quantity;
  final String buyDate;
  final String sellDate;
  final double buyPrice;
  final double sellPrice;
  final double gain;
  /// "SHORT" | "LONG".
  final String term;

  const CapGainRow({
    required this.symbol,
    required this.exchange,
    required this.quantity,
    required this.buyDate,
    required this.sellDate,
    required this.buyPrice,
    required this.sellPrice,
    required this.gain,
    required this.term,
  });

  factory CapGainRow.fromJson(Map<String, dynamic> json) => CapGainRow(
        symbol: json['symbol'] as String,
        exchange: json['exchange'] as String,
        quantity: (json['quantity'] as num).toInt(),
        buyDate: json['buyDate'] as String,
        sellDate: json['sellDate'] as String,
        buyPrice: (json['buyPrice'] as num).toDouble(),
        sellPrice: (json['sellPrice'] as num).toDouble(),
        gain: (json['gain'] as num).toDouble(),
        term: json['term'] as String,
      );
}

class CapGainsReport {
  final List<CapGainRow> rows;
  final double shortTermTotal;
  final double longTermTotal;
  final double total;
  final String? from;
  final String to;

  const CapGainsReport({
    required this.rows,
    required this.shortTermTotal,
    required this.longTermTotal,
    required this.total,
    required this.from,
    required this.to,
  });

  factory CapGainsReport.fromJson(Map<String, dynamic> json) => CapGainsReport(
        rows: ((json['rows'] as List?) ?? const [])
            .cast<Map<String, dynamic>>()
            .map(CapGainRow.fromJson)
            .toList(),
        shortTermTotal: (json['shortTermTotal'] as num).toDouble(),
        longTermTotal: (json['longTermTotal'] as num).toDouble(),
        total: (json['total'] as num).toDouble(),
        from: json['from'] as String?,
        to: json['to'] as String,
      );
}
