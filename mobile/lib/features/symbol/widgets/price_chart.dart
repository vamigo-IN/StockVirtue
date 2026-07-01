import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/market_hours.dart';
import '../../../data/models/candle.dart';
import '../../chart/screens/chart_screen.dart';
import '../../market/market_repository.dart';

/// Time range chips supported on the symbol detail screen. Each maps to the
/// best (interval, hours) tuple the SmartAPI historical-data endpoint accepts:
///
///   * 1D: 5-minute bars across one trading day (~6.5h)
///   * 1W: 15-minute bars across 5 trading days
///   * 1M: hourly bars across 30 days
///   * 6M / 1Y / 5Y / ALL: daily bars
///
/// `ALL` requests the SmartAPI ceiling (~2000 trading days ≈ 5.5 years on
/// daily candles). The provider sends a much larger `hours` value; the
/// backend clamps it and SmartAPI returns whatever history it has.
enum ChartRange { d1, w1, m1, m6, y1, y5, all }

extension ChartRangeX on ChartRange {
  String get label => switch (this) {
        ChartRange.d1 => '1D',
        ChartRange.w1 => '1W',
        ChartRange.m1 => '1M',
        ChartRange.m6 => '6M',
        ChartRange.y1 => '1Y',
        ChartRange.y5 => '5Y',
        ChartRange.all => 'ALL',
      };

  String get interval => switch (this) {
        ChartRange.d1 => 'FIVE_MINUTE',
        ChartRange.w1 => 'FIFTEEN_MINUTE',
        ChartRange.m1 => 'ONE_HOUR',
        ChartRange.m6 => 'ONE_DAY',
        ChartRange.y1 => 'ONE_DAY',
        ChartRange.y5 => 'ONE_DAY',
        ChartRange.all => 'ONE_DAY',
      };

  int get hours => switch (this) {
        ChartRange.d1 => 24,
        ChartRange.w1 => 24 * 7,
        ChartRange.m1 => 24 * 30,
        ChartRange.m6 => 24 * 180,
        ChartRange.y1 => 24 * 370,
        ChartRange.y5 => 24 * 365 * 5,
        ChartRange.all => 24 * 365 * 10, // backend clamps to ~5.5y ceiling
      };
}

class PriceChartArgs {
  final String symbol;
  final String exchange;
  final ChartRange range;
  const PriceChartArgs({
    required this.symbol,
    required this.exchange,
    required this.range,
  });

  @override
  bool operator ==(Object other) =>
      other is PriceChartArgs &&
      other.symbol == symbol &&
      other.exchange == exchange &&
      other.range == range;

  @override
  int get hashCode => Object.hash(symbol, exchange, range);
}

final priceChartCandlesProvider =
    FutureProvider.autoDispose.family<List<Candle>, PriceChartArgs>(
  (ref, args) async {
    final repo = ref.watch(marketRepositoryProvider);
    return repo.getCandles(
      args.symbol,
      exchange: args.exchange,
      interval: args.range.interval,
      hours: args.range.hours,
    );
  },
);

/// The full chart widget: range chips on top, animated line/area below.
/// Live ticks are not appended here — the displayed series is whatever the
/// candles endpoint returned for the active range, so users see a stable
/// historical picture per-range and switching is the only state change.
class PriceChart extends ConsumerStatefulWidget {
  const PriceChart({
    super.key,
    required this.symbol,
    required this.exchange,
    this.initialRange,
    this.height = 220,
  });

  final String symbol;
  final String exchange;
  /// Explicit starting range. If null, the chart picks `1D` while the
  /// market is open (so users see today's intraday by default) and `1M`
  /// otherwise (a stable, populated view outside trading hours).
  final ChartRange? initialRange;
  final double height;

  @override
  ConsumerState<PriceChart> createState() => _PriceChartState();
}

enum ChartStyle { line, candle }

/// Optional studies overlaid on top of the price line/candles. Multiple
/// can be active at once; the painter walks each enabled study, plotting
/// it in its own colour over the same axis as the price series.
enum ChartIndicator { sma20, ema20, bollinger }

class _PriceChartState extends ConsumerState<PriceChart> {
  late ChartRange _range;
  ChartStyle _style = ChartStyle.line;
  final Set<ChartIndicator> _indicators = <ChartIndicator>{};
  // When set, the chart overlays a second symbol's price series normalized
  // to % change from its first sample. Line-mode only — comparing candles
  // is ambiguous in a single chart.
  StockSearchResult? _compare;
  // Index of the candle under the user's pointer when they're scrubbing.
  // Drives the crosshair + tooltip in the chart overlay.
  int? _hoverIndex;
  // Polls the candle provider every 30s while the market is open so the
  // last visible bar tracks live price action. Cancelled on dispose and
  // when the market closes (we don't waste polls overnight or weekends).
  Timer? _autoRefresh;

