import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// StateProvider moved to the legacy import in Riverpod 3.x.
import 'package:flutter_riverpod/legacy.dart';

import '../../../core/company_names.dart';
import '../../../core/market_hours.dart';
import '../../../core/money_format.dart';
import '../../../data/models/order.dart';
import '../../../data/models/portfolio.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/fno_badge.dart';
import '../../home/screens/shell_screen.dart';
import '../../orders/widgets/trade_sheet.dart';
import '../../share/share_trade.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../portfolio_live.dart';
import '../portfolio_providers.dart';
import '../widgets/allocation_card.dart';
import 'analytics_screen.dart';
import 'portfolio_history_screen.dart';
import 'sector_heatmap_screen.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// True for derivatives holdings (options/futures) vs cash equity.
bool _isFnoPosition(PortfolioPosition p) => isFnoExchange(p.exchange);

/// Holdings segment shown on the Portfolio screen. Lets the user split their
/// cash-equity holdings from their F&O trades at a glance.
enum HoldingsFilter { all, stocks, fno }

/// Selected holdings segment. A provider (not local state) so it survives the
/// snapshot reloads that rebuild the list after every order.
final holdingsFilterProvider =
    StateProvider<HoldingsFilter>((ref) => HoldingsFilter.all);

class PortfolioScreen extends ConsumerStatefulWidget {
  const PortfolioScreen({super.key});

  @override
  ConsumerState<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends ConsumerState<PortfolioScreen> {
  // Live tick subscriptions for the currently-held symbols. These ticks keep
  // each holding's LTP, value and P&L (and the equity hero total) moving
  // continuously while the market is open — no interval polling. The snapshot
  // is reconciled on open, on pull-to-refresh, and after every order.
  List<TickSubscription> _subs = const [];

  /// Subscribe to live ticks for the held symbols, diffing against the current
  /// set so we only add/remove the delta when holdings change. F&O contracts
  /// are addressed by their tradingsymbol (see [subForPosition]).
  void _syncSubs(List<PortfolioPosition> positions) {
    final byKey = <String, TickSubscription>{};
    for (final p in positions) {
      final sub = subForPosition(p);
      byKey['${sub.exchange}:${sub.symbol}'] = sub;
    }
    final desired = byKey.values.toList();
    final service = ref.read(ticksServiceProvider);
    final wanted = byKey.keys.toSet();
    final existing = _subs.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final add =
        desired.where((s) => !existing.contains('${s.exchange}:${s.symbol}')).toList();
    final remove =
        _subs.where((s) => !wanted.contains('${s.exchange}:${s.symbol}')).toList();
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
    final portfolio = ref.watch(portfolioProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Portfolio',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: const [
          _LiveBadge(),
          SizedBox(width: 12),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          await ref.read(portfolioProvider.future);
        },
        child: portfolio.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorRetryView(
            error: e,
            onRetry: () => ref.invalidate(portfolioProvider),
          ),
          data: (snap) {
            // Keep live-tick subscriptions in step with the held symbols.
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _syncSubs(snap.positions);
            });
            return _Body(snap: snap);
          },
        ),
      ),
    );
  }
}

