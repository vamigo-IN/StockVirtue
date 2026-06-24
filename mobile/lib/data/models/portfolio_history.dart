/// One snapshot row from `GET /portfolio/history`. The backend writes one
/// of these per user per IST trading day at 00:05 IST.
class PortfolioHistoryPoint {
  /// "YYYY-MM-DD" in IST.
  final String asOfDate;
  final double totalEquity;
  final double invested;
  final double realizedPnL;
  final double unrealizedPnL;
  final double balance;
  final double marginReserved;

  const PortfolioHistoryPoint({
    required this.asOfDate,
    required this.totalEquity,
    required this.invested,
    required this.realizedPnL,
    required this.unrealizedPnL,
    required this.balance,
    required this.marginReserved,
  });

  DateTime get date => DateTime.parse(asOfDate);

  factory PortfolioHistoryPoint.fromJson(Map<String, dynamic> json) =>
      PortfolioHistoryPoint(
        asOfDate: json['asOfDate'] as String,
        totalEquity: (json['totalEquity'] as num).toDouble(),
        invested: (json['invested'] as num).toDouble(),
        realizedPnL: (json['realizedPnL'] as num).toDouble(),
        unrealizedPnL: (json['unrealizedPnL'] as num).toDouble(),
        balance: (json['balance'] as num).toDouble(),
        marginReserved: (json['marginReserved'] as num).toDouble(),
      );
}

class PortfolioHistory {
  final List<PortfolioHistoryPoint> points;
  final DateTime? fetchedAt;

  const PortfolioHistory({required this.points, required this.fetchedAt});

  factory PortfolioHistory.fromJson(Map<String, dynamic> json) =>
      PortfolioHistory(
        points: (json['points'] as List)
            .cast<Map<String, dynamic>>()
            .map(PortfolioHistoryPoint.fromJson)
            .toList(),
        fetchedAt: DateTime.tryParse(json['fetchedAt'] as String? ?? ''),
      );
}
