import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/tick.dart';
import '../../home/home_providers.dart';
import '../../market/market_repository.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../widgets/fno_insights.dart';
import 'option_chain_screen.dart';
import 'strategy_builder_screen.dart';

/// Picker that lets the user choose an F&O underlying before drilling into
/// the option chain. Lives here (not under market/) because the destination
/// for each tile is the option chain — F&O futures get the same chain view
/// since the underlying is what selects the contract list on the backend.
///
/// Each tile shows the live spot LTP for its underlying. We fetch a one-shot
/// quote on first build (so users see numbers immediately) and then layer
/// the live tick stream on top so the price updates without a re-fetch
/// while the market is open.
class FnoLandingScreen extends ConsumerStatefulWidget {
  const FnoLandingScreen({super.key});

  // Hard-coded order — these six underlyings dominate Indian F&O turnover.
  // Each entry's exchange field decides the tick subscription and quote
  // batching (NSE indices vs. BSE indices group separately on the backend).
  static const _underlyings = <_FnoEntry>[
    _FnoEntry('NIFTY', 'Nifty 50', 'NSE', Color(0xFF22C55E)),
    _FnoEntry('BANKNIFTY', 'Nifty Bank', 'NSE', Color(0xFF6366F1)),
    _FnoEntry('FINNIFTY', 'Nifty Financial', 'NSE', Color(0xFF06B6D4)),
    _FnoEntry('MIDCPNIFTY', 'Nifty Midcap Select', 'NSE', Color(0xFFF59E0B)),
    _FnoEntry('SENSEX', 'BSE Sensex', 'BSE', Color(0xFFEC4899)),
    _FnoEntry('BANKEX', 'BSE Bankex', 'BSE', Color(0xFF8B5CF6)),
  ];

  @override
  ConsumerState<FnoLandingScreen> createState() => _FnoLandingScreenState();
}

class _FnoLandingScreenState extends ConsumerState<FnoLandingScreen> {
  List<TickSubscription> _subs = const [];

  /// Reconciles the tick subscription set to match the [quotes] we have
  /// tokens for. Indices-screen uses the exact same pattern — re-extract
  /// later if a third surface needs it.
  void _sync(List<FeedQuote> quotes) {
    final desired = quotes
        .map((q) => TickSubscription(symbol: q.symbol, exchange: q.exchange))
        .toList();
    final service = ref.read(ticksServiceProvider);
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
      ref.read(ticksServiceProvider).unsubscribe(_subs);
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Reuse the indices-quote provider so the strip on home and this
    // landing screen share a cache for the same underlyings.
    final quotesAsync = ref.watch(allIndexQuotesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Futures & Options')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(allIndexQuotesProvider);
          await ref.read(allIndexQuotesProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Text(
                'Pick an underlying',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: scheme.onSurface.withValues(alpha: 0.7),
                ),
              ),
            ),
            quotesAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (_, _) => const SizedBox.shrink(),
              data: (allQuotes) {
                // Pull just the six F&O-tradable underlyings out of the
                // full all-indices payload and sync our tick subscriptions
                // to match. The post-frame callback avoids re-entering the
                // build cycle while still inside `data:`.
                final byKey = {
                  for (final q in allQuotes)
                    '${q.exchange}:${q.symbol.toUpperCase()}': q,
                };
                final fnoQuotes = <FeedQuote>[];
                for (final e in FnoLandingScreen._underlyings) {
                  final q = byKey['${e.exchange}:${e.symbol.toUpperCase()}'];
                  if (q != null) fnoQuotes.add(q);
                }
                WidgetsBinding.instance
                    .addPostFrameCallback((_) => _sync(fnoQuotes));
                return Column(
                  children: [
                    for (final e in FnoLandingScreen._underlyings) ...[
                      _UnderlyingTile(
                        entry: e,
                        quote: byKey[
                            '${e.exchange}:${e.symbol.toUpperCase()}'],
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: scheme.tertiaryContainer.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, color: scheme.tertiary, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Index F&O margin: 15%. Stock F&O margin: 22%. '
                      'Short positions auto-square at contract expiry.',
                      style: TextStyle(
                        fontSize: 12,
                        color: scheme.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 28),
            const FnoInsights(),
          ],
        ),
      ),
    );
  }
}

class _FnoEntry {
  final String symbol;
  final String fullName;
  final String exchange;
  final Color color;
  const _FnoEntry(this.symbol, this.fullName, this.exchange, this.color);
}

class _UnderlyingTile extends ConsumerWidget {
  const _UnderlyingTile({required this.entry, required this.quote});
  final _FnoEntry entry;
  final FeedQuote? quote;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    // Live tick lookup keyed by exchange:token. Falls back to the REST
    // snapshot LTP when no tick has arrived yet (first paint, or market
    // closed and the stream is idle).
    final tickKey =
        quote == null ? null : '${quote!.exchange}:${quote!.symboltoken}';
    final tick = tickKey == null
        ? null
        : ref.watch(latestTicksProvider.select<Tick?>((m) => m[tickKey]));
    final ltp = tick?.ltp ?? quote?.ltp;
    final close = quote?.close;
    double? change;
    double? pct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      pct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    const upColor = Color(0xFF22C55E);
    const downColor = Color(0xFFEF4444);
    final pctColor = isUp ? upColor : downColor;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => OptionChainScreen(underlying: entry.symbol),
        ),
      ),
      child: Ink(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: entry.color.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                Icons.swap_calls,
                color: entry.color,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.symbol,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  Text(
                    entry.fullName,
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ],
              ),
            ),
            // Live spot block — LTP on top, day-change chip below. Renders
            // a discreet placeholder when the quote feed hasn't returned
            // yet (e.g., scrip-master still loading after a cold start).
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  ltp != null ? ltp.toStringAsFixed(2) : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                if (pct != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: pctColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%',
                      style: TextStyle(
                        color: pctColor,
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                      ),
                    ),
                  )
                else
                  Text(
                    'spot',
                    style: TextStyle(
                      fontSize: 9.5,
                      color: scheme.onSurface.withValues(alpha: 0.45),
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.4,
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 6),
            IconButton(
              icon: const Icon(Icons.auto_graph, size: 18),
              tooltip: 'Strategy builder',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      StrategyBuilderScreen(underlying: entry.symbol),
                ),
              ),
            ),
            Icon(
              Icons.chevron_right,
              color: scheme.onSurface.withValues(alpha: 0.5),
            ),
          ],
        ),
      ),
    );
  }
}
