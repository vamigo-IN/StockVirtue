import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/price_flash.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/stock_logo.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../bookmarks_storage.dart';

/// Horizontal carousel of bookmarked stocks on the home tab. Hidden when
/// the list is empty so users who haven't starred anything yet don't see a
/// placeholder section.
class BookmarksRail extends ConsumerWidget {
  const BookmarksRail({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(bookmarksProvider);
    return async.maybeWhen(
      data: (entries) {
        if (entries.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SectionHeader(
              title: 'Bookmarks',
              leading: Icon(
                Icons.star_rounded,
                color: Color(0xFFF59E0B),
                size: 20,
              ),
            ),
            SizedBox(
              height: 102,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: entries.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) => _BookmarkCard(entry: entries[i]),
              ),
            ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _BookmarkCard extends ConsumerWidget {
  const _BookmarkCard({required this.entry});
  final BookmarkedSymbol entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[entry.key]),
    );
    final scheme = Theme.of(context).colorScheme;
    final name = companyNameFor(entry.symbol);
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: entry.symbol,
            tradingsymbol: entry.tradingsymbol,
            symboltoken: entry.symboltoken,
            exchange: entry.exchange,
          ),
        ),
      ),
      child: Ink(
        width: 160,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: const Color(0xFFF59E0B).withValues(alpha: 0.35),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                StockLogo(
                  symbol: entry.symbol,
                  exchange: entry.exchange,
                  size: 28,
                ),
                const Spacer(),
                const Icon(
                  Icons.star_rounded,
                  color: Color(0xFFF59E0B),
                  size: 14,
                ),
                const SizedBox(width: 4),
                Text(
                  entry.exchange,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ),
            Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
                letterSpacing: -0.1,
              ),
            ),
            PriceFlash(
              price: tick?.ltp,
              child: Text(
                tick?.ltp != null
                    ? '₹${tick!.ltp.toStringAsFixed(2)}'
                    : entry.symbol,
                style: TextStyle(
                  fontSize: tick?.ltp != null ? 14 : 11,
                  fontWeight: FontWeight.w700,
                  color: tick?.ltp != null
                      ? scheme.onSurface
                      : scheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
