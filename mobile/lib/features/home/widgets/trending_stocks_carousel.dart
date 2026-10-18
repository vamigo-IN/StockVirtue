import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/design/tokens.dart';
import '../../../core/money_format.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/price_flash.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/stock_logo.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../home_providers.dart';

const _cardWidth = 156.0;
const _railHeight = 148.0;

/// "Most traded" rail: logo, company name, live price and the day's move
/// in points with the percentage beside it ("+12.40 (+0.96%)").
class TrendingStocksCarousel extends ConsumerWidget {
  const TrendingStocksCarousel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(homeTrendingProvider);
    return SizedBox(
      height: _railHeight,
      child: trending.when(
        loading: () => const _SkeletonRail(),
        error: (_, _) => const _RailMessage('Prices unavailable right now'),
        data: (quotes) => quotes.isEmpty
            ? const _RailMessage('Prices unavailable right now')
            : ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
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
    final t = Theme.of(context).textTheme;
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[quote.key]),
    );
    final ltp = tick?.ltp ?? quote.ltp;
    final close = tick?.close ?? quote.close;
    double? change;
    double? changePct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      changePct = (change / close) * 100;
    }

    return SizedBox(
      width: _cardWidth,
      child: AppCard(
        radius: AppRadius.md,
        padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            StockLogo(symbol: quote.symbol, exchange: quote.exchange, size: 34),
            const Spacer(),
            Text(
              companyNameFor(quote.symbol),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            PriceFlash(
              price: ltp,
              child: Text(
                ltp != null ? formatInr(ltp) : '—',
                maxLines: 1,
                style: t.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: DayChange(change: change, percent: changePct),
            ),
          ],
        ),
      ),
    );
  }
}

class _SkeletonRail extends StatelessWidget {
  const _SkeletonRail();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
      scrollDirection: Axis.horizontal,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: 4,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (_, _) => Container(
        width: _cardWidth,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
          borderRadius: BorderRadius.circular(AppRadius.md),
        ),
      ),
    );
  }
}

class _RailMessage extends StatelessWidget {
  const _RailMessage(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(text, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}
