import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/tick.dart';
import '../../../widgets/error_retry_view.dart';
import '../../home/home_providers.dart';
import '../../home/indices_universe.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../market_repository.dart';
import '../../../widgets/ui/skeletons.dart';

/// Sectional view over the full indices universe (broad / sectoral /
/// strategy). Live ticks paint the LTP and % chip in-place when subscribed.
class IndicesScreen extends ConsumerStatefulWidget {
  const IndicesScreen({super.key});

  @override
  ConsumerState<IndicesScreen> createState() => _IndicesScreenState();
}

class _IndicesScreenState extends ConsumerState<IndicesScreen> {
  /// Read once while mounted — `ref` is off-limits in dispose(), where
  /// the subscriptions are released.
  late final TicksService _ticks;

  @override
  void initState() {
    super.initState();
    _ticks = ref.read(ticksServiceProvider);
  }

  List<TickSubscription> _subs = const [];

  void _sync(List<FeedQuote> quotes) {
    final desired = quotes
        .map((q) => TickSubscription(symbol: q.symbol, exchange: q.exchange))
        .toList();
    final service = _ticks;
    final existing = _subs.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final wanted = desired.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final add = desired
        .where((s) => !existing.contains('${s.exchange}:${s.symbol}'))
        .toList();
    final remove = _subs
        .where((s) => !wanted.contains('${s.exchange}:${s.symbol}'))
        .toList();
    if (add.isNotEmpty) service.subscribe(add);
    if (remove.isNotEmpty) service.unsubscribe(remove);
    _subs = desired;
  }

  @override
  void dispose() {
    if (_subs.isNotEmpty) {
      _ticks.unsubscribe(_subs);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final indices = ref.watch(allIndexQuotesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Indices',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(allIndexQuotesProvider);
          await ref.read(allIndexQuotesProvider.future);
        },
        child: indices.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ErrorRetryView(
            error: e,
            onRetry: () => ref.invalidate(allIndexQuotesProvider),
          ),
          data: (quotes) {
            WidgetsBinding.instance
                .addPostFrameCallback((_) => _sync(quotes));
            final byKey = <String, FeedQuote>{
              for (final q in quotes)
                '${q.exchange}:${q.symbol.toUpperCase()}': q,
            };
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                for (final group in indexGroups) ...[
                  _GroupHeader(group: group),
                  const SizedBox(height: 8),
                  for (final entry in group.indices)
                    _IndexRow(
                      entry: entry,
                      quote: byKey[
                          '${entry.exchange}:${entry.symbol.toUpperCase()}'],
                    ),
                  const SizedBox(height: 20),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _GroupHeader extends StatelessWidget {
  const _GroupHeader({required this.group});
  final IndexGroup group;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            group.label,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            group.description,
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _IndexRow extends ConsumerWidget {
  const _IndexRow({required this.entry, required this.quote});
  final IndexEntry entry;
  final FeedQuote? quote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final tickKey = quote == null
        ? null
        : '${quote!.exchange}:${quote!.symboltoken}';
    final tick = tickKey == null
        ? null
        : ref.watch(
            latestTicksProvider.select<Tick?>((m) => m[tickKey]),
          );
    final ltp = tick?.ltp ?? quote?.ltp;
    final close = quote?.close;
    double? change;
    double? pct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      pct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    final upColor = const Color(0xFF22C55E);
    final downColor = const Color(0xFFEF4444);
    final color = isUp ? upColor : downColor;
    final tradable = quote != null && quote!.symboltoken.isNotEmpty;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: tradable
            ? () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => SymbolDetailScreen(
                      symbol: quote!.symbol,
                      tradingsymbol: quote!.tradingsymbol,
                      symboltoken: quote!.symboltoken,
                      exchange: quote!.exchange,
                    ),
                  ),
                )
            : null,
        child: Ink(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: scheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      entry.fullName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${entry.exchange} • ${entry.symbol}',
                      style: TextStyle(
                        fontSize: 11,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    ltp != null ? ltp.toStringAsFixed(2) : '—',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      letterSpacing: -0.2,
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (pct != null)
                    Text(
                      '${isUp ? '+' : ''}${change!.toStringAsFixed(2)} '
                      '(${pct.toStringAsFixed(2)}%)',
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                        fontSize: 11.5,
                      ),
                    )
                  else
                    Text(
                      tradable ? '' : 'Unlisted',
                      style: TextStyle(
                        fontSize: 11,
                        color: scheme.onSurface.withValues(alpha: 0.45),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
