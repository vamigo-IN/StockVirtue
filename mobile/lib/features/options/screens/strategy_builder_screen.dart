import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/option_chain.dart';
import '../../../data/models/order.dart';
import '../../market/market_repository.dart';
import '../../notifications/notifications_provider.dart';
import '../../orders/orders_providers.dart';
import '../../orders/orders_repository.dart';
import '../../portfolio/portfolio_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Pre-defined multi-leg strategy. Strike offsets are integers measured in
/// "strike steps" from the ATM strike (positive = OTM call side, negative =
/// OTM put side). We resolve to actual strikes once the chain loads.
enum OptionStrategy {
  longCall,
  longPut,
  longStraddle,
  longStrangle,
  bullCallSpread,
  bearPutSpread,
  ironCondor,
}

extension on OptionStrategy {
  String get label => switch (this) {
        OptionStrategy.longCall => 'Long Call',
        OptionStrategy.longPut => 'Long Put',
        OptionStrategy.longStraddle => 'Long Straddle',
        OptionStrategy.longStrangle => 'Long Strangle',
        OptionStrategy.bullCallSpread => 'Bull Call Spread',
        OptionStrategy.bearPutSpread => 'Bear Put Spread',
        OptionStrategy.ironCondor => 'Iron Condor',
      };

  String get blurb => switch (this) {
        OptionStrategy.longCall =>
          'Bullish — unlimited upside, premium-only downside.',
        OptionStrategy.longPut =>
          'Bearish — gains as spot drops, capped at premium.',
        OptionStrategy.longStraddle =>
          'High-volatility bet — profits when spot moves either way.',
        OptionStrategy.longStrangle =>
          'Cheaper volatility bet — wider OTM legs, smaller premium.',
        OptionStrategy.bullCallSpread =>
          'Cheaper bullish view — long ATM call, short OTM call.',
        OptionStrategy.bearPutSpread =>
          'Cheaper bearish view — long ATM put, short OTM put.',
        OptionStrategy.ironCondor =>
          'Range-bound income — sell ATM straddle, buy OTM wings.',
      };

  /// Recipe of legs as offsets from ATM. ce/pe = which side; offset is in
  /// strike steps; qty > 0 = buy, qty < 0 = sell. Lot size multiplied later.
  List<_LegRecipe> recipe() => switch (this) {
        OptionStrategy.longCall => const [
            _LegRecipe(right: _Right.ce, offset: 0, lots: 1),
          ],
        OptionStrategy.longPut => const [
            _LegRecipe(right: _Right.pe, offset: 0, lots: 1),
          ],
        OptionStrategy.longStraddle => const [
            _LegRecipe(right: _Right.ce, offset: 0, lots: 1),
            _LegRecipe(right: _Right.pe, offset: 0, lots: 1),
          ],
        OptionStrategy.longStrangle => const [
            _LegRecipe(right: _Right.ce, offset: 2, lots: 1),
            _LegRecipe(right: _Right.pe, offset: -2, lots: 1),
          ],
        OptionStrategy.bullCallSpread => const [
            _LegRecipe(right: _Right.ce, offset: 0, lots: 1),
            _LegRecipe(right: _Right.ce, offset: 3, lots: -1),
          ],
        OptionStrategy.bearPutSpread => const [
            _LegRecipe(right: _Right.pe, offset: 0, lots: 1),
            _LegRecipe(right: _Right.pe, offset: -3, lots: -1),
          ],
        OptionStrategy.ironCondor => const [
            _LegRecipe(right: _Right.pe, offset: -2, lots: -1),
            _LegRecipe(right: _Right.pe, offset: -5, lots: 1),
            _LegRecipe(right: _Right.ce, offset: 2, lots: -1),
            _LegRecipe(right: _Right.ce, offset: 5, lots: 1),
          ],
      };
}

enum _Right { ce, pe }

class _LegRecipe {
  final _Right right;
  final int offset;
  final int lots;
  const _LegRecipe({
    required this.right,
    required this.offset,
    required this.lots,
  });
}

