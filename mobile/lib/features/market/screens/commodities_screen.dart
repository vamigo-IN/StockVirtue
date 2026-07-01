import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/empty_state.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../market_repository.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

final _commoditiesProvider =
    FutureProvider.autoDispose<List<CommodityQuote>>((ref) {
  return ref.watch(marketRepositoryProvider).getCommodities();
});

/// MCX commodities market — live rates for the popular contracts (gold,
/// silver, crude, natural gas, base metals), each resolved to its front-month
/// future. Tap a row to open the contract and trade it like any derivative;
/// commodities trade a longer session (09:00–23:30 IST) than equities.
class CommoditiesScreen extends ConsumerStatefulWidget {
  const CommoditiesScreen({super.key});

  @override
  ConsumerState<CommoditiesScreen> createState() => _CommoditiesScreenState();
}

class _CommoditiesScreenState extends ConsumerState<CommoditiesScreen> {
  List<TickSubscription> _subs = const [];

  /// Subscribe every listed contract to the live feed, diffing so we only
  /// add/remove the delta when the list changes. Keyed consistently by
  /// `exchange:tradingsymbol` so a repeat sync is a no-op.
  void _sync(List<CommodityQuote> list) {
    final byKey = <String, TickSubscription>{};
    for (final c in list) {
      final sub =
          TickSubscription(symbol: c.tradingsymbol, exchange: c.exchange);
      byKey['${sub.exchange}:${sub.symbol}'] = sub;
    }
    final desired = byKey.values.toList();
    final service = ref.read(ticksServiceProvider);
    final wanted = byKey.keys.toSet();
    final existing = _subs.map((s) => '${s.exchange}:${s.symbol}').toSet();
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
    final async = ref.watch(_commoditiesProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Commodities',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_commoditiesProvider);
          await ref.read(_commoditiesProvider.future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Could not load commodities.\n$e'),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return const _EmptyCommodities();
            }
            // Keep tick subscriptions in step with the loaded contracts.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _sync(list);
            });
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              itemCount: list.length + 1,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) {
                if (i == 0) return const _CommoditiesHeader();
                return _CommodityTile(commodity: list[i - 1]);
              },
            );
          },
        ),
      ),
    );
  }
}

class _CommoditiesHeader extends StatelessWidget {
  const _CommoditiesHeader();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          Icon(Icons.diamond_outlined,
              size: 15, color: scheme.onSurface.withValues(alpha: 0.6)),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              'MCX front-month futures · live rates',
              style: TextStyle(
                fontSize: 12,
                color: scheme.onSurface.withValues(alpha: 0.6),
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CommodityTile extends ConsumerWidget {
  const _CommodityTile({required this.commodity});
  final CommodityQuote commodity;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final c = commodity;
    // Live LTP overlay — this row rebuilds only when its own contract ticks.
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[c.tickKey]),
    );
    final ltp = tick?.ltp ?? c.ltp;
    final tClose = tick?.close ?? c.close;
    final change = tClose > 0 ? ltp - tClose : c.change;
    final changePct = tClose > 0 ? (change / tClose) * 100 : c.changePct;
    final isUp = change >= 0;
    final color = isUp ? _upColor : _downColor;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            // Pass the friendly commodity name as the display symbol; the
            // detail screen addresses quotes/orders by the contract
            // tradingsymbol on MCX.
            symbol: c.name,
            tradingsymbol: c.tradingsymbol,
            symboltoken: c.symboltoken,
            exchange: c.exchange,
          ),
        ),
      ),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
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
                    c.label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    '₹/${c.unit} · lot ${c.lotSize}'
                    '${c.expiry != null ? ' · ${c.expiry}' : ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  ltp > 0 ? formatInr(ltp) : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 3),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(
                    '${isUp ? '+' : ''}${change.toStringAsFixed(2)} '
                    '(${changePct.toStringAsFixed(2)}%)',
                    style: TextStyle(
                      color: color,
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(width: 6),
            Icon(
              Icons.chevron_right,
              size: 18,
              color: scheme.onSurface.withValues(alpha: 0.4),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyCommodities extends StatelessWidget {
  const _EmptyCommodities();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 48, horizontal: 24),
          child: EmptyState(
            icon: Icons.diamond_outlined,
            title: 'Commodities unavailable',
            subtitle:
                'MCX contracts could not be loaded right now. Pull to refresh '
                'in a moment.',
          ),
        ),
      ],
    );
  }
}
