import 'package:flutter/material.dart';

/// Real-time trading information sourced from SmartAPI's FULL-mode snapshot
/// (volume, avg price, OI for F&O, total buy/sell quantity, lot/tick size).
///
/// This replaces the old curated-fundamentals grid which carried stale,
/// hand-keyed P/E and market-cap values. Every number rendered here came
/// from the exchange via the same call that drives the depth view.
class TradingInfoCard extends StatelessWidget {
  const TradingInfoCard({super.key, required this.snapshot});

  /// Raw `/market/snapshot/:symbol` body. Pass null/empty to hide the card.
  final Map<String, dynamic>? snapshot;

  @override
  Widget build(BuildContext context) {
    if (snapshot == null || snapshot!.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    double? num$(String key) => (snapshot![key] as num?)?.toDouble();
    int? intNum(String key) => (snapshot![key] as num?)?.toInt();

    final volume = intNum('tradeVolume');
    final avgPrice = num$('avgPrice');
    final lotSize = intNum('lotSize');
    final tickSize = num$('tickSize');
    final totBuy = intNum('totBuyQuantity');
    final totSell = intNum('totSellQuantity');
    // OI flows through the FULL-mode payload as opnInterest for F&O.
    final oi = intNum('opnInterest');

    final entries = <_Stat>[
      if (volume != null && volume > 0)
        _Stat('Volume traded', _compactInt(volume),
            Icons.show_chart),
      if (avgPrice != null && avgPrice > 0)
        _Stat('Avg price', '₹${avgPrice.toStringAsFixed(2)}',
            Icons.functions),
      if (oi != null && oi > 0)
        _Stat('Open interest', _compactInt(oi), Icons.layers_outlined),
      if (totBuy != null && totBuy > 0)
        _Stat('Total bid qty', _compactInt(totBuy),
            Icons.arrow_upward),
      if (totSell != null && totSell > 0)
        _Stat('Total ask qty', _compactInt(totSell),
            Icons.arrow_downward),
      if (lotSize != null && lotSize > 1)
        _Stat('Lot size', '$lotSize',
            Icons.inventory_2_outlined),
      if (tickSize != null && tickSize > 0)
        _Stat('Tick size', '₹${tickSize.toStringAsFixed(2)}',
            Icons.straighten),
    ];
    if (entries.isEmpty) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF06B6D4).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.insights_outlined,
                  color: Color(0xFF06B6D4),
                  size: 16,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Trading info',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              const Spacer(),
              Text(
                'Live',
                style: TextStyle(
                  fontSize: 10.5,
                  color: scheme.onSurface.withValues(alpha: 0.5),
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              const spacing = 8.0;
              final cellW = (constraints.maxWidth - spacing) / 2;
              return Wrap(
                spacing: spacing,
                runSpacing: spacing,
                children: [
                  for (final e in entries)
                    SizedBox(width: cellW, child: _StatCell(stat: e)),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

class _Stat {
  final String label;
  final String value;
  final IconData icon;
  const _Stat(this.label, this.value, this.icon);
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.stat});
  final _Stat stat;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(
            stat.icon,
            size: 14,
            color: scheme.onSurface.withValues(alpha: 0.55),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  stat.label,
                  style: TextStyle(
                    fontSize: 10.5,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  stat.value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
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

String _compactInt(int n) {
  final abs = n.abs();
  if (abs >= 10000000) return '${(n / 10000000).toStringAsFixed(2)} Cr';
  if (abs >= 100000) return '${(n / 100000).toStringAsFixed(2)} L';
  if (abs >= 1000) return '${(n / 1000).toStringAsFixed(1)} K';
  return n.toString();
}