class StrategyBuilderScreen extends ConsumerStatefulWidget {
  const StrategyBuilderScreen({super.key, required this.underlying});
  final String underlying;

  @override
  ConsumerState<StrategyBuilderScreen> createState() =>
      _StrategyBuilderScreenState();
}

class _StrategyBuilderScreenState
    extends ConsumerState<StrategyBuilderScreen> {
  OptionStrategy _strategy = OptionStrategy.longCall;
  String? _expiry;
  Future<List<String>>? _expiriesFuture;
  Future<OptionChain>? _chainFuture;
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _expiriesFuture = ref
        .read(marketRepositoryProvider)
        .getExpiries(widget.underlying)
        .then((list) {
      if (mounted && list.isNotEmpty) {
        setState(() {
          _expiry = list.first;
          _loadChain(list.first);
        });
      }
      return list;
    });
  }

  void _loadChain(String expiry) {
    _chainFuture = ref
        .read(marketRepositoryProvider)
        .getOptionChain(widget.underlying, expiry);
  }

  Future<void> _submit(_ResolvedStrategy resolved) async {
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    try {
      final result = await ref
          .read(ordersRepositoryProvider)
          .placeBasket(resolved.basketLegs);
      ref.invalidate(portfolioProvider);
      ref.invalidate(ordersListProvider);
      final notifier = ref.read(notificationsProvider.notifier);
      if (result.failed == 0) {
        notifier.push(
          kind: AppNotificationKind.orderPlaced,
          title:
              '${_strategy.label} placed — ${result.filled} legs on ${widget.underlying}',
          body: '$_strategy submitted as a basket.',
        );
      } else {
        notifier.push(
          kind: AppNotificationKind.orderRejected,
          title:
              'Strategy partial — ${result.filled} ok, ${result.failed} failed',
          body: result.legs
              .where((l) => !l.ok)
              .map((l) => l.error)
              .whereType<String>()
              .take(2)
              .join(' · '),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
    } on DioException catch (e) {
      final body = e.response?.data;
      String msg = e.message ?? 'Submit failed';
      if (body is Map && body['message'] is String) {
        msg = body['message'] as String;
      }
      setState(() => _submitError = msg);
    } catch (e) {
      setState(() => _submitError = '$e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '${widget.underlying} strategy',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: FutureBuilder<List<String>>(
        future: _expiriesFuture,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('${snap.error}'));
          }
          final expiries = snap.data ?? const [];
          if (expiries.isEmpty) {
            return const Center(child: Text('No F&O expiries found'));
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 120),
            children: [
              _StrategyPicker(
                selected: _strategy,
                onChanged: (s) => setState(() => _strategy = s),
              ),
              const SizedBox(height: 14),
              _StrategyBlurb(strategy: _strategy),
              const SizedBox(height: 14),
              _ExpiryDropdown(
                expiries: expiries,
                selected: _expiry,
                onChanged: (e) {
                  setState(() {
                    _expiry = e;
                    _loadChain(e);
                  });
                },
              ),
              const SizedBox(height: 14),
              FutureBuilder<OptionChain>(
                future: _chainFuture,
                builder: (context, csnap) {
                  if (csnap.connectionState == ConnectionState.waiting) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 32),
                      child: Center(child: CircularProgressIndicator()),
                    );
                  }
                  if (csnap.hasError) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text('${csnap.error}'),
                    );
                  }
                  final chain = csnap.data;
                  if (chain == null || chain.strikes.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Text('No strikes available for this expiry.'),
                    );
                  }
                  final resolved = _resolve(_strategy, chain);
                  if (resolved == null) {
                    return Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(
                        chain.spot == null
                            ? 'Spot price unavailable — strategy needs ATM.'
                            : 'Some strikes are missing on this expiry; '
                                'try a closer expiry.',
                        style: TextStyle(
                          color: Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.6),
                        ),
                      ),
                    );
                  }
                  return Column(
                    children: [
                      _LegsList(resolved: resolved),
                      const SizedBox(height: 16),
                      _PayoffCard(resolved: resolved, spot: chain.spot!),
                      if (_submitError != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            _submitError!,
                            style: const TextStyle(
                              color: Colors.redAccent,
                              fontSize: 12.5,
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 16),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _submitting ? null : () => _submit(resolved),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size.fromHeight(52),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: _submitting
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : Text(
                                  'Submit ${_strategy.label} '
                                  '(${resolved.legs.length} legs)',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 15,
                                  ),
                                ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ],
          );
        },
      ),
    );
  }

  /// Walks the recipe, picks actual strikes by snapping spot to the closest
  /// available strike and offsetting in strike-step units. Returns null when
  /// the spot is missing or any required strike isn't in the chain.
  _ResolvedStrategy? _resolve(OptionStrategy strategy, OptionChain chain) {
    final spot = chain.spot;
    if (spot == null) return null;
    final atmStrike = chain.atmStrike;
    if (atmStrike == null) return null;
    final strikes = chain.strikes.map((r) => r.strike).toList()..sort();
    final atmIndex = strikes.indexOf(atmStrike);
    if (atmIndex < 0) return null;
    final legs = <_ResolvedLeg>[];
    for (final r in strategy.recipe()) {
      final idx = atmIndex + r.offset;
      if (idx < 0 || idx >= strikes.length) return null;
      final strike = strikes[idx];
      final row = chain.strikes.firstWhere((x) => x.strike == strike);
      final leg = r.right == _Right.ce ? row.call : row.put;
      if (leg == null || leg.ltp == null) return null;
      legs.add(_ResolvedLeg(
        right: r.right,
        strike: strike,
        leg: leg,
        side: r.lots >= 0 ? OrderSide.buy : OrderSide.sell,
        lots: r.lots.abs(),
      ));
    }
    return _ResolvedStrategy(legs: legs);
  }
}