  @override
  void initState() {
    super.initState();
    _range =
        widget.initialRange ?? (isMarketOpen() ? ChartRange.d1 : ChartRange.m1);
    _autoRefresh = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      if (!isMarketOpen()) return;
      ref.invalidate(
        priceChartCandlesProvider(
          PriceChartArgs(
            symbol: widget.symbol,
            exchange: widget.exchange,
            range: _range,
          ),
        ),
      );
    });
  }

  @override
  void dispose() {
    _autoRefresh?.cancel();
    super.dispose();
  }

  Future<void> _pickCompareSymbol() async {
    final picked = await showModalBottomSheet<StockSearchResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _CompareSearchSheet(),
    );
    if (picked != null && mounted) {
      setState(() => _compare = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final candlesAsync = ref.watch(
      priceChartCandlesProvider(
        PriceChartArgs(
          symbol: widget.symbol,
          exchange: widget.exchange,
          range: _range,
        ),
      ),
    );
    final compareAsync = _compare == null
        ? null
        : ref.watch(
            priceChartCandlesProvider(
              PriceChartArgs(
                symbol: _compare!.symbol,
                exchange: _compare!.exchange,
                range: _range,
              ),
            ),
          );
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          height: widget.height,
          child: candlesAsync.when(
            loading: () => Container(
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Container(
              decoration: BoxDecoration(
                color: scheme.errorContainer.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Center(
                child: Text(
                  'Chart unavailable',
                  style: TextStyle(
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            ),
            data: (candles) {
              if (candles.length < 2) {
                // SmartAPI's historical-data endpoint returns empty rows for
                // a handful of BSE indices (BSE 100/500/MIDCAP/SMLCAP and a
                // few others) even though their LTP feed works. Rather than
                // showing a dead-end "no data" message, offer the TradingView
                // chart which covers every Indian index reliably.
                return _UnavailableFallback(
                  symbol: widget.symbol,
                  exchange: widget.exchange,
                );
              }
              final compareCandles = compareAsync?.value;
              final canvas = _ChartCanvas(
                candles: candles,
                style: _style,
                indicators: _indicators,
                compareCandles: compareCandles,
                compareLabel: _compare?.symbol,
                range: _range,
                hoverIndex: _hoverIndex,
              );
              // Scrub a finger across the chart to read off the candle under
              // the pointer (crosshair + tooltip).
              return LayoutBuilder(
                builder: (context, constraints) {
                  void hoverFromDx(double dx) {
                    final n = candles.length;
                    final ratio =
                        (dx / constraints.maxWidth).clamp(0.0, 1.0);
                    final idx = (ratio * (n - 1)).round().clamp(0, n - 1);
                    if (idx != _hoverIndex) {
                      setState(() => _hoverIndex = idx);
                    }
                  }

                  void clearHover() {
                    if (_hoverIndex != null) {
                      setState(() => _hoverIndex = null);
                    }
                  }

                  return GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTapDown: (d) => hoverFromDx(d.localPosition.dx),
                    onHorizontalDragStart: (d) =>
                        hoverFromDx(d.localPosition.dx),
                    onHorizontalDragUpdate: (d) =>
                        hoverFromDx(d.localPosition.dx),
                    onHorizontalDragEnd: (_) => clearHover(),
                    onTapUp: (_) => clearHover(),
                    child: canvas,
                  );
                },
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _RangeChips(
                selected: _range,
                onChanged: (r) => setState(() => _range = r),
              ),
            ),
            const SizedBox(width: 8),
            _StyleToggle(
              style: _style,
              onChanged: (s) => setState(() => _style = s),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _IndicatorChips(
                selected: _indicators,
                onToggle: (i) {
                  setState(() {
                    if (_indicators.contains(i)) {
                      _indicators.remove(i);
                    } else {
                      _indicators.add(i);
                    }
                  });
                },
              ),
            ),
            const SizedBox(width: 8),
            _CompareControl(
              active: _compare,
              onAdd: _pickCompareSymbol,
              onRemove: () => setState(() => _compare = null),
            ),
          ],
        ),
        // SmartAPI's getCandleData-with-OI endpoint is F&O only. We render
        // an OI bar panel below the price line for NFO / BFO instruments,
        // so traders can see whether OI built up or unwound across the
        // selected window. Best-effort — hides silently on failure.
        if (widget.exchange == 'NFO' || widget.exchange == 'BFO')
          _OIPanel(
            symbol: widget.symbol,
            exchange: widget.exchange,
            range: _range,
          ),
      ],
    );
  }
}

/// Shown in place of the line/candle painter when the candles endpoint
/// returns nothing usable — typically a BSE index that SmartAPI's
/// historical feed doesn't cover. Punts users to the full TradingView
/// chart, which works for every index Angel One won't serve.
class _UnavailableFallback extends StatelessWidget {
  const _UnavailableFallback({
    required this.symbol,
    required this.exchange,
  });
  final String symbol;
  final String exchange;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.show_chart,
            size: 28,
            color: scheme.onSurface.withValues(alpha: 0.45),
          ),
          const SizedBox(height: 8),
          Text(
            'Chart data unavailable',
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: scheme.onSurface.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Open on TradingView for a full chart',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.tonalIcon(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ChartScreen(
                  symbol: symbol,
                  exchange: exchange,
                ),
              ),
            ),
            icon: const Icon(Icons.open_in_new, size: 14),
            label: const Text(
              'Open chart',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 8,
              ),
              minimumSize: const Size(0, 32),
            ),
          ),
        ],
      ),
    );
  }
}

class _OIArgs {
  final String symbol;
  final String exchange;
  final ChartRange range;
  const _OIArgs({
    required this.symbol,
    required this.exchange,
    required this.range,
  });

  @override
  bool operator ==(Object other) =>
      other is _OIArgs &&
      other.symbol == symbol &&
      other.exchange == exchange &&
      other.range == range;

  @override
  int get hashCode => Object.hash(symbol, exchange, range);
}

