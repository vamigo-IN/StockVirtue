import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/cap_segments.dart';
import '../../../core/company_info.dart';
import '../../../core/money_format.dart';
import '../../../data/models/portfolio.dart';

/// Two side-by-side donuts on the Portfolio screen: invested capital broken
/// down by sector and by market-cap segment. Hidden when the user has zero
/// open positions so first-time visitors don't see an empty chart.
class AllocationCard extends StatelessWidget {
  const AllocationCard({super.key, required this.positions});
  final List<PortfolioPosition> positions;

  @override
  Widget build(BuildContext context) {
    if (positions.isEmpty) return const SizedBox.shrink();
    // Long-only weights: shorts get their absolute value too so the chart
    // reflects capital deployed, not net direction.
    final sectorBuckets = <String, double>{};
    final capBuckets = <CapSegment, double>{};
    var total = 0.0;
    for (final p in positions) {
      final w = p.invested.abs();
      if (w <= 0) continue;
      total += w;
      final sector = companyInfoFor(p.symbol)?.sector ?? 'Other';
      sectorBuckets[sector] = (sectorBuckets[sector] ?? 0) + w;
      final cap = capSegmentFor(p.symbol);
      capBuckets[cap] = (capBuckets[cap] ?? 0) + w;
    }
    if (total <= 0) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
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
                  color: const Color(0xFF8B5CF6).withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.pie_chart_outline,
                  color: Color(0xFF8B5CF6),
                  size: 16,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'Allocation',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              const Spacer(),
              Text(
                '${formatInr(total)} invested',
                style: TextStyle(
                  fontSize: 11,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _Breakdown(
                  title: 'By sector',
                  total: total,
                  entries: _topN(sectorBuckets, 6),
                  palette: const [
                    Color(0xFF22C55E),
                    Color(0xFF06B6D4),
                    Color(0xFF6366F1),
                    Color(0xFFEC4899),
                    Color(0xFFF59E0B),
                    Color(0xFF8B5CF6),
                    Color(0xFF94A3B8),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _Breakdown(
                  title: 'By market cap',
                  total: total,
                  entries: capBuckets.entries
                      .map((e) => MapEntry(e.key.label, e.value))
                      .toList()
                    ..sort((a, b) => b.value.compareTo(a.value)),
                  palette: const [
                    Color(0xFF22C55E),
                    Color(0xFFF59E0B),
                    Color(0xFFEC4899),
                    Color(0xFF94A3B8),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static List<MapEntry<String, double>> _topN(
    Map<String, double> buckets,
    int n,
  ) {
    final sorted = buckets.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    if (sorted.length <= n) return sorted;
    final head = sorted.take(n - 1).toList();
    final tail = sorted.skip(n - 1);
    final other = tail.fold<double>(0, (s, e) => s + e.value);
    head.add(MapEntry('Other', other));
    return head;
  }
}

class _Breakdown extends StatelessWidget {
  const _Breakdown({
    required this.title,
    required this.total,
    required this.entries,
    required this.palette,
  });

  final String title;
  final double total;
  final List<MapEntry<String, double>> entries;
  final List<Color> palette;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.4,
            color: scheme.onSurface.withValues(alpha: 0.55),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: SizedBox(
            width: 110,
            height: 110,
            child: CustomPaint(
              painter: _DonutPainter(
                values: entries.map((e) => e.value).toList(),
                colors: _paletteFor(entries.length),
              ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < entries.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: _LegendRow(
              label: entries[i].key,
              value: entries[i].value,
              total: total,
              color: _paletteFor(entries.length)[i],
            ),
          ),
      ],
    );
  }

  List<Color> _paletteFor(int n) {
    // Wrap if we ever exceed the supplied palette.
    if (n <= palette.length) return palette.sublist(0, n);
    return [for (var i = 0; i < n; i++) palette[i % palette.length]];
  }
}

class _LegendRow extends StatelessWidget {
  const _LegendRow({
    required this.label,
    required this.value,
    required this.total,
    required this.color,
  });
  final String label;
  final double value;
  final double total;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pct = total > 0 ? (value / total) * 100 : 0;
    return Row(
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
        ),
        Text(
          '${pct.toStringAsFixed(1)}%',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _DonutPainter extends CustomPainter {
  _DonutPainter({required this.values, required this.colors});
  final List<double> values;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    final total = values.fold<double>(0, (s, v) => s + v);
    if (total <= 0) return;
    final rect = Rect.fromLTWH(0, 0, size.width, size.height).deflate(6);
    final thickness = size.width * 0.18;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..strokeCap = StrokeCap.butt;
    const gap = 0.012; // 0.012 rad → thin black ticks between slices
    double start = -math.pi / 2; // start at 12 o'clock
    for (var i = 0; i < values.length; i++) {
      final share = values[i] / total;
      final sweep = (share * (2 * math.pi)) - gap;
      if (sweep <= 0) continue;
      paint.color = colors[i % colors.length];
      canvas.drawArc(
        rect.deflate(thickness / 2),
        start,
        sweep,
        false,
        paint,
      );
      start += sweep + gap;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) =>
      old.values != values || old.colors != colors;
}