class _ResolvedLeg {
  final _Right right;
  final double strike;
  final OptionLeg leg;
  final OrderSide side;
  final int lots;
  const _ResolvedLeg({
    required this.right,
    required this.strike,
    required this.leg,
    required this.side,
    required this.lots,
  });
  int get quantity => lots * leg.lotSize;
  double get premium => (leg.ltp ?? 0) * quantity;
}

class _ResolvedStrategy {
  final List<_ResolvedLeg> legs;
  const _ResolvedStrategy({required this.legs});

  /// Net cost: positive = debit (premium paid), negative = credit received.
  double get netDebit => legs.fold(
        0,
        (s, l) => s + (l.side == OrderSide.buy ? l.premium : -l.premium),
      );

  List<BasketLeg> get basketLegs => [
        for (final l in legs)
          BasketLeg(
            symbol: l.leg.tradingsymbol,
            exchange: l.leg.exchange,
            side: l.side,
            quantity: l.quantity,
          ),
      ];
}

class _StrategyPicker extends StatelessWidget {
  const _StrategyPicker({required this.selected, required this.onChanged});
  final OptionStrategy selected;
  final ValueChanged<OptionStrategy> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<OptionStrategy>(
          isExpanded: true,
          value: selected,
          items: [
            for (final s in OptionStrategy.values)
              DropdownMenuItem(
                value: s,
                child: Text(
                  s.label,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

class _StrategyBlurb extends StatelessWidget {
  const _StrategyBlurb({required this.strategy});
  final OptionStrategy strategy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        strategy.blurb,
        style: TextStyle(
          fontSize: 12.5,
          color: scheme.onSurface.withValues(alpha: 0.7),
          height: 1.4,
        ),
      ),
    );
  }
}

class _ExpiryDropdown extends StatelessWidget {
  const _ExpiryDropdown({
    required this.expiries,
    required this.selected,
    required this.onChanged,
  });
  final List<String> expiries;
  final String? selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 4, 12, 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          isExpanded: true,
          value: selected,
          items: [
            for (final e in expiries)
              DropdownMenuItem(
                value: e,
                child: Text(
                  'Expiry · $e',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
              ),
          ],
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
        ),
      ),
    );
  }
}

