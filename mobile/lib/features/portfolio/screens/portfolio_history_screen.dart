import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/portfolio_history.dart';
import '../portfolio_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Equity curve + day-over-day P&L heatmap, backed by the daily snapshot
/// cron. Snapshots are written at 00:05 IST so the most recent point is
/// always "yesterday's close" — today's intraday equity lives on the main
/// portfolio screen instead.
class PortfolioHistoryScreen extends ConsumerStatefulWidget {
  const PortfolioHistoryScreen({super.key});

  @override
  ConsumerState<PortfolioHistoryScreen> createState() =>
      _PortfolioHistoryScreenState();
}

class _PortfolioHistoryScreenState
    extends ConsumerState<PortfolioHistoryScreen> {
  // Default to one quarter. Wide enough to read a trend, short enough that
  // a brand-new user with just a handful of snapshots still sees the curve.
  int _days = 90;

  static const _windows = <(int, String)>[
    (30, '1M'),
    (90, '3M'),
    (365, '1Y'),
    (1800, 'All'),
  ];

  @override
  Widget build(BuildContext context) {
    final history = ref.watch(portfolioHistoryProvider(_days));
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Portfolio history',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioHistoryProvider(_days));
          await ref.read(portfolioHistoryProvider(_days).future);
        },
        child: history.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
            ],
          ),
          data: (h) => _Body(
            history: h,
            days: _days,
            windows: _windows,
            onWindow: (d) => setState(() => _days = d),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.history,
    required this.days,
    required this.windows,
    required this.onWindow,
  });

  final PortfolioHistory history;
  final int days;
  final List<(int, String)> windows;
  final ValueChanged<int> onWindow;

  @override
  Widget build(BuildContext context) {
    final points = history.points;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _WindowChips(
          current: days,
          options: windows,
          onTap: onWindow,
        ),
        const SizedBox(height: 14),
        if (points.length < 2)
          const _EmptyHistory()
        else ...[
          _SummaryHeader(points: points),
          const SizedBox(height: 14),
          _EquityCurveCard(points: points),
          const SizedBox(height: 14),
          _StatsCard(points: points),
          const SizedBox(height: 14),
          _HeatmapCard(points: points),
        ],
      ],
    );
  }
}

