import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/tick.dart';
import '../../../widgets/price_flash.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../home_providers.dart';

class IndicesStrip extends ConsumerWidget {
  const IndicesStrip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final indices = ref.watch(homeIndicesProvider);
    return SizedBox(
      height: 92,
      child: indices.when(
        loading: () => const _SkeletonStrip(),
        error: (_, _) => const _ErrorStrip(),
        data: (quotes) => ListView.separated(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          scrollDirection: Axis.horizontal,
          itemCount: quotes.length,
          separatorBuilder: (_, _) => const SizedBox(width: 10),
          itemBuilder: (_, i) => _IndexCard(quote: quotes[i]),
        ),
      ),
    );
  }
}

class _IndexCard extends ConsumerWidget {
  const _IndexCard({required this.quote});
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
      borderRadius: BorderRadius.circular(14),
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
        width: 152,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              quote.symbol,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13,
                letterSpacing: 0.2,
              ),
            ),
            PriceFlash(
              price: ltp,
              child: Text(
                ltp != null ? ltp.toStringAsFixed(2) : '—',
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                ),
              ),
            ),
            Row(
              children: [
                Icon(
                  isUp ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                  color: color,
                  size: 18,
                ),
                Flexible(
                  child: Text(
                    changePct != null
                        ? '${changePct.toStringAsFixed(2)}%'
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

class _SkeletonStrip extends StatelessWidget {
  const _SkeletonStrip();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      scrollDirection: Axis.horizontal,
      itemCount: 4,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (_, _) => Container(
        width: 152,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    );
  }
}

class _ErrorStrip extends StatelessWidget {
  const _ErrorStrip();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(
        'Indices unavailable',
        style: TextStyle(
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}