final _oiCandlesProvider =
    FutureProvider.autoDispose.family<List<CandleOI>, _OIArgs>(
  (ref, args) async {
    final repo = ref.watch(marketRepositoryProvider);
    // OI is only meaningful on daily granularity for any reasonable window —
    // sub-day OI snapshots are not standardized across exchanges.
    return repo.getCandlesWithOI(
      args.symbol,
      exchange: args.exchange,
      interval: 'ONE_DAY',
      hours: args.range.hours,
    );
  },
);

class _OIPanel extends ConsumerWidget {
  const _OIPanel({
    required this.symbol,
    required this.exchange,
    required this.range,
  });
  final String symbol;
  final String exchange;
  final ChartRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(
      _oiCandlesProvider(
        _OIArgs(symbol: symbol, exchange: exchange, range: range),
      ),
    );
    final scheme = Theme.of(context).colorScheme;
    return async.when(
      loading: () => const SizedBox(height: 0),
      error: (_, _) => const SizedBox.shrink(),
      data: (candles) {
        if (candles.length < 2) return const SizedBox.shrink();
        final ois = candles.map((c) => c.oi).toList();
        final first = ois.first;
        final last = ois.last;
        final delta = first == 0 ? 0.0 : ((last - first) / first) * 100;
        final isBuildup = delta >= 0;
        final color = isBuildup
            ? const Color(0xFF6366F1)
            : const Color(0xFFEC4899);
        return Padding(
          padding: const EdgeInsets.only(top: 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.layers_outlined,
                    color: color,
                    size: 14,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Open interest',
                    style: TextStyle(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                      color: scheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Text(
                      '${isBuildup ? 'Buildup' : 'Unwinding'} '
                      '${isBuildup ? '+' : ''}${delta.toStringAsFixed(1)}%',
                      style: TextStyle(
                        color: color,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox(
                  height: 56,
                  child: CustomPaint(
                    painter: _OIBarPainter(values: ois, color: color),
                    child: const SizedBox.expand(),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _OIBarPainter extends CustomPainter {
  _OIBarPainter({required this.values, required this.color});
  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    var min = values[0];
    var max = values[0];
    for (final v in values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    final range = max - min == 0 ? 1.0 : max - min;
    final n = values.length;
    final barW = size.width / n;
    final padX = barW * 0.2;
    final paint = Paint()..color = color.withValues(alpha: 0.55);
    for (var i = 0; i < n; i++) {
      final h = ((values[i] - min) / range) * size.height;
      final x = i * barW + padX;
      final y = size.height - h;
      canvas.drawRRect(
        RRect.fromLTRBR(
          x,
          y,
          x + barW - padX * 2,
          size.height,
          const Radius.circular(2),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _OIBarPainter old) =>
      old.values != values || old.color != color;
}

class _ChartCanvas extends StatelessWidget {
  const _ChartCanvas({
    required this.candles,
    required this.style,
    required this.indicators,
    required this.range,
    this.compareCandles,
    this.compareLabel,
    this.hoverIndex,
  });
  final List<Candle> candles;
  final ChartStyle style;
  final Set<ChartIndicator> indicators;
  /// Active range chip — drives the granularity of the x-axis labels.
  final ChartRange range;
  /// Second symbol's candles. When non-null both series are rebased to
  /// % change from their first sample and rendered on a shared axis.
  final List<Candle>? compareCandles;
  final String? compareLabel;
  /// Candle index under the user's finger when scrubbing. Drives the
  /// crosshair + tooltip overlay; null = pointer not active.
  final int? hoverIndex;

  @override
  Widget build(BuildContext context) {
    final closes = candles.map((c) => c.close).toList();
    final compareCloses = compareCandles?.map((c) => c.close).toList();
    final inCompareMode = compareCloses != null && compareCloses.length >= 2;
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Stack(
        children: [
          CustomPaint(
            painter: inCompareMode
                ? _ComparePainter(
                    primary: closes,
                    secondary: compareCloses,
                  )
                : style == ChartStyle.line
                    ? _PricePainter(values: closes)
                    : _CandlePainter(candles: candles),
            child: const SizedBox.expand(),
          ),
          if (!inCompareMode && indicators.isNotEmpty)
            // Indicators get painted on top so their lines sit above the
            // area fill but the price line/candles still poke through.
            // We compute series once per chart build and let the painter
            // share the same min/max scaling as the line painter.
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _IndicatorPainter(
                    closes: closes,
                    indicators: indicators,
                  ),
                ),
              ),
            ),
          // Bottom-axis time labels — granularity adapts to the range
          // (hours for 1D, weekdays for 1W, dates beyond that). Live in
          // the same 16px bottom pad the price/candle painters reserve so
          // labels don't collide with the line.
          Positioned.fill(
            child: IgnorePointer(
              child: CustomPaint(
                painter: _TimeAxisPainter(
                  candles: candles,
                  range: range,
                ),
              ),
            ),
          ),
          if (inCompareMode && compareLabel != null)
            Positioned(
              top: 8,
              left: 10,
              child: _CompareLegend(label: compareLabel!),
            ),
          // Crosshair + price/time tooltip — only rendered while a finger
          // is on the chart. Compare mode skips this since the tooltip
          // would need two prices and the chart is already an overlay.
          if (hoverIndex != null && !inCompareMode)
            Positioned.fill(
              child: IgnorePointer(
                child: CustomPaint(
                  painter: _CrosshairPainter(
                    candles: candles,
                    hoverIndex: hoverIndex!,
                    style: style,
                    range: range,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Bottom-axis time labels. The granularity flips based on the active
/// range — anchored to candle timestamps so labels always sit under the
/// right vertical slot regardless of how SmartAPI sparses out the bars
/// (e.g., gaps over weekends, varying intraday cadence).
///
/// We paint at most ~6 labels evenly spaced across the width; with the
/// first/last always anchored to the leftmost/rightmost candle. This
/// avoids the "10 cramped labels" mess the chart had before.
class _TimeAxisPainter extends CustomPainter {
  _TimeAxisPainter({required this.candles, required this.range});
  final List<Candle> candles;
  final ChartRange range;

  static const _bottomReserve = 14.0;
  static const _maxLabels = 6;

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.length < 2) return;
    final n = candles.length;
    // Step so the first and last bar always get a label, plus up to
    // (_maxLabels - 2) interior ticks evenly distributed.
    final ticks = math.min(_maxLabels, n);
    final indices = <int>[
      for (var i = 0; i < ticks; i++)
        ((i / (ticks - 1)) * (n - 1)).round(),
    ];
    final dx = size.width / (n - 1);
    final y = size.height - _bottomReserve / 2 + 1;
    for (final idx in indices) {
      final x = idx * dx;
      _drawLabel(
        canvas,
        size,
        _formatTime(candles[idx].time, range),
        x,
        y,
      );
    }
  }

  void _drawLabel(Canvas canvas, Size size, String text, double x, double y) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: Colors.white.withValues(alpha: 0.5),
          fontSize: 9.5,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.2,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    // Clamp into the canvas — first/last labels would otherwise spill.
    final left = (x - tp.width / 2).clamp(2.0, size.width - tp.width - 2);
    tp.paint(canvas, Offset(left, y - tp.height / 2));
  }

  @override
  bool shouldRepaint(covariant _TimeAxisPainter old) =>
      old.candles != candles || old.range != range;
}

String _formatTime(DateTime t, ChartRange range) {
  // SmartAPI returns IST-offset timestamps ("2026-05-23T09:15:00+05:30").
  // DateTime.parse keeps the offset, but the displayed components are in
  // local time. Convert to IST explicitly so labels read like the user
  // expects ("09:15" not "03:45" if the device is in UTC).
  final ist = t.toUtc().add(const Duration(hours: 5, minutes: 30));
  switch (range) {
    case ChartRange.d1:
      // Intraday — minutes matter ("09:15", "12:45").
      final h = ist.hour.toString().padLeft(2, '0');
      final m = ist.minute.toString().padLeft(2, '0');
      return '$h:$m';
    case ChartRange.w1:
      // Short weekday + time — five sessions look identical without time
      // ("Mon Mon Mon Mon Mon" of consecutive 15-min bars would be useless).
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      final h = ist.hour.toString().padLeft(2, '0');
      final m = ist.minute.toString().padLeft(2, '0');
      return '${days[ist.weekday - 1]} $h:$m';
    case ChartRange.m1:
    case ChartRange.m6:
      return '${ist.day} ${_monthShort(ist.month)}';
    case ChartRange.y1:
    case ChartRange.y5:
    case ChartRange.all:
      return '${_monthShort(ist.month)} ${ist.year.toString().substring(2)}';
  }
}

const _monthShortNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
String _monthShort(int m) => _monthShortNames[m - 1];

/// Vertical crosshair + floating tooltip showing the candle under the
/// user's finger. Line mode → just close. Candle mode → full OHLC. Time
/// label uses the same granularity as the bottom axis for consistency.
class _CrosshairPainter extends CustomPainter {
  _CrosshairPainter({
    required this.candles,
    required this.hoverIndex,
    required this.style,
    required this.range,
  });

  final List<Candle> candles;
  final int hoverIndex;
  final ChartStyle style;
  final ChartRange range;

  // Padding constants must mirror the price/candle painters or the dot
  // and the actual candle position will drift apart vertically.
  static const _padTop = 16.0;
  static const _padBottom = 16.0;

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.length < 2) return;
    if (hoverIndex < 0 || hoverIndex >= candles.length) return;

    // Same min/max calculation as the price painters — using the candle
    // body (high/low) so the crosshair dot stays anchored even in candle
    // mode where wicks define the bounds.
    var min = candles.first.low;
    var max = candles.first.high;
    for (final c in candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    if (style == ChartStyle.line) {
      min = candles.first.close;
      max = candles.first.close;
      for (final c in candles) {
        if (c.close < min) min = c.close;
        if (c.close > max) max = c.close;
      }
    }
    final priceRange = max - min == 0 ? 1.0 : max - min;
    final usable = size.height - _padTop - _padBottom;

    final c = candles[hoverIndex];
    final dx = size.width / (candles.length - 1);
    final x = hoverIndex * dx;
    final y =
        size.height - _padBottom - ((c.close - min) / priceRange) * usable;

    // Vertical crosshair.
    final linePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.35)
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(x, _padTop),
      Offset(x, size.height - _padBottom),
      linePaint,
    );

    // Dot at the touched price.
    final dotColor = c.close >= c.open
        ? const Color(0xFF22C55E)
        : const Color(0xFFEF4444);
    canvas.drawCircle(
      Offset(x, y),
      4,
      Paint()..color = dotColor.withValues(alpha: 0.25),
    );
    canvas.drawCircle(Offset(x, y), 2.5, Paint()..color = dotColor);

    // Tooltip — top-left for hovers in the right half, top-right for
    // hovers in the left half, so the box never hides the crosshair.
    final lines = <String>[
      _formatTooltipTime(c.time, range),
      if (style == ChartStyle.candle) ...[
        'O ${c.open.toStringAsFixed(2)}',
        'H ${c.high.toStringAsFixed(2)}',
        'L ${c.low.toStringAsFixed(2)}',
        'C ${c.close.toStringAsFixed(2)}',
      ] else
        c.close.toStringAsFixed(2),
    ];
    final painters = lines
        .map(
          (s) => TextPainter(
            text: TextSpan(
              text: s,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            textDirection: TextDirection.ltr,
          )..layout(),
        )
        .toList();
    final maxW = painters.fold<double>(0, (a, p) => math.max(a, p.width));
    final totalH = painters.fold<double>(0, (a, p) => a + p.height);
    const padX = 8.0;
    const padY = 6.0;
    final boxW = maxW + padX * 2;
    final boxH = totalH + padY * 2;
    final placeLeft = x > size.width / 2;
    final boxLeft = placeLeft ? 8.0 : size.width - boxW - 8;
    final boxTop = 8.0;
    final rect = RRect.fromRectAndRadius(
      Rect.fromLTWH(boxLeft, boxTop, boxW, boxH),
      const Radius.circular(6),
    );
    canvas.drawRRect(rect, Paint()..color = Colors.black.withValues(alpha: 0.55));
    canvas.drawRRect(
      rect,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.18)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    var py = boxTop + padY;
    for (final p in painters) {
      p.paint(canvas, Offset(boxLeft + padX, py));
      py += p.height;
    }
  }

  @override
  bool shouldRepaint(covariant _CrosshairPainter old) =>
      old.candles != candles ||
      old.hoverIndex != hoverIndex ||
      old.style != style ||
      old.range != range;
}

String _formatTooltipTime(DateTime t, ChartRange range) {
  final ist = t.toUtc().add(const Duration(hours: 5, minutes: 30));
  switch (range) {
    case ChartRange.d1:
    case ChartRange.w1:
      // Intraday: full date + minute precision.
      final h = ist.hour.toString().padLeft(2, '0');
      final m = ist.minute.toString().padLeft(2, '0');
      return '${ist.day} ${_monthShort(ist.month)} · $h:$m';
    case ChartRange.m1:
    case ChartRange.m6:
    case ChartRange.y1:
    case ChartRange.y5:
    case ChartRange.all:
      // Daily bars — minute precision would be misleading (the SmartAPI
      // close is the day's last LTP, not a real intraday moment).
      return '${ist.day} ${_monthShort(ist.month)} ${ist.year}';
  }
}

/// Renders the two series rebased to % change from their first observation
/// so symbols at very different absolute prices can be visually compared.
/// Horizontal zero line indicates "no change since start".
class _ComparePainter extends CustomPainter {
  _ComparePainter({required this.primary, required this.secondary});
  final List<double> primary;
  final List<double> secondary;

  static const _primaryColor = Color(0xFF22C55E);
  static const _secondaryColor = Color(0xFF6366F1);

  static List<double> _toReturns(List<double> series) {
    if (series.isEmpty) return const [];
    final base = series.first;
    if (base == 0) return List<double>.filled(series.length, 0);
    return [for (final v in series) ((v - base) / base) * 100];
  }

  @override
  void paint(Canvas canvas, Size size) {
    if (primary.length < 2 && secondary.length < 2) return;
    final p = _toReturns(primary);
    final s = _toReturns(secondary);
    var min = 0.0;
    var max = 0.0;
    for (final v in [...p, ...s]) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min < 0.5) {
      max += 0.5;
      min -= 0.5;
    }
    final range = max - min;
    const padTop = 18.0;
    const padBottom = 16.0;
    final usable = size.height - padTop - padBottom;
    double yFor(double v) =>
        size.height - padBottom - ((v - min) / range) * usable;

    final guide = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = padTop + (i / 4) * usable;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), guide);
    }
    // Solid zero-return baseline.
    final zero = Paint()
      ..color = Colors.white.withValues(alpha: 0.18)
      ..strokeWidth = 1;
    final y0 = yFor(0);
    canvas.drawLine(Offset(0, y0), Offset(size.width, y0), zero);

    void plot(List<double> series, Color color) {
      if (series.length < 2) return;
      final dx = size.width / (series.length - 1);
      final path = Path();
      for (var i = 0; i < series.length; i++) {
        final x = i * dx;
        final y = yFor(series[i]);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      final stroke = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round;
      canvas.drawPath(path, stroke);
      // Last point marker
      final lastX = (series.length - 1) * dx;
      final lastY = yFor(series.last);
      canvas.drawCircle(
        Offset(lastX, lastY),
        4,
        Paint()..color = color.withValues(alpha: 0.25),
      );
      canvas.drawCircle(
        Offset(lastX, lastY),
        2.5,
        Paint()..color = color,
      );
    }

    plot(p, _primaryColor);
    plot(s, _secondaryColor);
  }

  @override
  bool shouldRepaint(covariant _ComparePainter old) =>
      old.primary != primary || old.secondary != secondary;
}

class _CompareLegend extends StatelessWidget {
  const _CompareLegend({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _legendDot(_ComparePainter._primaryColor),
          const SizedBox(width: 3),
          const Text(
            'this',
            style: TextStyle(
              color: Colors.white,
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 8),
          _legendDot(_ComparePainter._secondaryColor),
          const SizedBox(width: 3),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 9.5,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }

  Widget _legendDot(Color c) => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(color: c, shape: BoxShape.circle),
      );
}

/// Segmented toggle for switching between the line and candlestick view.
class _StyleToggle extends StatelessWidget {
  const _StyleToggle({required this.style, required this.onChanged});
  final ChartStyle style;
  final ValueChanged<ChartStyle> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget btn(ChartStyle s, IconData icon, String label) {
      final active = s == style;
      return InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => onChanged(s),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: active ? scheme.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 13,
                color: active
                    ? scheme.onPrimary
                    : scheme.onSurface.withValues(alpha: 0.65),
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  color: active
                      ? scheme.onPrimary
                      : scheme.onSurface.withValues(alpha: 0.65),
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          btn(ChartStyle.line, Icons.show_chart, 'Line'),
          btn(ChartStyle.candle, Icons.candlestick_chart, 'Candle'),
        ],
      ),
    );
  }
}

/// Candlestick painter — body coloured green/red by direction, thin wick
/// for high/low. Bars are spaced evenly across the canvas; we don't draw
/// a time axis (the range chip + the always-visible last marker tell the
/// user where the latest data is).
class _CandlePainter extends CustomPainter {
  _CandlePainter({required this.candles});
  final List<Candle> candles;

  static const _up = Color(0xFF22C55E);
  static const _down = Color(0xFFEF4444);

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.length < 2) return;
    var min = candles.first.low;
    var max = candles.first.high;
    for (final c in candles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    final range = max - min == 0 ? 1.0 : max - min;
    const padTop = 16.0;
    const padBottom = 16.0;
    final usable = size.height - padTop - padBottom;

    // Faint horizontal guides — same density as the line chart.
    final guide = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = padTop + (i / 4) * usable;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), guide);
    }

    final n = candles.length;
    final slot = size.width / n;
    final bodyW = (slot * 0.65).clamp(1.5, 14.0);
    double yFor(double v) =>
        size.height - padBottom - ((v - min) / range) * usable;

    final wickPaint = Paint()..strokeWidth = 1;
    for (var i = 0; i < n; i++) {
      final c = candles[i];
      final isUp = c.close >= c.open;
      final color = isUp ? _up : _down;
      final cx = slot * i + slot / 2;
      final yH = yFor(c.high);
      final yL = yFor(c.low);
      // Wick
      wickPaint.color = color;
      canvas.drawLine(Offset(cx, yH), Offset(cx, yL), wickPaint);
      // Body
      final yO = yFor(c.open);
      final yC = yFor(c.close);
      final top = yO < yC ? yO : yC;
      final bottom = yO < yC ? yC : yO;
      final body = Rect.fromLTRB(
        cx - bodyW / 2,
        top,
        cx + bodyW / 2,
        // Doji safety: minimum 1 px height.
        bottom - top < 1 ? top + 1 : bottom,
      );
      final bodyPaint = Paint()
        ..color = isUp
            ? color.withValues(alpha: 0.85)
            : color.withValues(alpha: 0.9);
      canvas.drawRect(body, bodyPaint);
    }

    // Highlight the last close — handy for "where is it now"
    final last = candles.last;
    final lastY = yFor(last.close);
    final markerColor = last.close >= last.open ? _up : _down;
    canvas.drawCircle(
      Offset(size.width - slot / 2, lastY),
      4,
      Paint()..color = markerColor.withValues(alpha: 0.25),
    );
    canvas.drawCircle(
      Offset(size.width - slot / 2, lastY),
      2.5,
      Paint()..color = markerColor,
    );
  }

  @override
  bool shouldRepaint(covariant _CandlePainter old) =>
      old.candles != candles;
}

class _PricePainter extends CustomPainter {
  _PricePainter({required this.values});
  final List<double> values;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    var min = values[0];
    var max = values[0];
    for (final v in values) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    final range = max - min == 0 ? 1.0 : max - min;
    final dx = size.width / (values.length - 1);
    const padTop = 16.0;
    const padBottom = 16.0;
    final usable = size.height - padTop - padBottom;

    final isUp = values.last >= values.first;
    final lineColor =
        isUp ? const Color(0xFF22C55E) : const Color(0xFFEF4444);

    // Faint horizontal guides at 0%, 50%, 100% of the visible price band.
    final guidePaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.06)
      ..strokeWidth = 1;
    for (var i = 0; i <= 4; i++) {
      final y = padTop + (i / 4) * usable;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), guidePaint);
    }

    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = size.height - padBottom - ((values[i] - min) / range) * usable;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    // Area fill under the line.
    final fillPath = Path.from(path)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    final fillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          lineColor.withValues(alpha: 0.32),
          lineColor.withValues(alpha: 0.0),
        ],
      ).createShader(Offset.zero & size);
    canvas.drawPath(fillPath, fillPaint);

    // Line.
    final linePaint = Paint()
      ..color = lineColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(path, linePaint);

    // Last-point marker.
    final lastX = (values.length - 1) * dx;
    final lastY =
        size.height - padBottom - ((values.last - min) / range) * usable;
    canvas.drawCircle(
      Offset(lastX, lastY),
      5,
      Paint()..color = lineColor.withValues(alpha: 0.25),
    );
    canvas.drawCircle(
      Offset(lastX, lastY),
      3,
      Paint()..color = lineColor,
    );
  }

  @override
  bool shouldRepaint(covariant _PricePainter old) => old.values != values;
}

