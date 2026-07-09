import 'package:flutter/material.dart';

import '../data/models/tick.dart';

/// Renders the 5-level market depth from a SmartAPI SnapQuote tick.
class DepthView extends StatelessWidget {
  const DepthView({super.key, required this.bids, required this.asks});

  final List<DepthLevel> bids;
  final List<DepthLevel> asks;

  @override
  Widget build(BuildContext context) {
    final maxQty = _maxQty(bids, asks);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _Header(),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _Side(
                    rows: bids,
                    maxQty: maxQty,
                    color: Colors.greenAccent,
                    isBuy: true,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _Side(
                    rows: asks,
                    maxQty: maxQty,
                    color: Colors.redAccent,
                    isBuy: false,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _Totals(bids: bids, asks: asks),
          ],
        ),
      ),
    );
  }

  static int _maxQty(List<DepthLevel> a, List<DepthLevel> b) {
    var m = 0;
    for (final r in a) {
      if (r.quantity > m) m = r.quantity;
    }
    for (final r in b) {
      if (r.quantity > m) m = r.quantity;
    }
    return m;
  }
}

class _Header extends StatelessWidget {
  const _Header();

  @override
  Widget build(BuildContext context) {
    final faint = TextStyle(
      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
      fontSize: 11,
      fontWeight: FontWeight.w600,
      letterSpacing: 0.5,
    );
    return Row(
      children: [
        Expanded(child: Text('BUY', style: faint)),
        Expanded(
          child: Text('SELL',
              textAlign: TextAlign.right, style: faint),
        ),
      ],
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({
    required this.rows,
    required this.maxQty,
    required this.color,
    required this.isBuy,
  });

  final List<DepthLevel> rows;
  final int maxQty;
  final Color color;
  final bool isBuy;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(
          isBuy ? 'No bids' : 'No asks',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.4),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: rows
          .map((r) =>
              _DepthRow(level: r, maxQty: maxQty, color: color, isBuy: isBuy))
          .toList(),
    );
  }
}

class _DepthRow extends StatelessWidget {
  const _DepthRow({
    required this.level,
    required this.maxQty,
    required this.color,
    required this.isBuy,
  });

  final DepthLevel level;
  final int maxQty;
  final Color color;
  final bool isBuy;

  @override
  Widget build(BuildContext context) {
    final fillFraction =
        maxQty > 0 ? (level.quantity / maxQty).clamp(0.0, 1.0) : 0.0;
    final qtyText = level.quantity.toString();
    final priceText = '₹${level.price.toStringAsFixed(2)}';
    return SizedBox(
      height: 22,
      child: Stack(
        children: [
          Positioned.fill(
            child: FractionallySizedBox(
              alignment: isBuy ? Alignment.centerRight : Alignment.centerLeft,
              widthFactor: fillFraction,
              child: Container(color: color.withValues(alpha: 0.12)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              children: isBuy
                  ? [
                      Expanded(
                        child: Text(qtyText,
                            style: const TextStyle(fontSize: 12)),
                      ),
                      Text(priceText,
                          style: TextStyle(
                              fontSize: 12, color: color, fontWeight: FontWeight.w600)),
                    ]
                  : [
                      Text(priceText,
                          style: TextStyle(
                              fontSize: 12, color: color, fontWeight: FontWeight.w600)),
                      Expanded(
                        child: Text(
                          qtyText,
                          textAlign: TextAlign.right,
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.bids, required this.asks});
  final List<DepthLevel> bids;
  final List<DepthLevel> asks;

  @override
  Widget build(BuildContext context) {
    final totalBids = bids.fold<int>(0, (a, b) => a + b.quantity);
    final totalAsks = asks.fold<int>(0, (a, b) => a + b.quantity);
    final faint = TextStyle(
      color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6),
      fontSize: 11,
    );
    return Row(
      children: [
        Expanded(
          child: Text('Total ${_formatQty(totalBids)}', style: faint),
        ),
        Expanded(
          child: Text(
            'Total ${_formatQty(totalAsks)}',
            textAlign: TextAlign.right,
            style: faint,
          ),
        ),
      ],
    );
  }

  static String _formatQty(int q) {
    final s = q.toString();
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(',');
      buf.write(s[i]);
    }
    return buf.toString();
  }
}
