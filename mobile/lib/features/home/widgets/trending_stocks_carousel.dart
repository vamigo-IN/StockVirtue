import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/price_flash.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../home_providers.dart';

class TrendingStocksCarousel extends ConsumerWidget {
  const TrendingStocksCarousel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(homeTrendingProvider);
    return SizedBox(
      height: 140,
      child: trending.when(
        loading: () => const _SkeletonCarousel(),
        error: (_, _) => const _ErrorState(),
        data: (quotes) => ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: quotes.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => _StockCard(quote: quotes[i]),
        ),
      ),
    );
  }
}

class _StockCard extends ConsumerWidget {
  const _StockCard({required this.quote});
  final FeedQuote quote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[quote.key]),
    );
    final ltp = tick?.ltp ?? quote.ltp;
    final close = quote.close;
    double? change;
    double? changePct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      changePct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    final upColor = const Color(0xFF22C55E);
    final downColor = const Color(0xFFEF4444);
    final color = isUp ? upColor : downColor;
    final scheme = Theme.of(context).colorScheme;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: quote.symbol,
            tradingsymbol: quote.tradingsymbol,
            symboltoken: quote.symboltoken,
            exchange: quote.exchange,
          ),
        ),
      ),
      child: Ink(
        width: 168,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _StockBadge(symbol: quote.symbol),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 5,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest.withValues(
                      alpha: 0.6,
                    ),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    quote.exchange,
                    style: TextStyle(
                      fontSize: 9,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              companyNameFor(quote.symbol),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            const SizedBox(height: 4),
            PriceFlash(
              price: ltp,
              child: Text(
                ltp != null ? '₹${ltp.toStringAsFixed(2)}' : '—',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  letterSpacing: -0.3,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Row(
              children: [
                Icon(
                  isUp ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  color: color,
                  size: 16,
                ),
                Flexible(
                  child: Text(
                    changePct != null
                        ? '${isUp ? '+' : ''}${changePct.toStringAsFixed(2)}%'
                        : '—',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w600,
                      fontSize: 12,
                    ),
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

class _StockBadge extends StatelessWidget {
  const _StockBadge({required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context) {
    final letter = symbol.isNotEmpty ? symbol[0] : '?';
    final color = _hashColor(symbol);
    return Container(
      width: 30,
      height: 30,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        letter,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w800,
          fontSize: 14,
        ),
      ),
    );
  }
}

const _badgeColors = [
  Color(0xFF6366F1),
  Color(0xFFEC4899),
  Color(0xFFF59E0B),
  Color(0xFF10B981),
  Color(0xFF06B6D4),
  Color(0xFF8B5CF6),
  Color(0xFFEF4444),
  Color(0xFF14B8A6),
];

Color _hashColor(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (h * 31 + c) & 0x7FFFFFFF;
  }
  return _badgeColors[h % _badgeColors.length];
}

class _SkeletonCarousel extends StatelessWidget {
  const _SkeletonCarousel();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      scrollDirection: Axis.horizontal,
      itemCount: 5,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (_, _) => Container(
        width: 168,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(16),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(
        'Stocks unavailable',
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}