class _RangeChips extends StatelessWidget {
  const _RangeChips({required this.selected, required this.onChanged});
  final ChartRange selected;
  final ValueChanged<ChartRange> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final r in ChartRange.values) ...[
            _Chip(
              label: r.label,
              selected: r == selected,
              onTap: () => onChanged(r),
              activeColor: scheme.primary,
              activeFg: scheme.onPrimary,
              inactiveBg:
                  scheme.surfaceContainerHighest.withValues(alpha: 0.4),
              inactiveFg: scheme.onSurface.withValues(alpha: 0.7),
            ),
            const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.activeColor,
    required this.activeFg,
    required this.inactiveBg,
    required this.inactiveFg,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final Color activeColor;
  final Color activeFg;
  final Color inactiveBg;
  final Color inactiveFg;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? activeColor : inactiveBg,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? activeFg : inactiveFg,
            fontWeight: FontWeight.w700,
            fontSize: math.min(13, 13),
          ),
        ),
      ),
    );
  }
}

// ─── Indicator overlay ────────────────────────────────────────────────────

class _IndicatorPainter extends CustomPainter {
  _IndicatorPainter({required this.closes, required this.indicators});
  final List<double> closes;
  final Set<ChartIndicator> indicators;

  static const _smaColor = Color(0xFF06B6D4);
  static const _emaColor = Color(0xFFF59E0B);
  static const _bbColor = Color(0xFF8B5CF6);
  static const _period = 20;

