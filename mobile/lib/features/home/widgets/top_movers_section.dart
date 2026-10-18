import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/design/tokens.dart';
import '../../../core/money_format.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/stock_logo.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../home_providers.dart';

/// Rows shown before "Show all".
const _collapsedRows = 5;

/// "Top movers": Gainers / Losers / Intraday tabs and a cap-segment chip row
/// over a vertical list — logo, name, price and the move in points + %.
/// Data comes from `/market/movers` server-side so the sort is consistent
/// across clients and we don't pay 50 quote calls per render. Live ticks
/// aren't appended here — the list refreshes when the user switches tabs or
/// pulls to refresh on the home tab.
class TopMoversSection extends ConsumerStatefulWidget {
  const TopMoversSection({super.key});

  @override
  ConsumerState<TopMoversSection> createState() => _TopMoversSectionState();
}

class _TopMoversSectionState extends ConsumerState<TopMoversSection> {
  String _segment = 'largecap';
  String _type = 'gainers';
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final args = MoversArgs(segment: _segment, type: _type);
    final async = ref.watch(moversProvider(args));
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _TypeTabs(
            selected: _type,
            onChanged: (t) => setState(() {
              _type = t;
              _expanded = false;
            }),
          ),
          const SizedBox(height: 10),
          _CapChips(
            selected: _segment,
            onChanged: (s) => setState(() {
              _segment = s;
              _expanded = false;
            }),
          ),
          const SizedBox(height: 10),
          AppCard(
            radius: AppRadius.md,
            padding: EdgeInsets.zero,
            child: AnimatedSize(
              duration: AppMotion.medium,
              curve: AppMotion.emphasized,
              alignment: Alignment.topCenter,
              child: async.when(
                loading: () => const _SkeletonRows(),
                error: (_, _) =>
                    const _ListMessage('Movers are unavailable right now.'),
                data: (quotes) {
                  if (quotes.isEmpty) {
                    return const _ListMessage('No movers in this segment yet.');
                  }
                  final shown = _expanded
                      ? quotes
                      : quotes.take(_collapsedRows).toList();
                  return Column(
                    children: [
                      for (var i = 0; i < shown.length; i++) ...[
                        if (i > 0) const _RowDivider(),
                        _MoverRow(quote: shown[i], intraday: _type == 'intraday'),
                      ],
                      if (quotes.length > _collapsedRows) ...[
                        const _RowDivider(),
                        TextButton(
                          onPressed: () =>
                              setState(() => _expanded = !_expanded),
                          style: TextButton.styleFrom(
                            minimumSize: const Size.fromHeight(44),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _expanded
                                    ? 'Show less'
                                    : 'Show all ${quotes.length}',
                              ),
                              const SizedBox(width: 2),
                              Icon(
                                _expanded
                                    ? Icons.expand_less_rounded
                                    : Icons.expand_more_rounded,
                                size: 18,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MoverRow extends StatelessWidget {
  const _MoverRow({required this.quote, required this.intraday});
  final MoverQuote quote;

  /// Intraday movers rank by the move since today's open; the others by the
  /// day change vs the previous close.
  final bool intraday;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final ltp = quote.ltp;
    final base = intraday ? quote.open : quote.close;
    final pct = intraday ? quote.intradayPct : quote.dayPct;
    final change = ltp != null && base != null && base > 0 ? ltp - base : null;
    return InkWell(
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
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        child: Row(
          children: [
            StockLogo(symbol: quote.symbol, exchange: quote.exchange, size: 38),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    companyNameFor(quote.symbol),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    quote.symbol,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  ltp != null ? formatInr(ltp) : '—',
                  style: t.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    fontFeatures: const [FontFeature.tabularFigures()],
                  ),
                ),
                const SizedBox(height: 2),
                DayChange(change: change, percent: pct, style: t.labelSmall),
              ],
            ),
          ],
        ),
      ),
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
    final m = context.market;
    Widget tab(String value, String label, IconData icon, Color tint) {
      final isActive = value == selected;
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => onChanged(value),
          child: AnimatedContainer(
            duration: AppMotion.fast,
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: isActive ? scheme.surface : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              boxShadow: isActive
                  ? [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 6,
                        offset: const Offset(0, 1),
                      ),
                    ]
                  : null,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 15,
                  color: isActive ? tint : scheme.onSurfaceVariant,
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    color: isActive ? scheme.onSurface : scheme.onSurfaceVariant,
                    fontWeight: FontWeight.w700,
                    fontSize: 12.5,
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
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          tab('gainers', 'Gainers', Icons.trending_up_rounded, m.up),
          tab('losers', 'Losers', Icons.trending_down_rounded, m.down),
          tab('intraday', 'Intraday', Icons.bolt_rounded, m.violet),
        ],
      ),
    );
  }
}

class _CapChips extends StatelessWidget {
  const _CapChips({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  static const _segments = {
    'largecap': 'Large cap',
    'midcap': 'Mid cap',
    'smallcap': 'Small cap',
  };

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: [
        for (final e in _segments.entries)
          ChoiceChip(
            label: Text(e.value),
            selected: selected == e.key,
            showCheckmark: false,
            visualDensity: VisualDensity.compact,
            onSelected: (_) => onChanged(e.key),
          ),
      ],
    );
  }
}

class _RowDivider extends StatelessWidget {
  const _RowDivider();

  @override
  Widget build(BuildContext context) => Divider(
        height: 1,
        thickness: 1,
        indent: 64,
        color: context.market.cardBorder,
      );
}

class _SkeletonRows extends StatelessWidget {
  const _SkeletonRows();

  @override
  Widget build(BuildContext context) {
    final fill = Theme.of(context)
        .colorScheme
        .surfaceContainerHighest
        .withValues(alpha: 0.5);
    Widget bar(double w, double h) => Container(
          width: w,
          height: h,
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(6),
          ),
        );
    return Column(
      children: [
        for (var i = 0; i < _collapsedRows; i++)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: fill,
                    borderRadius: BorderRadius.circular(11),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [bar(140, 12), const SizedBox(height: 6), bar(70, 10)],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [bar(64, 12), const SizedBox(height: 6), bar(90, 10)],
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ListMessage extends StatelessWidget {
  const _ListMessage(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 22),
      child: Center(
        child: Text(text, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}
