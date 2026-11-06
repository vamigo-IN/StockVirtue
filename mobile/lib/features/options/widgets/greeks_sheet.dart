import 'package:flutter/material.dart';

import '../../../core/black_scholes.dart';
import '../../../data/models/option_chain.dart';
import '../../market/market_repository.dart';

const double _riskFreeRate = 0.065; // RBI repo as the default
const double _dividendYield = 0.0; // Indices have ~0; stocks closer to 0.015

/// Bottom sheet showing greeks for a single option leg. Prefers SmartAPI's
/// official option-greeks ([official]) — accurate delta/gamma/theta/vega + IV
/// straight from the exchange feed — and falls back to a local Black-Scholes
/// estimate (solving IV from the LTP) when the live greeks aren't available.
Future<void> showGreeksSheet(
  BuildContext context, {
  required OptionLeg leg,
  required double strike,
  required double spot,
  required String expiry,
  required OptionRight right,
  OptionGreekRow? official,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (_) => _GreeksSheet(
      leg: leg,
      strike: strike,
      spot: spot,
      expiry: expiry,
      right: right,
      official: official,
    ),
  );
}

class _GreeksSheet extends StatelessWidget {
  const _GreeksSheet({
    required this.leg,
    required this.strike,
    required this.spot,
    required this.expiry,
    required this.right,
    this.official,
  });

  final OptionLeg leg;
  final double strike;
  final double spot;
  final String expiry;
  final OptionRight right;
  /// Live greeks from SmartAPI; when present they override the BSM estimate.
  final OptionGreekRow? official;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final daysToExpiry = _daysToExpiry(expiry);
    final T = daysToExpiry > 0 ? daysToExpiry / 365.0 : 0.0;
    final ltp = leg.ltp;
    final bsm = ltp != null && ltp > 0 && T > 0
        ? BlackScholes.greeks(
            right: right,
            S: spot,
            K: strike,
            T: T,
            r: _riskFreeRate,
            q: _dividendYield,
            marketPrice: ltp,
          )
        : null;
    // Prefer SmartAPI's live greeks; fall back to the local BSM estimate.
    final hasOfficial = official != null && official!.iv > 0;
    final ivPct = hasOfficial
        ? official!.iv
        : (bsm?.iv != null && !bsm!.iv.isNaN ? bsm.iv * 100 : null);
    final showGreeks = hasOfficial || bsm != null;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: (right == OptionRight.call
                            ? const Color(0xFF22C55E)
                            : const Color(0xFFEF4444))
                        .withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    right == OptionRight.call ? 'CALL' : 'PUT',
                    style: TextStyle(
                      color: right == OptionRight.call
                          ? const Color(0xFF22C55E)
                          : const Color(0xFFEF4444),
                      fontWeight: FontWeight.w800,
                      fontSize: 10,
                      letterSpacing: 0.5,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${strike.toStringAsFixed(strike % 1 == 0 ? 0 : 2)} '
                  '· $expiry',
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                Text(
                  'Spot ${spot.toStringAsFixed(2)}',
                  style: TextStyle(
                    fontSize: 11.5,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              leg.tradingsymbol,
              style: TextStyle(
                fontSize: 11.5,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 16),
            if (!showGreeks)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Center(
                  child: Text(
                    ltp == null
                        ? 'No live price yet — greeks need an LTP.'
                        : daysToExpiry <= 0
                            ? 'Contract expires today or already expired.'
                            : 'Could not solve for IV at this strike.',
                    style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ),
              )
            else ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: scheme.primaryContainer.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Implied volatility',
                            style: TextStyle(
                              fontSize: 11,
                              color:
                                  scheme.onSurface.withValues(alpha: 0.65),
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            ivPct != null
                                ? '${ivPct.toStringAsFixed(1)}%'
                                : '—',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Time to expiry',
                          style: TextStyle(
                            fontSize: 11,
                            color:
                                scheme.onSurface.withValues(alpha: 0.65),
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.3,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$daysToExpiry days',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _GreekRow(
                symbol: 'Δ',
                name: 'Delta',
                value: (hasOfficial ? official!.delta : bsm!.delta)
                    .toStringAsFixed(3),
                hint: '₹ change per ₹1 of spot',
              ),
              _GreekRow(
                symbol: 'Γ',
                name: 'Gamma',
                value: (hasOfficial ? official!.gamma : bsm!.gamma)
                    .toStringAsFixed(4),
                hint: 'Δ change per ₹1 of spot',
              ),
              _GreekRow(
                symbol: 'Θ',
                name: 'Theta',
                value: () {
                  final t = hasOfficial ? official!.theta : bsm!.theta;
                  return '${t >= 0 ? '+' : ''}${t.toStringAsFixed(2)} / day';
                }(),
                hint: 'time decay per calendar day',
              ),
              _GreekRow(
                symbol: 'V',
                name: 'Vega',
                value: (hasOfficial ? official!.vega : bsm!.vega)
                    .toStringAsFixed(2),
                hint: '₹ change per 1% IV move',
                // Rho isn't in the live feed — only show it for the BSM model.
                last: bsm == null,
              ),
              if (bsm != null)
                _GreekRow(
                  symbol: 'ρ',
                  name: 'Rho',
                  value: bsm.rho.toStringAsFixed(3),
                  hint: '₹ change per 1% rate move',
                  last: true,
                ),
              const SizedBox(height: 14),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.info_outline,
                      size: 14,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        hasOfficial
                            ? 'Live greeks and IV from our market data feed'
                              '${bsm != null ? '; Rho from Black-Scholes' : ''}.'
                            : 'Black-Scholes-Merton. r = 6.5%, q = 0. Stock '
                                'options are American so these are '
                                'approximations.',
                        style: TextStyle(
                          fontSize: 10.5,
                          color: scheme.onSurface.withValues(alpha: 0.6),
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  static const _months = {
    'JAN': 1, 'FEB': 2, 'MAR': 3, 'APR': 4, 'MAY': 5, 'JUN': 6,
    'JUL': 7, 'AUG': 8, 'SEP': 9, 'OCT': 10, 'NOV': 11, 'DEC': 12,
  };

  static int _daysToExpiry(String expiry) {
    final m = RegExp(r'^(\d{1,2})([A-Z]{3})(\d{4})$').firstMatch(expiry);
    if (m == null) return 0;
    final d = int.parse(m.group(1)!);
    final mon = _months[m.group(2)] ?? 0;
    final y = int.parse(m.group(3)!);
    if (mon == 0) return 0;
    final exp = DateTime(y, mon, d);
    final today = DateTime.now();
    return exp
        .difference(DateTime(today.year, today.month, today.day))
        .inDays;
  }
}

class _GreekRow extends StatelessWidget {
  const _GreekRow({
    required this.symbol,
    required this.name,
    required this.value,
    required this.hint,
    this.last = false,
  });

  final String symbol;
  final String name;
  final String value;
  final String hint;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 26,
                child: Text(
                  symbol,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: scheme.primary,
                  ),
                ),
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 13.5,
                      ),
                    ),
                    Text(
                      hint,
                      style: TextStyle(
                        fontSize: 11,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                value,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            ],
          ),
          if (!last) ...[
            const SizedBox(height: 8),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.18),
            ),
          ],
        ],
      ),
    );
  }
}
