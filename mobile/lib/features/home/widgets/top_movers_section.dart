import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../home_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);
const _intradayColor = Color(0xFF6366F1);

/// "Top movers" section: a tab strip for Gainers / Losers / Intraday plus a
/// cap-segment chip row. Data comes from `/market/movers` server-side so the
/// sort is consistent across clients and we don't pay 50 quote calls per
/// render. Live ticks aren't appended here — the section refreshes only when
/// the user changes tabs or pulls to refresh on the home tab.
class TopMoversSection extends ConsumerStatefulWidget {
  const TopMoversSection({super.key});

  @override
  ConsumerState<TopMoversSection> createState() => _TopMoversSectionState();
}

class _TopMoversSectionState extends ConsumerState<TopMoversSection> {
  String _segment = 'largecap';
  String _type = 'gainers';

  @override
  Widget build(BuildContext context) {
    final args = MoversArgs(segment: _segment, type: _type);
    final async = ref.watch(moversProvider(args));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: _TypeTabs(
            selected: _type,
            onChanged: (t) => setState(() => _type = t),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: _CapChips(
            selected: _segment,
            onChanged: (s) => setState(() => _segment = s),
          ),
        ),
        SizedBox(
          height: 132,
          child: async.when(
            loading: () => const _SkeletonCarousel(),
            error: (_, _) => const _ErrorState(),
            data: (quotes) {
              if (quotes.isEmpty) return const _EmptyState();
              return ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                scrollDirection: Axis.horizontal,
                itemCount: quotes.length,
                separatorBuilder: (_, _) => const SizedBox(width: 10),
                itemBuilder: (_, i) =>
                    _MoverCard(quote: quotes[i], type: _type),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _TypeTabs extends StatelessWidget {
  const _TypeTabs({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget tab(String value, String label, IconData icon, Color tint) {
      final isActive = value == selected;
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color:
                  isActive ? tint.withValues(alpha: 0.18) : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 14,
                  color: isActive
                      ? tint
                      : scheme.onSurface.withValues(alpha: 0.6),
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: isActive
                        ? tint
                        : scheme.onSurface.withValues(alpha: 0.65),
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          tab('gainers', 'Gainers', Icons.trending_up, _upColor),
          tab('losers', 'Losers', Icons.trending_down, _downColor),
          tab('intraday', 'Intraday', Icons.bolt, _intradayColor),
        ],
      ),
    );
  }
}

class _CapChips extends StatelessWidget {
  const _CapChips({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _CapChip(
          value: 'largecap',
          label: 'Large cap',
          selected: selected == 'largecap',
          onTap: () => onChanged('largecap'),
        ),
        const SizedBox(width: 6),
        _CapChip(
          value: 'midcap',
          label: 'Mid cap',
          selected: selected == 'midcap',
          onTap: () => onChanged('midcap'),
        ),
        const SizedBox(width: 6),
        _CapChip(
          value: 'smallcap',
          label: 'Small cap',
          selected: selected == 'smallcap',
          onTap: () => onChanged('smallcap'),
        ),
      ],
    );
  }
}

class _CapChip extends StatelessWidget {
  const _CapChip({
    required this.value,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String value;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? scheme.primary
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected
                ? scheme.onPrimary
                : scheme.onSurface.withValues(alpha: 0.7),
            fontWeight: FontWeight.w700,
            fontSize: 11.5,
            letterSpacing: 0.3,
          ),
        ),
      ),
    );
  }
}

class _MoverCard extends StatelessWidget {
  const _MoverCard({required this.quote, required this.type});
  final MoverQuote quote;
  final String type;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pct =
        type == 'intraday' ? quote.intradayPct : quote.dayPct;
    final isUp = (pct ?? 0) >= 0;
    final color = isUp ? _upColor : _downColor;
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
        width: 172,
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              companyNameFor(quote.symbol),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 13.5,
                letterSpacing: -0.1,
              ),
            ),
            Text(
              quote.symbol,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                color: scheme.onSurface.withValues(alpha: 0.55),
                fontWeight: FontWeight.w500,
                letterSpacing: 0.2,
              ),
            ),
            Text(
              quote.ltp != null
                  ? '₹${quote.ltp!.toStringAsFixed(2)}'
                  : '—',
              style: const TextStyle(
                fontSize: 15.5,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.3,
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isUp ? Icons.arrow_drop_up : Icons.arrow_drop_down,
                    color: color,
                    size: 14,
                  ),
                  Text(
                    pct != null
                        ? '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%'
                        : '—',
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w700,
                      fontSize: 11.5,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
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
        width: 172,
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
        'Movers unavailable',
        style: TextStyle(
          color:
              Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Text(
        'No movers right now',
        style: TextStyle(
          color:
              Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}