/// "LIVE · auto-refresh 30s" pill rendered in the app bar while the
/// market is open. Subscribes to [marketStateProvider] so the indicator
/// flips off the moment the session ends without needing to rebuild
/// the whole screen.
class _LiveBadge extends ConsumerWidget {
  const _LiveBadge();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final open = ref.watch(marketOpenProvider);
    if (!open) return const SizedBox.shrink();
    const upColor = Color(0xFF22C55E);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: upColor.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _PulseDot(),
          SizedBox(width: 5),
          Text(
            'LIVE',
            style: TextStyle(
              color: upColor,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.6,
            ),
          ),
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot();

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, _) => Container(
        width: 6,
        height: 6,
        decoration: BoxDecoration(
          color: const Color(0xFF22C55E)
              .withValues(alpha: 0.5 + 0.5 * _ctrl.value),
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final positions = snap.positions;
    // Split holdings into cash equity vs F&O so the user can isolate either.
    final fnoCount = positions.where(_isFnoPosition).length;
    final stockCount = positions.length - fnoCount;
    // Only worth showing the segmented filter once there's actually a mix to
    // separate — a pure-stock (or pure-F&O) book needs no toggle.
    final showFilter = fnoCount > 0 && stockCount > 0;
    final filter =
        showFilter ? ref.watch(holdingsFilterProvider) : HoldingsFilter.all;
    final shown = switch (filter) {
      HoldingsFilter.all => positions,
      HoldingsFilter.stocks =>
        positions.where((p) => !_isFnoPosition(p)).toList(),
      HoldingsFilter.fno => positions.where(_isFnoPosition).toList(),
    };
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _EquityHero(snap: snap),
        const SizedBox(height: 14),
        _WalletRow(wallet: snap.wallet),
        const SizedBox(height: 14),
        _MetricsCard(snap: snap),
        if (snap.positions.isNotEmpty) ...[
          const SizedBox(height: 14),
          AllocationCard(positions: snap.positions),
        ],
        const SizedBox(height: 24),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              Text(
                'Holdings',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${positions.length}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.65),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (showFilter) ...[
          const SizedBox(height: 12),
          _HoldingsFilterBar(
            all: positions.length,
            stocks: stockCount,
            fno: fnoCount,
          ),
        ],
        const SizedBox(height: 10),
        if (positions.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: EmptyState(
              icon: Icons.show_chart,
              title: 'No open positions',
              subtitle:
                  'Pick a stock from your home feed or a watchlist to place your first trade.',
              actionLabel: 'Go to home',
              onAction: () =>
                  ref.read(shellTabIndexProvider.notifier).state = 0,
            ),
          )
        else
          for (final p in shown) ...[
            _PositionTile(position: p),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

class _EquityHero extends ConsumerWidget {
  const _EquityHero({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    // Live-overlaid totals — rebuilds only when the aggregate actually changes.
    final live =
        ref.watch(latestTicksProvider.select((m) => liveSummaryOf(snap, m)));
    final isUp = live.unrealizedPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    final pnlPct =
        live.invested > 0 ? (live.unrealizedPnL / live.invested) * 100 : 0.0;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.55),
            scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Total equity',
                  style: TextStyle(
                    color: scheme.onSurface.withValues(alpha: 0.65),
                    fontSize: 13,
                    letterSpacing: 0.3,
                  ),
                ),
              ),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AnalyticsScreen(),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.analytics_outlined,
                        size: 14,
                        color: scheme.onSurface.withValues(alpha: 0.75),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Analytics',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface.withValues(alpha: 0.75),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const SectorHeatmapScreen(),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.grid_view_outlined,
                        size: 14,
                        color: scheme.onSurface.withValues(alpha: 0.75),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Sectors',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface.withValues(alpha: 0.75),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              InkWell(
                borderRadius: BorderRadius.circular(8),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const PortfolioHistoryScreen(),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.timeline,
                        size: 14,
                        color: scheme.onSurface.withValues(alpha: 0.75),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'History',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: scheme.onSurface.withValues(alpha: 0.75),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            formatInr(live.totalEquity),
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isUp ? Icons.trending_up : Icons.trending_down,
                      color: color,
                      size: 14,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${isUp ? '+' : ''}${formatInr(live.unrealizedPnL)} '
                      '(${pnlPct.toStringAsFixed(2)}%)',
                      style: TextStyle(
                        color: color,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'unrealized',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WalletRow extends StatelessWidget {
  const _WalletRow({required this.wallet});
  final WalletInfo wallet;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _MiniCard(
            label: 'Cash balance',
            value: formatInr(wallet.balance),
            icon: Icons.account_balance_wallet_outlined,
            tint: const Color(0xFF22C55E),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: _MiniCard(
            label: 'Available',
            value: formatInr(wallet.available),
            icon: Icons.savings_outlined,
            tint: const Color(0xFF06B6D4),
          ),
        ),
      ],
    );
  }
}

class _MiniCard extends StatelessWidget {
  const _MiniCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color tint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: tint.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: tint, size: 15),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricsCard extends StatelessWidget {
  const _MetricsCard({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final s = snap.summary;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        children: [
          _MetricRow(label: 'Invested', value: formatInr(s.invested)),
          _MetricRow(label: 'Current value', value: formatInr(s.currentValue)),
          Container(
            height: 1,
            margin: const EdgeInsets.symmetric(vertical: 8),
            color: scheme.outlineVariant.withValues(alpha: 0.2),
          ),
          _MetricRow(
            label: 'Realized P&L (lifetime)',
            value:
                '${s.totalRealizedPnL >= 0 ? '+' : ''}${formatInr(s.totalRealizedPnL)}',
            valueColor:
                s.totalRealizedPnL >= 0 ? _upColor : _downColor,
          ),
          _MetricRow(
            label: 'Brokerage & taxes paid',
            value: formatInr(s.totalFeesPaid),
            valueColor: scheme.onSurface.withValues(alpha: 0.7),
          ),
          Builder(builder: (context) {
            // Win ratio over positions that have actually realized something
            // (a partial sell, a cover-short, a settlement). We deliberately
            // ignore zero-PnL positions so an opening leg of an existing
            // trade doesn't dilute the ratio toward 0.
            final settled = snap.positions
                .where((p) => p.realizedPnL != 0)
                .toList();
            if (settled.isEmpty) return const SizedBox.shrink();
            final winners =
                settled.where((p) => p.realizedPnL > 0).length;
            final ratio = winners / settled.length;
            final color = ratio >= 0.5 ? _upColor : _downColor;
            return _MetricRow(
              label: 'Win ratio (closed positions)',
              value: '${(ratio * 100).toStringAsFixed(1)}% '
                  '($winners / ${settled.length})',
              valueColor: color,
            );
          }),
        ],
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  const _MetricRow({
    required this.label,
    required this.value,
    this.valueColor,
  });

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12.5,
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.62),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: valueColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionTile extends ConsumerWidget {
  const _PositionTile({required this.position});
  final PortfolioPosition position;

  Future<void> _squareOff(BuildContext context, WidgetRef ref) async {
    // Closing a long means selling, closing a short means buying. Quantity
    // is always |position.quantity|; product matches the position's so we
    // close the exact same slot (an MIS long doesn't accidentally trigger
    // an MIS short on the CNC book).
    final isShort = position.quantity < 0;
    final isFno =
        position.exchange == 'NFO' || position.exchange == 'BFO';
    final wallet = ref.read(portfolioProvider).value?.wallet.balance ?? 0;
    final order = await showTradeSheet(
      context,
      side: isShort ? OrderSide.buy : OrderSide.sell,
      // F&O positions list under the underlying (e.g. NIFTY) but must be
      // squared off against the exact contract — pass the tradingsymbol so the
      // backend resolves the right instrument instead of "Symbol not found".
      symbol: isFno ? position.tradingsymbol : position.symbol,
      exchange: position.exchange,
      symboltoken: position.symboltoken,
      referencePrice: position.ltp,
      ownedQuantity: position.quantity,
      walletBalance: wallet,
      lotSize: position.lotSize,
      // Default to closing the whole position (it's already a whole-lot qty).
      initialQuantity: position.quantity.abs(),
    );
    if (order != null) {
      ref.invalidate(portfolioProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    // Live LTP overlay — this tile rebuilds only when its own symbol ticks.
    final liveLtp = ref.watch(
      latestTicksProvider.select((m) => m[tickKeyForPosition(position)]?.ltp),
    );
    final live = LivePosition.of(position, liveLtp);
    final isUp = live.unrealizedPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    final qty = position.quantity;
    final isShort = qty < 0;
    final isFno = isFnoExchange(position.exchange);
    // For derivatives show the actual contract (…CE / …PE / …FUT) instead of
    // the bare underlying, so a Call/Put holding reads clearly at a glance.
    final name =
        isFno ? position.tradingsymbol : companyNameFor(position.symbol);
    final kind = isFno ? fnoKind(position.tradingsymbol) : null;
    final ltp = live.ltp;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onLongPress: () => shareTrade(
        context,
        payload: ShareTradePayload.fromPosition(position),
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: position.symbol,
            tradingsymbol: position.tradingsymbol,
            symboltoken: position.symboltoken,
            exchange: position.exchange,
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          if (kind != null) ...[
                            FnoBadge(label: kind.label, color: kind.color),
                            const SizedBox(width: 4),
                          ],
                          _ProductBadge(intraday: position.isIntraday),
                          if (isShort) ...[
                            const SizedBox(width: 4),
                            _ShortBadge(),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${qty.abs()} @ ${formatInr(position.avgPrice)}',
                        style: TextStyle(
                          fontSize: 12,
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
                      ltp != null ? formatInr(ltp) : '—',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${isUp ? '+' : ''}${formatInr(live.unrealizedPnL)} '
                      '(${live.unrealizedPnLPct.toStringAsFixed(2)}%)',
                      style: TextStyle(
                        color: color,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 10),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.18),
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Invested ${formatInr(position.invested)} · Now '
                    '${formatInr(live.currentValue)}',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ),
                TextButton.icon(
                  onPressed: () => _squareOff(context, ref),
                  icon: const Icon(
                    Icons.close_fullscreen,
                    size: 14,
                    color: _downColor,
                  ),
                  label: const Text(
                    'Square off',
                    style: TextStyle(
                      color: _downColor,
                      fontWeight: FontWeight.w700,
                      fontSize: 12,
                    ),
                  ),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    minimumSize: const Size(0, 28),
                    backgroundColor: _downColor.withValues(alpha: 0.1),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
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

/// Segmented All / Stocks / F&O toggle above the holdings list. Each segment
/// carries its live count so the split is obvious before tapping.
class _HoldingsFilterBar extends ConsumerWidget {
  const _HoldingsFilterBar({
    required this.all,
    required this.stocks,
    required this.fno,
  });
  final int all;
  final int stocks;
  final int fno;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(holdingsFilterProvider);
    return Row(
      children: [
        _seg(context, ref, HoldingsFilter.all, 'All', all, selected),
        const SizedBox(width: 8),
        _seg(context, ref, HoldingsFilter.stocks, 'Stocks', stocks, selected),
        const SizedBox(width: 8),
        _seg(context, ref, HoldingsFilter.fno, 'F&O', fno, selected),
      ],
    );
  }

  Widget _seg(
    BuildContext context,
    WidgetRef ref,
    HoldingsFilter value,
    String label,
    int count,
    HoldingsFilter selected,
  ) {
    final scheme = Theme.of(context).colorScheme;
    final active = value == selected;
    return GestureDetector(
      onTap: () => ref.read(holdingsFilterProvider.notifier).state = value,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: active
              ? scheme.primary.withValues(alpha: 0.15)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: active
                ? scheme.primary.withValues(alpha: 0.6)
                : scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Text(
          '$label · $count',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: active
                ? scheme.primary
                : scheme.onSurface.withValues(alpha: 0.7),
          ),
        ),
      ),
    );
  }
}

class _ProductBadge extends StatelessWidget {
  const _ProductBadge({required this.intraday});
  final bool intraday;

  @override
  Widget build(BuildContext context) {
    final color =
        intraday ? const Color(0xFFF59E0B) : const Color(0xFF06B6D4);
    final label = intraday ? 'MIS' : 'CNC';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _ShortBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: _downColor.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(4),
      ),
      child: const Text(
        'SHORT',
        style: TextStyle(
          color: _downColor,
          fontSize: 9.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
