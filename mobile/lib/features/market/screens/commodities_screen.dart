import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../core/market_hours.dart';
import '../../../core/money_format.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/fno_badge.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/skeletons.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../market_repository.dart';

final _commoditiesProvider =
    FutureProvider.autoDispose<List<CommodityQuote>>((ref) {
  return ref.watch(marketRepositoryProvider).getCommodities();
});

enum _Group { all, bullion, energy, metals }

_Group _groupOf(String name) {
  final n = name.toUpperCase();
  if (n.startsWith('GOLD') || n.startsWith('SILVER')) return _Group.bullion;
  if (n.startsWith('CRUDE') || n.startsWith('NATURALGAS') || n.startsWith('NATGAS')) {
    return _Group.energy;
  }
  return _Group.metals;
}

IconData _iconOf(_Group g) => switch (g) {
      _Group.bullion => Icons.diamond_rounded,
      _Group.energy => Icons.local_fire_department_rounded,
      _Group.metals => Icons.precision_manufacturing_rounded,
      _Group.all => Icons.apps_rounded,
    };

/// MCX commodities market — live rates for the popular contracts (bullion,
/// energy, base metals), each resolved to its front-month future, valued the
/// way MCX values them: one GOLD lot is 1 kg priced per 10 g, so a lot is
/// worth price × 100. Futures trade on margin, so each row also shows what
/// one lot actually blocks from your wallet. Tap a row to trade it.
class CommoditiesScreen extends ConsumerStatefulWidget {
  const CommoditiesScreen({super.key});

  @override
  ConsumerState<CommoditiesScreen> createState() => _CommoditiesScreenState();
}

class _CommoditiesScreenState extends ConsumerState<CommoditiesScreen> {
  List<TickSubscription> _subs = const [];
  _Group _group = _Group.all;

  /// Subscribe every listed contract to the live feed, diffing so we only
  /// add/remove the delta when the list changes.
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
      appBar: AppBar(title: const Text('Commodities')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_commoditiesProvider);
          await ref.read(_commoditiesProvider.future);
        },
        child: async.when(
          loading: () => const SkeletonList(showHeader: true),
          error: (e, _) => ErrorRetryView(
            error: e,
            errorContext: 'commodities',
            onRetry: () => ref.invalidate(_commoditiesProvider),
          ),
          data: (list) {
            if (list.isEmpty) return const _EmptyCommodities();
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _sync(list);
            });
            final shown = _group == _Group.all
                ? list
                : list.where((c) => _groupOf(c.name) == _group).toList();
            return ListView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
              children: [
                const _SessionHero(),
                const SizedBox(height: 14),
                _GroupChips(
                  value: _group,
                  onChanged: (g) => setState(() => _group = g),
                ),
                const SizedBox(height: 12),
                for (var i = 0; i < shown.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _CommodityTile(commodity: shown[i])
                        .animate()
                        .fadeIn(duration: 220.ms, delay: (i * 25).ms)
                        .slideY(begin: 0.08, end: 0),
                  ),
                const SizedBox(height: 6),
                const InfoBanner(
                  icon: Icons.school_outlined,
                  title: 'How commodity futures are priced',
                  message:
                      'Prices are quoted per unit (gold per 10 g, crude per '
                      'barrel) but one lot is much bigger — a GOLD lot is 1 kg, '
                      'so it is worth price × 100. You don’t pay that full '
                      'value: like a real broker, only the margin shown is '
                      'blocked and your P&L moves with every tick. Contracts '
                      'settle automatically on expiry.',
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SessionHero extends StatelessWidget {
  const _SessionHero();

  @override
  Widget build(BuildContext context) {
    final m = context.market;
    final t = Theme.of(context).textTheme;
    final open = isMarketOpen(null, 'MCX');
    final close = commodityCloseLabel();
    return AppCard(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: m.heroGradient,
      ),
      borderColor: Colors.white.withValues(alpha: 0.06),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.md),
            ),
            child: Icon(Icons.diamond_rounded, color: m.gold),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'MCX futures',
                  style: t.titleMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Front-month contracts · trade on margin · 09:00–$close IST',
                  style: t.bodySmall?.copyWith(
                    color: Colors.white.withValues(alpha: 0.75),
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: (open ? m.up : Colors.white).withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(AppRadius.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: open ? m.up : Colors.white70,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  open ? 'LIVE' : 'CLOSED',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.6,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GroupChips extends StatelessWidget {
  const _GroupChips({required this.value, required this.onChanged});
  final _Group value;
  final ValueChanged<_Group> onChanged;

  @override
  Widget build(BuildContext context) {
    const labels = {
      _Group.all: 'All',
      _Group.bullion: 'Bullion',
      _Group.energy: 'Energy',
      _Group.metals: 'Base metals',
    };
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          for (final g in _Group.values)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                avatar: Icon(_iconOf(g), size: 16),
                label: Text(labels[g]!),
                selected: value == g,
                onSelected: (_) => onChanged(g),
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
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final c = commodity;
    // Live LTP overlay — this row rebuilds only when its own contract ticks.
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((map) => map[c.tickKey]),
    );
    final ltp = tick?.ltp ?? c.ltp;
    final tClose = tick?.close ?? c.close;
    final change = tClose > 0 ? ltp - tClose : c.change;
    final changePct = tClose > 0 ? (change / tClose) * 100 : c.changePct;
    final group = _groupOf(c.name);
    final accent = switch (group) {
      _Group.bullion => m.gold,
      _Group.energy => m.warning,
      _ => m.info,
    };

    return AppCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            // The detail screen addresses quotes/orders by the contract
            // tradingsymbol on MCX; the underlying name is the display key.
            symbol: c.name,
            tradingsymbol: c.tradingsymbol,
            symboltoken: c.symboltoken,
            exchange: c.exchange,
          ),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(AppRadius.sm),
                ),
                child: Icon(_iconOf(group), color: accent, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.label, style: t.titleMedium),
                    const SizedBox(height: 2),
                    Text(
                      prettyContract(c.tradingsymbol),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodySmall,
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    ltp > 0 ? formatInr(ltp) : '—',
                    style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  ChangePill(percent: changePct, compact: true),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            child: Row(
              children: [
                Expanded(
                  child: StatTile(
                    label: 'Per ${c.quoteUnit.isEmpty ? 'unit' : c.quoteUnit}',
                    value: c.lotLabel != null ? '1 lot = ${c.lotLabel}' : 'Lot ${c.lotSize}',
                  ),
                ),
                Expanded(
                  child: StatTile(
                    label: 'Lot value',
                    value: ltp > 0 ? formatInrCompact(c.contractValueAt(ltp)) : '—',
                  ),
                ),
                Expanded(
                  child: StatTile(
                    label: 'Margin (${c.marginRatePct.toStringAsFixed(0)}%)',
                    value: ltp > 0 ? formatInrCompact(c.marginPerLotAt(ltp)) : '—',
                    valueColor: scheme.primary,
                    crossAxisAlignment: CrossAxisAlignment.end,
                  ),
                ),
              ],
            ),
          ),
        ],
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
