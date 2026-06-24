import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../data/models/tick.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../home_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Compact daily-summary card on the home tab. Aggregates "where the
/// market is today" into one bite-sized widget:
///   * NIFTY 50's day move (from [homeIndicesProvider])
///   * Top equity gainer & loser across the curated large/mid/small caps
///     (from [_summaryMoversProvider])
class DailySummaryCard extends ConsumerWidget {
  const DailySummaryCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final niftyAsync = ref.watch(homeIndicesProvider);
    final gainerAsync = ref.watch(_summaryMoversProvider('gainers'));
    final loserAsync = ref.watch(_summaryMoversProvider('losers'));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              scheme.primaryContainer.withValues(alpha: 0.4),
              scheme.tertiaryContainer.withValues(alpha: 0.3),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
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
                  width: 30,
                  height: 30,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(
                    Icons.summarize_outlined,
                    color: scheme.primary,
                    size: 16,
                  ),
                ),
                const SizedBox(width: 10),
                const Text(
                  "Today's market",
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    letterSpacing: -0.2,
                  ),
                ),
                const Spacer(),
                _NiftyChip(async: niftyAsync),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.2),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _MoverColumn(
                    title: 'Top gainer',
                    async: gainerAsync,
                    isUp: true,
                  ),
                ),
                Container(
                  width: 1,
                  height: 42,
                  color: scheme.outlineVariant.withValues(alpha: 0.2),
                ),
                Expanded(
                  child: _MoverColumn(
                    title: 'Top loser',
                    async: loserAsync,
                    isUp: false,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _NiftyChip extends ConsumerWidget {
  const _NiftyChip({required this.async});
  final AsyncValue<List<FeedQuote>> async;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final indices = async.value ?? const [];
    // Find NIFTY 50 — first index in our home strip.
    FeedQuote? nifty;
    for (final q in indices) {
      if (q.symbol.toUpperCase() == 'NIFTY') {
        nifty = q;
        break;
      }
    }
    if (nifty == null) {
      return Text(
        'NIFTY · —',
        style: TextStyle(
          fontSize: 11.5,
          color: scheme.onSurface.withValues(alpha: 0.55),
          fontWeight: FontWeight.w600,
        ),
      );
    }
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[nifty!.key]),
    );
    final ltp = tick?.ltp ?? nifty.ltp;
    final close = nifty.close;
    double? pct;
    if (ltp != null && close != null && close > 0) {
      pct = ((ltp - close) / close) * 100;
    }
    final isUp = (pct ?? 0) >= 0;
    final color = isUp ? _upColor : _downColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            isUp ? Icons.trending_up : Icons.trending_down,
            color: color,
            size: 13,
          ),
          const SizedBox(width: 5),
          Text(
            'NIFTY ${pct != null ? '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%' : '—'}',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _MoverColumn extends StatelessWidget {
  const _MoverColumn({
    required this.title,
    required this.async,
    required this.isUp,
  });
  final String title;
  final AsyncValue<List<MoverQuote>> async;
  final bool isUp;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = isUp ? _upColor : _downColor;
    final mover = async.value?.firstOrNull;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isUp ? Icons.arrow_upward : Icons.arrow_downward,
                size: 12,
                color: color,
              ),
              const SizedBox(width: 4),
              Text(
                title,
                style: TextStyle(
                  fontSize: 10.5,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          if (mover == null)
            Text(
              '—',
              style: TextStyle(
                fontSize: 13,
                color: scheme.onSurface.withValues(alpha: 0.5),
                fontWeight: FontWeight.w700,
              ),
            )
          else
            GestureDetector(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SymbolDetailScreen(
                    symbol: mover.symbol,
                    tradingsymbol: mover.tradingsymbol,
                    symboltoken: mover.symboltoken,
                    exchange: mover.exchange,
                  ),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    companyNameFor(mover.symbol),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    mover.dayPct != null
                        ? '${isUp ? '+' : ''}${mover.dayPct!.toStringAsFixed(2)}%'
                        : '—',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
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

/// Pulls one mover (gainer or loser) from the largecap segment for the
/// daily-summary card. Reuses the existing /market/movers endpoint so
/// the card is consistent with what shows in the Top Movers section.
final _summaryMoversProvider =
    FutureProvider.autoDispose.family<List<MoverQuote>, String>(
  (ref, type) => ref.watch(marketRepositoryProvider).getMovers(
        segment: 'largecap',
        type: type,
      ),
);