class _LegsList extends StatelessWidget {
  const _LegsList({required this.resolved});
  final _ResolvedStrategy resolved;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
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
              const Icon(Icons.layers_outlined, size: 16),
              const SizedBox(width: 6),
              const Text(
                'Legs',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              _NetCostChip(net: resolved.netDebit),
            ],
          ),
          const SizedBox(height: 10),
          for (final l in resolved.legs)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: (l.side == OrderSide.buy ? _upColor : _downColor)
                          .withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      l.side == OrderSide.buy ? 'BUY' : 'SELL',
                      style: TextStyle(
                        color:
                            l.side == OrderSide.buy ? _upColor : _downColor,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: (l.right == _Right.ce ? _upColor : _downColor)
                          .withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      l.right == _Right.ce ? 'CE' : 'PE',
                      style: TextStyle(
                        color: l.right == _Right.ce ? _upColor : _downColor,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${l.lots} × ${l.leg.lotSize} @ ${l.strike.toStringAsFixed(
                        l.strike % 1 == 0 ? 0 : 2,
                      )}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                  ),
                  Text(
                    formatInr(l.premium),
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurface.withValues(alpha: 0.65),
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

class _NetCostChip extends StatelessWidget {
  const _NetCostChip({required this.net});
  final double net;

  @override
  Widget build(BuildContext context) {
    final isDebit = net >= 0;
    final color = isDebit ? _downColor : _upColor;
    final label = isDebit
        ? 'Net debit ${formatInr(net)}'
        : 'Net credit ${formatInr(-net)}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 11,
        ),
      ),
    );
  }
}