  @override
  void paint(Canvas canvas, Size size) {
    if (closes.length < 2) return;
    var min = closes.first;
    var max = closes.first;
    for (final v in closes) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // If Bollinger is enabled it can widen the range; recompute min/max
    // including the bands so the chart doesn't crop them.
    List<double>? sma;
    List<double>? upper;
    List<double>? lower;
    if (indicators.contains(ChartIndicator.bollinger)) {
      sma = _sma(closes, _period);
      final bb = _bollinger(closes, _period, 2);
      upper = bb.upper;
      lower = bb.lower;
      for (var i = 0; i < closes.length; i++) {
        final u = upper[i];
        final l = lower[i];
        if (!u.isNaN && u > max) max = u;
        if (!l.isNaN && l < min) min = l;
      }
    }
    final range = max - min == 0 ? 1.0 : max - min;
    final dx = closes.length > 1
        ? size.width / (closes.length - 1)
        : size.width;
    const padTop = 16.0;
    const padBottom = 16.0;
    final usable = size.height - padTop - padBottom;

    double yFor(double v) =>
        size.height - padBottom - ((v - min) / range) * usable;

    void plot(List<double> values, Color color, {bool dashed = false}) {
      final paint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round;
      Path? path;
      var lastDrawn = false;
      for (var i = 0; i < values.length; i++) {
        final v = values[i];
        if (v.isNaN) {
          if (path != null && lastDrawn) {
            _strokePath(canvas, path, paint, dashed: dashed);
          }
          path = null;
          lastDrawn = false;
          continue;
        }
        final x = i * dx;
        final y = yFor(v);
        if (path == null) {
          path = Path()..moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
        lastDrawn = true;
      }
      if (path != null && lastDrawn) {
        _strokePath(canvas, path, paint, dashed: dashed);
      }
    }

    if (indicators.contains(ChartIndicator.sma20)) {
      plot(sma ?? _sma(closes, _period), _smaColor);
    }
    if (indicators.contains(ChartIndicator.ema20)) {
      plot(_ema(closes, _period), _emaColor);
    }
    if (indicators.contains(ChartIndicator.bollinger)) {
      if (upper != null) plot(upper, _bbColor, dashed: true);
      if (lower != null) plot(lower, _bbColor, dashed: true);
    }
  }

  void _strokePath(
    Canvas canvas,
    Path path,
    Paint paint, {
    required bool dashed,
  }) {
    if (!dashed) {
      canvas.drawPath(path, paint);
      return;
    }
    // Cheap dashed renderer: walk PathMetrics and stroke 4-px on / 4-px off.
    for (final metric in path.computeMetrics()) {
      double distance = 0;
      final length = metric.length;
      while (distance < length) {
        final next = (distance + 4).clamp(0, length).toDouble();
        canvas.drawPath(
          metric.extractPath(distance, next),
          paint,
        );
        distance = next + 4;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _IndicatorPainter old) =>
      old.closes != closes ||
      old.indicators.length != indicators.length ||
      !old.indicators.containsAll(indicators);
}

/// Simple moving average over [period] samples. Returns a series the same
/// length as [values] with NaN for the warm-up window.
List<double> _sma(List<double> values, int period) {
  final out = List<double>.filled(values.length, double.nan);
  if (values.length < period) return out;
  double sum = 0;
  for (var i = 0; i < period; i++) {
    sum += values[i];
  }
  out[period - 1] = sum / period;
  for (var i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    out[i] = sum / period;
  }
  return out;
}

/// Exponential moving average with the standard α = 2 / (period + 1).
/// The seed for the first usable index is the SMA over the first window,
/// which is the convention used by TradingView/Investopedia.
List<double> _ema(List<double> values, int period) {
  final out = List<double>.filled(values.length, double.nan);
  if (values.length < period) return out;
  final k = 2.0 / (period + 1);
  double seed = 0;
  for (var i = 0; i < period; i++) {
    seed += values[i];
  }
  seed /= period;
  out[period - 1] = seed;
  var prev = seed;
  for (var i = period; i < values.length; i++) {
    prev = (values[i] - prev) * k + prev;
    out[i] = prev;
  }
  return out;
}

class _BollingerBands {
  final List<double> upper;
  final List<double> lower;
  _BollingerBands(this.upper, this.lower);
}

/// Bollinger bands: middle = SMA(period), upper = mid + k·σ, lower = mid − k·σ
/// where σ is the population stdev of the same window.
_BollingerBands _bollinger(List<double> values, int period, double k) {
  final upper = List<double>.filled(values.length, double.nan);
  final lower = List<double>.filled(values.length, double.nan);
  if (values.length < period) return _BollingerBands(upper, lower);
  for (var i = period - 1; i < values.length; i++) {
    double sum = 0;
    for (var j = i - period + 1; j <= i; j++) {
      sum += values[j];
    }
    final mean = sum / period;
    double sq = 0;
    for (var j = i - period + 1; j <= i; j++) {
      final d = values[j] - mean;
      sq += d * d;
    }
    final std = math.sqrt(sq / period);
    upper[i] = mean + k * std;
    lower[i] = mean - k * std;
  }
  return _BollingerBands(upper, lower);
}

/// Wrap-style chip row for indicator toggles. Tap toggles membership in
/// the parent's enabled-indicators set.
class _IndicatorChips extends StatelessWidget {
  const _IndicatorChips({required this.selected, required this.onToggle});
  final Set<ChartIndicator> selected;
  final ValueChanged<ChartIndicator> onToggle;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _chip(context, ChartIndicator.sma20, 'SMA 20',
              _IndicatorPainter._smaColor),
          const SizedBox(width: 6),
          _chip(context, ChartIndicator.ema20, 'EMA 20',
              _IndicatorPainter._emaColor),
          const SizedBox(width: 6),
          _chip(context, ChartIndicator.bollinger, 'Bollinger',
              _IndicatorPainter._bbColor),
        ],
      ),
    );
  }

  Widget _chip(
    BuildContext context,
    ChartIndicator i,
    String label,
    Color tint,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final active = selected.contains(i);
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => onToggle(i),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: active
              ? tint.withValues(alpha: 0.18)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? tint.withValues(alpha: 0.5)
                : scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 14,
              height: 2.5,
              decoration: BoxDecoration(
                color: tint,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: active
                    ? tint
                    : scheme.onSurface.withValues(alpha: 0.7),
                fontWeight: FontWeight.w700,
                fontSize: 11.5,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// "+ Compare" affordance below the chart. Renders an outlined add-button
/// when no compare symbol is set, and a removable chip when one is.
class _CompareControl extends StatelessWidget {
  const _CompareControl({
    required this.active,
    required this.onAdd,
    required this.onRemove,
  });

  final StockSearchResult? active;
  final VoidCallback onAdd;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (active == null) {
      return InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onAdd,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: scheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.add,
                size: 14,
                color: scheme.onSurface.withValues(alpha: 0.65),
              ),
              const SizedBox(width: 3),
              Text(
                'Compare',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w700,
                  fontSize: 11.5,
                ),
              ),
            ],
          ),
        ),
      );
    }
    const tint = Color(0xFF6366F1);
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 5, 4, 5),
      decoration: BoxDecoration(
        color: tint.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tint.withValues(alpha: 0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'vs ${active!.symbol}',
            style: const TextStyle(
              color: tint,
              fontWeight: FontWeight.w800,
              fontSize: 11.5,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 14, color: tint),
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(
              minWidth: 22,
              minHeight: 22,
            ),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}

/// Compact search sheet that pops with a [StockSearchResult] the chart can
/// fetch candles for. We don't reuse StockSearchScreen because that flow
/// either adds to a watchlist or pushes a detail route — both wrong endings
/// when picking a comparison symbol.
class _CompareSearchSheet extends ConsumerStatefulWidget {
  const _CompareSearchSheet();

  @override
  ConsumerState<_CompareSearchSheet> createState() =>
      _CompareSearchSheetState();
}

class _CompareSearchSheetState extends ConsumerState<_CompareSearchSheet> {
  final _controller = TextEditingController();
  Future<List<StockSearchResult>>? _resultsFuture;

  void _runSearch() {
    final q = _controller.text.trim();
    setState(() {
      _resultsFuture = q.isEmpty
          ? null
          : ref
              .read(marketRepositoryProvider)
              .search(q, exchange: 'NSE');
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final viewInsets = MediaQuery.viewInsetsOf(context);
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets.bottom),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Compare with…',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _controller,
                autofocus: true,
                onChanged: (_) => _runSearch(),
                decoration: const InputDecoration(
                  hintText: 'Search NSE stocks',
                  prefixIcon: Icon(Icons.search),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 280,
                child: _resultsFuture == null
                    ? Center(
                        child: Text(
                          'Type a symbol or company name',
                          style: TextStyle(
                            color: Theme.of(context)
                                .colorScheme
                                .onSurface
                                .withValues(alpha: 0.55),
                          ),
                        ),
                      )
                    : FutureBuilder<List<StockSearchResult>>(
                        future: _resultsFuture,
                        builder: (context, snap) {
                          if (snap.connectionState ==
                              ConnectionState.waiting) {
                            return const Center(
                              child: CircularProgressIndicator(),
                            );
                          }
                          if (snap.hasError) {
                            return Center(child: Text('${snap.error}'));
                          }
                          final list = snap.data ?? const [];
                          if (list.isEmpty) {
                            return const Center(child: Text('No matches'));
                          }
                          return ListView.separated(
                            itemCount: list.length,
                            separatorBuilder: (_, _) =>
                                const Divider(height: 1),
                            itemBuilder: (_, i) {
                              final r = list[i];
                              return ListTile(
                                title: Text(
                                  r.symbol,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                subtitle: Text(
                                  '${r.exchange} • ${r.tradingsymbol}',
                                ),
                                onTap: () => Navigator.of(context).pop(r),
                              );
                            },
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

