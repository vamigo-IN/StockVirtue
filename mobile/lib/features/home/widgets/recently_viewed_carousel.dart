import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/price_flash.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../recently_viewed_storage.dart';

/// "Recently viewed" carousel. Hidden entirely when the local list is empty
/// (i.e. first-time users see no clutter). Live ticks paint the LTP if a
/// subscription happens to be open from elsewhere; otherwise the card shows
/// only the company name + symbol.
///
/// [excludeKey] (format `EXCHANGE:TOKEN`) hides one entry — used on the
/// symbol-detail screen so the user isn't shown the stock they're already
/// looking at.
class RecentlyViewedCarousel extends ConsumerWidget {
  const RecentlyViewedCarousel({super.key, this.excludeKey});
  final String? excludeKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(recentlyViewedProvider);
    return async.maybeWhen(
      data: (all) {
        final entries = excludeKey == null
            ? all
            : all.where((e) => e.key != excludeKey).toList();
        if (entries.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Row(
                children: [
                  Text(
                    'Recently viewed',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      '${entries.length}',
                      style: TextStyle(
                        fontSize: 12,
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 110,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: entries.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) => _RecentCard(entry: entries[i]),
              ),
            ),
          ],
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _RecentCard extends ConsumerWidget {
  const _RecentCard({required this.entry});
  final RecentSymbol entry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[entry.key]),
    );
    final scheme = Theme.of(context).colorScheme;
    final color = _hashColor(entry.symbol);
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
        width: 158,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
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
            Row(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Text(
                    entry.symbol.isNotEmpty ? entry.symbol[0] : '?',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                    ),
                  ),
                ),
                const Spacer(),
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