class _PayoffCard extends StatelessWidget {
  const _PayoffCard({required this.resolved, required this.spot});
  final _ResolvedStrategy resolved;
  final double spot;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Walk spot from 0.7× to 1.3× current — covers ±30%, which fits all
    // standard equity & index option ranges before contracts go untradable.
    const samples = 121;
    final loS = spot * 0.7;
    final hiS = spot * 1.3;
    final ys = <double>[];
    for (var i = 0; i < samples; i++) {
      final s = loS + ((hiS - loS) * i) / (samples - 1);
      ys.add(_payoffAt(s));
    }
    final atSpot = _payoffAt(spot);
    final maxProfit = ys.reduce(math.max);
    final maxLoss = ys.reduce(math.min);
    final breakevens = _findBreakevens(loS, hiS, samples, ys);
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
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
            children: const [
              Icon(Icons.auto_graph, size: 16),
              SizedBox(width: 6),
              Text(
                'Payoff at expiry',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 160,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: CustomPaint(
                painter: _PayoffPainter(
                  values: ys,
                  loS: loS,
                  hiS: hiS,
                  spot: spot,
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _Metric(
                  label: 'Max profit',
                  value: maxProfit > 1e8
                      ? '∞'
                      : '${maxProfit >= 0 ? '+' : ''}${formatInr(maxProfit)}',
                  color: _upColor,
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'Max loss',
                  value: maxLoss < -1e8
                      ? '−∞'
                      : '${maxLoss >= 0 ? '+' : ''}${formatInr(maxLoss)}',
                  color: _downColor,
                ),
              ),
              Expanded(
                child: _Metric(
                  label: 'At spot',
                  value:
                      '${atSpot >= 0 ? '+' : ''}${formatInr(atSpot)}',
                  color: atSpot >= 0 ? _upColor : _downColor,
                ),
              ),
            ],
          ),
          if (breakevens.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              'Breakeven${breakevens.length > 1 ? 's' : ''}: '
              '${breakevens.map((b) => b.toStringAsFixed(2)).join(' · ')}',
              style: TextStyle(
                fontSize: 11.5,
                color: scheme.onSurface.withValues(alpha: 0.65),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  double _payoffAt(double s) {
    double sum = 0;
    for (final l in resolved.legs) {
      final intrinsic = l.right == _Right.ce
          ? math.max(s - l.strike, 0.0)
          : math.max(l.strike - s, 0.0);
      final premium = (l.leg.ltp ?? 0);
      final sign = l.side == OrderSide.buy ? 1 : -1;
      sum += sign * (intrinsic - premium) * l.quantity;
    }
    return sum;
  }

  static List<double> _findBreakevens(
    double loS,
    double hiS,
    int samples,
    List<double> ys,
  ) {
    final out = <double>[];
    for (var i = 1; i < ys.length; i++) {
      if ((ys[i - 1] <= 0 && ys[i] > 0) ||
          (ys[i - 1] >= 0 && ys[i] < 0)) {
        // Linear interpolation between samples for a ~tick-precision breakeven.
        final t = ys[i - 1].abs() / (ys[i - 1].abs() + ys[i].abs());
        final sStep = (hiS - loS) / (samples - 1);
        final s = loS + (i - 1) * sStep + t * sStep;
        out.add(s);
      }
    }
    return out;
  }
}

class _Metric extends StatelessWidget {
  const _Metric({
    required this.label,
    required this.value,
    required this.color,
  });
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10.5,
            color: scheme.onSurface.withValues(alpha: 0.55),
            fontWeight: FontWeight.w700,
            letterSpacing: 0.3,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _PayoffPainter extends CustomPainter {
  _PayoffPainter({
    required this.values,
    required this.loS,
    required this.hiS,
    required this.spot,
  });
  final List<double> values;
  final double loS;
  final double hiS;
  final double spot;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    var minY = values.first;
    var maxY = values.first;
    for (final v in values) {
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    }
    // Keep zero visible so the breakeven line is meaningful.
    if (minY > 0) minY = 0;
    if (maxY < 0) maxY = 0;
    final range = (maxY - minY).abs() < 1e-9 ? 1.0 : (maxY - minY);
    const padTop = 10.0;
    const padBottom = 10.0;
    final usable = size.height - padTop - padBottom;
    final dx = size.width / (values.length - 1);
    double yFor(double v) =>
        size.height - padBottom - ((v - minY) / range) * usable;
    final zeroY = yFor(0);

    // Zero line.
    canvas.drawLine(
      Offset(0, zeroY),
      Offset(size.width, zeroY),
      Paint()
        ..color = Colors.white.withValues(alpha: 0.16)
        ..strokeWidth = 1,
    );

    // Fills above/below zero.
    final upPath = Path()..moveTo(0, zeroY);
    final downPath = Path()..moveTo(0, zeroY);
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = yFor(values[i]);
      if (values[i] >= 0) {
        upPath.lineTo(x, y);
      } else {
        upPath.lineTo(x, zeroY);
      }
      if (values[i] <= 0) {
        downPath.lineTo(x, y);
      } else {
        downPath.lineTo(x, zeroY);
      }
    }
    upPath
      ..lineTo(size.width, zeroY)
      ..close();
    downPath
      ..lineTo(size.width, zeroY)
      ..close();
    canvas.drawPath(
      upPath,
      Paint()..color = _upColor.withValues(alpha: 0.18),
    );
    canvas.drawPath(
      downPath,
      Paint()..color = _downColor.withValues(alpha: 0.18),
    );

    // Payoff curve.
    final linePath = Path()..moveTo(0, yFor(values.first));
    for (var i = 1; i < values.length; i++) {
      linePath.lineTo(i * dx, yFor(values[i]));
    }
    canvas.drawPath(
      linePath,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.85)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );

    // Current-spot vertical line.
    final spotX = ((spot - loS) / (hiS - loS)) * size.width;
    if (spotX >= 0 && spotX <= size.width) {
      final paint = Paint()
        ..color = Colors.amberAccent
        ..strokeWidth = 1;
      // Dashed.
      var d = 0.0;
      const dash = 4.0;
      while (d < size.height) {
        final next = math.min(d + dash, size.height);
        canvas.drawLine(Offset(spotX, d), Offset(spotX, next), paint);
        d = next + dash;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _PayoffPainter old) =>
      old.values != values || old.spot != spot;
}