class _EmptyHistory extends StatelessWidget {
  const _EmptyHistory();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
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
          Icon(
            Icons.timeline,
            size: 28,
            color: scheme.onSurface.withValues(alpha: 0.5),
          ),
          const SizedBox(height: 10),
          const Text(
            'Not enough history yet',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Daily snapshots are taken at 00:05 IST. Come back tomorrow '
            'and your equity curve will start to fill in.',
            style: TextStyle(
              fontSize: 12.5,
              color: scheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}

class _WindowChips extends StatelessWidget {
  const _WindowChips({
    required this.current,
    required this.options,
    required this.onTap,
  });

  final int current;
  final List<(int, String)> options;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      children: [
        for (final (d, label) in options) ...[
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () => onTap(d),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: current == d
                      ? scheme.primary.withValues(alpha: 0.18)
                      : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: current == d
                        ? scheme.primary.withValues(alpha: 0.5)
                        : scheme.outlineVariant.withValues(alpha: 0.3),
                  ),
                ),
                child: Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                    color: current == d ? scheme.primary : null,
                  ),
                ),
              ),
            ),
          ),
          if (d != options.last.$1) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({required this.points});
  final List<PortfolioHistoryPoint> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final first = points.first.totalEquity;
    final last = points.last.totalEquity;
    final change = last - first;
    final pct = first == 0 ? 0.0 : (change / first) * 100;
    final isUp = change >= 0;
    final color = isUp ? _upColor : _downColor;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.55),
            scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Latest snapshot · ${points.last.asOfDate}',
            style: TextStyle(
              color: scheme.onSurface.withValues(alpha: 0.6),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            formatInr(last),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  isUp ? Icons.trending_up : Icons.trending_down,
                  size: 14,
                  color: color,
                ),
                const SizedBox(width: 4),
                Text(
                  '${isUp ? '+' : ''}${formatInr(change)} '
                  '(${pct.toStringAsFixed(2)}%) over ${points.length} days',
                  style: TextStyle(
                    color: color,
                    fontSize: 12,
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

class _EquityCurveCard extends StatelessWidget {
  const _EquityCurveCard({required this.points});
  final List<PortfolioHistoryPoint> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Equity curve',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 200,
            child: CustomPaint(
              size: const Size(double.infinity, 200),
              painter: _EquityCurvePainter(
                points: points,
                gridColor: scheme.outlineVariant.withValues(alpha: 0.25),
                textColor: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EquityCurvePainter extends CustomPainter {
  _EquityCurvePainter({
    required this.points,
    required this.gridColor,
    required this.textColor,
  });

  final List<PortfolioHistoryPoint> points;
  final Color gridColor;
  final Color textColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    const leftPad = 48.0;
    const rightPad = 8.0;
    const topPad = 8.0;
    const bottomPad = 22.0;
    final plotWidth = size.width - leftPad - rightPad;
    final plotHeight = size.height - topPad - bottomPad;
    if (plotWidth <= 0 || plotHeight <= 0) return;

    var minV = points.first.totalEquity;
    var maxV = points.first.totalEquity;
    for (final p in points) {
      if (p.totalEquity < minV) minV = p.totalEquity;
      if (p.totalEquity > maxV) maxV = p.totalEquity;
    }
    // Add a touch of vertical breathing room so the line doesn't graze the
    // top/bottom edges. Floor the range to a small positive number so a
    // perfectly flat history still renders centered instead of dividing by 0.
    final pad = (maxV - minV) * 0.08;
    final lo = minV - pad;
    final hi = maxV + pad;
    final range = (hi - lo).abs() < 1 ? 1.0 : (hi - lo);

    final gridPaint = Paint()
      ..color = gridColor
      ..strokeWidth = 1;

    // Horizontal grid + y labels (5 lines).
    const yDivs = 4;
    for (var i = 0; i <= yDivs; i++) {
      final y = topPad + plotHeight * (i / yDivs);
      canvas.drawLine(
        Offset(leftPad, y),
        Offset(size.width - rightPad, y),
        gridPaint,
      );
      final v = hi - (hi - lo) * (i / yDivs);
      _drawText(
        canvas,
        _yLabel(v),
        Offset(leftPad - 6, y),
        textColor,
        align: _TextAlign.right,
        baseline: _Baseline.middle,
      );
    }

    // X-axis date labels — start and end only, to keep things readable.
    _drawText(
      canvas,
      points.first.asOfDate,
      Offset(leftPad, size.height - bottomPad + 6),
      textColor,
      align: _TextAlign.left,
      baseline: _Baseline.top,
    );
    _drawText(
      canvas,
      points.last.asOfDate,
      Offset(size.width - rightPad, size.height - bottomPad + 6),
      textColor,
      align: _TextAlign.right,
      baseline: _Baseline.top,
    );

    // Curve.
    final overallUp = points.last.totalEquity >= points.first.totalEquity;
    final lineColor = overallUp ? _upColor : _downColor;
    final dx = plotWidth / (points.length - 1);
    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final x = leftPad + i * dx;
      final t = (points[i].totalEquity - lo) / range;
      final y = topPad + plotHeight * (1 - t);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    // Soft fill under the line for shape.
    final fillPath = Path.from(path)
      ..lineTo(leftPad + (points.length - 1) * dx, topPad + plotHeight)
      ..lineTo(leftPad, topPad + plotHeight)
      ..close();
    canvas.drawPath(
      fillPath,
      Paint()
        ..shader = LinearGradient(
          colors: [
            lineColor.withValues(alpha: 0.22),
            lineColor.withValues(alpha: 0.0),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ).createShader(
          Rect.fromLTWH(leftPad, topPad, plotWidth, plotHeight),
        ),
    );

    canvas.drawPath(
      path,
      Paint()
        ..color = lineColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );

    // Latest dot.
    final lastX = leftPad + (points.length - 1) * dx;
    final lastT = (points.last.totalEquity - lo) / range;
    final lastY = topPad + plotHeight * (1 - lastT);
    canvas.drawCircle(
      Offset(lastX, lastY),
      3.5,
      Paint()..color = lineColor,
    );
  }

  @override
  bool shouldRepaint(covariant _EquityCurvePainter old) =>
      old.points != points ||
      old.gridColor != gridColor ||
      old.textColor != textColor;
}

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.points});
  final List<PortfolioHistoryPoint> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final stats = _computeStats(points);

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        children: [
          _StatRow(label: 'Peak equity', value: formatInr(stats.peak)),
          _StatRow(label: 'Trough equity', value: formatInr(stats.trough)),
          _StatRow(
            label: 'Max drawdown',
            value:
                '-${formatInr(stats.maxDrawdown)} (${stats.maxDrawdownPct.toStringAsFixed(2)}%)',
            valueColor: _downColor,
          ),
          _StatRow(
            label: 'Best day',
            value:
                '+${formatInr(stats.bestDay)} on ${stats.bestDayDate ?? '—'}',
            valueColor: _upColor,
          ),
          _StatRow(
            label: 'Worst day',
            value: stats.worstDay == 0
                ? '—'
                : '${formatInr(stats.worstDay)} on ${stats.worstDayDate ?? '—'}',
            valueColor: _downColor,
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.label,
    required this.value,
    this.valueColor,
  });
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.62),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: valueColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeatmapCard extends StatelessWidget {
  const _HeatmapCard({required this.points});
  final List<PortfolioHistoryPoint> points;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    // Day-over-day deltas keyed by IST date.
    final deltas = <String, double>{};
    for (var i = 1; i < points.length; i++) {
      deltas[points[i].asOfDate] =
          points[i].totalEquity - points[i - 1].totalEquity;
    }
    // Max-abs governs cell intensity so green and red are scaled the same.
    var maxAbs = 0.0;
    for (final v in deltas.values) {
      if (v.abs() > maxAbs) maxAbs = v.abs();
    }

    final firstDate = points.first.date;
    final lastDate = points.last.date;
    // GitHub-style: columns are weeks, rows are weekdays (Mon→Sun).
    // We anchor the first column at the Monday on or before firstDate so
    // the grid lines up neatly.
    final gridStart = _mondayOnOrBefore(firstDate);
    final daySpan = lastDate.difference(gridStart).inDays + 1;
    final weeks = (daySpan / 7).ceil();

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Daily P&L heatmap',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 7 * 14.0 + 6,
            child: CustomPaint(
              size: Size(double.infinity, 7 * 14.0 + 6),
              painter: _HeatmapPainter(
                gridStart: gridStart,
                weeks: weeks,
                deltas: deltas,
                maxAbs: maxAbs,
                emptyColor: scheme.surfaceContainerHighest
                    .withValues(alpha: 0.35),
                borderColor: scheme.outlineVariant.withValues(alpha: 0.3),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Text(
                'Less',
                style: TextStyle(
                  fontSize: 10.5,
                  color: scheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
              const SizedBox(width: 6),
              for (final t in const [0.2, 0.5, 0.85]) ...[
                _LegendBox(color: _downColor.withValues(alpha: t)),
                const SizedBox(width: 2),
              ],
              const SizedBox(width: 6),
              _LegendBox(
                color: scheme.surfaceContainerHighest
                    .withValues(alpha: 0.4),
                border: scheme.outlineVariant.withValues(alpha: 0.3),
              ),
              const SizedBox(width: 6),
              for (final t in const [0.2, 0.5, 0.85]) ...[
                _LegendBox(color: _upColor.withValues(alpha: t)),
                const SizedBox(width: 2),
              ],
              const SizedBox(width: 6),
              Text(
                'More',
                style: TextStyle(
                  fontSize: 10.5,
                  color: scheme.onSurface.withValues(alpha: 0.5),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LegendBox extends StatelessWidget {
  const _LegendBox({required this.color, this.border});
  final Color color;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 11,
      height: 11,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2),
        border: border == null ? null : Border.all(color: border!, width: 0.5),
      ),
    );
  }
}

class _HeatmapPainter extends CustomPainter {
  _HeatmapPainter({
    required this.gridStart,
    required this.weeks,
    required this.deltas,
    required this.maxAbs,
    required this.emptyColor,
    required this.borderColor,
  });

  final DateTime gridStart;
  final int weeks;
  final Map<String, double> deltas;
  final double maxAbs;
  final Color emptyColor;
  final Color borderColor;

  @override
  void paint(Canvas canvas, Size size) {
    // Cell size scales to the available width so 30d / 90d / 365d all look
    // proportionate. Floor at 6 so very long windows still render the dots.
    final cell = ((size.width - (weeks - 1) * 2) / weeks).clamp(6.0, 18.0);
    final gap = 2.0;
    for (var w = 0; w < weeks; w++) {
      for (var d = 0; d < 7; d++) {
        final date = gridStart.add(Duration(days: w * 7 + d));
        final key = _isoDate(date);
        final v = deltas[key];

        Color fill;
        Color? border;
        if (v == null) {
          // No snapshot for this date (weekend, holiday, or before history
          // begins). Slight tint so the grid still shows.
          fill = emptyColor;
          border = borderColor;
        } else if (v == 0 || maxAbs == 0) {
          fill = emptyColor;
          border = borderColor;
        } else {
          final intensity = (v.abs() / maxAbs).clamp(0.15, 0.95);
          fill = (v > 0 ? _upColor : _downColor)
              .withValues(alpha: intensity);
        }

        final rect = Rect.fromLTWH(
          w * (cell + gap),
          d * (cell + gap),
          cell,
          cell,
        );
        final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(2));
        canvas.drawRRect(rrect, Paint()..color = fill);
        if (border != null) {
          canvas.drawRRect(
            rrect,
            Paint()
              ..color = border
              ..style = PaintingStyle.stroke
              ..strokeWidth = 0.5,
          );
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant _HeatmapPainter old) =>
      old.gridStart != gridStart ||
      old.weeks != weeks ||
      old.deltas != deltas ||
      old.maxAbs != maxAbs;
}

// -------------------- helpers --------------------

class _Stats {
  _Stats({
    required this.peak,
    required this.trough,
    required this.maxDrawdown,
    required this.maxDrawdownPct,
    required this.bestDay,
    required this.bestDayDate,
    required this.worstDay,
    required this.worstDayDate,
  });
  final double peak;
  final double trough;
  final double maxDrawdown;
  final double maxDrawdownPct;
  final double bestDay;
  final String? bestDayDate;
  final double worstDay;
  final String? worstDayDate;
}

_Stats _computeStats(List<PortfolioHistoryPoint> points) {
  var peak = points.first.totalEquity;
  var trough = points.first.totalEquity;
  var runningPeak = points.first.totalEquity;
  var maxDD = 0.0;
  var maxDDPct = 0.0;
  var bestDay = 0.0;
  String? bestDayDate;
  var worstDay = 0.0;
  String? worstDayDate;

  for (var i = 0; i < points.length; i++) {
    final v = points[i].totalEquity;
    if (v > peak) peak = v;
    if (v < trough) trough = v;
    if (v > runningPeak) runningPeak = v;
    final dd = runningPeak - v;
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPct = runningPeak == 0 ? 0 : (dd / runningPeak) * 100;
    }
    if (i > 0) {
      final delta = v - points[i - 1].totalEquity;
      if (delta > bestDay) {
        bestDay = delta;
        bestDayDate = points[i].asOfDate;
      }
      if (delta < worstDay) {
        worstDay = delta;
        worstDayDate = points[i].asOfDate;
      }
    }
  }
  return _Stats(
    peak: peak,
    trough: trough,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    bestDay: bestDay,
    bestDayDate: bestDayDate,
    worstDay: worstDay,
    worstDayDate: worstDayDate,
  );
}

DateTime _mondayOnOrBefore(DateTime d) {
  // DateTime.weekday: Mon=1 … Sun=7. Subtract enough days to land on the
  // Monday in or before `d`.
  final back = d.weekday - DateTime.monday;
  return DateTime(d.year, d.month, d.day - back);
}

String _isoDate(DateTime d) {
  final m = d.month.toString().padLeft(2, '0');
  final dd = d.day.toString().padLeft(2, '0');
  return '${d.year}-$m-$dd';
}

String _yLabel(double v) {
  if (v.abs() >= 10000000) return '${(v / 10000000).toStringAsFixed(1)}Cr';
  if (v.abs() >= 100000) return '${(v / 100000).toStringAsFixed(1)}L';
  if (v.abs() >= 1000) return '${(v / 1000).toStringAsFixed(0)}K';
  return v.toStringAsFixed(0);
}

enum _TextAlign { left, right }

enum _Baseline { top, middle }

void _drawText(
  Canvas canvas,
  String text,
  Offset anchor,
  Color color, {
  _TextAlign align = _TextAlign.left,
  _Baseline baseline = _Baseline.top,
  double size = 10,
}) {
  final tp = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(color: color, fontSize: size),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  final x = align == _TextAlign.right ? anchor.dx - tp.width : anchor.dx;
  final y = baseline == _Baseline.middle ? anchor.dy - tp.height / 2 : anchor.dy;
  tp.paint(canvas, Offset(x, y));
}
