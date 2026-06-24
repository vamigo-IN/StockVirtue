import 'package:flutter/material.dart';

import '../chart_html.dart';
import '../chart_view.dart';

/// TradingView public chart for the symbol. Loads the real chart page
/// directly (no embed widget) so every symbol TradingView indexes renders.
/// The symbol-detail screen already shows our own SmartAPI line chart inline
/// with range filters, so this route doesn't need an intermediate view.
class ChartScreen extends StatelessWidget {
  const ChartScreen({
    super.key,
    required this.symbol,
    required this.exchange,
  });

  final String symbol;
  final String exchange;

  @override
  Widget build(BuildContext context) {
    final url =
        tradingViewChartUrl(tvSymbol: tvSymbolFor(symbol, exchange));
    return Scaffold(
      appBar: AppBar(title: Text('$symbol on TradingView')),
      body: ChartView(url: url),
    );
  }
}
