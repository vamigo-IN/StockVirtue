import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/error_mapper.dart';
import '../../../data/models/order.dart';
import '../../../widgets/error_retry_view.dart';
import '../../market/market_repository.dart';
import '../../notifications/notifications_provider.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../watchlists/watchlists_providers.dart';
import '../orders_providers.dart';
import '../orders_repository.dart';

/// Multi-leg basket placement. The user composes a list of legs (symbol +
/// side + qty + product), reviews the basket, then submits. Each leg is
/// placed sequentially server-side so margin reservations from earlier
/// legs are committed before later legs run their checks.
class BasketScreen extends ConsumerStatefulWidget {
  const BasketScreen({super.key});

  @override
  ConsumerState<BasketScreen> createState() => _BasketScreenState();
}

class _BasketScreenState extends ConsumerState<BasketScreen> {
  final List<_DraftLeg> _legs = [];
  bool _submitting = false;
  String? _error;

  Future<void> _addLeg() async {
    final picked = await Navigator.of(context).push<StockSearchResult>(
      MaterialPageRoute(builder: (_) => const _PickSymbolScreen()),
    );
    if (picked == null) return;
    setState(() => _legs.add(_DraftLeg.from(picked)));
  }

  Future<void> _submit() async {
    if (_legs.isEmpty) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(ordersRepositoryProvider).placeBasket(
            _legs
                .map((l) => BasketLeg(
                      symbol: l.symbol,
                      exchange: l.exchange,
                      side: l.side,
                      quantity: l.qty,
                      product: l.product,
                    ))
                .toList(),
          );
      ref.invalidate(portfolioProvider);
      ref.invalidate(ordersListProvider);
      ref.invalidate(watchlistsListProvider);
      // Surface the outcome as a single notification — easier to follow
      // than one toast per leg when 5 + legs land at once.
      final notifier = ref.read(notificationsProvider.notifier);
      if (result.failed == 0) {
        notifier.push(
          kind: AppNotificationKind.orderPlaced,
          title: 'Basket placed — ${result.filled} legs',
          body: 'All legs accepted by the trade engine.',
        );
      } else {
        final reasons = result.legs
            .where((l) => !l.ok)
            .map((l) => l.error)
            .whereType<String>()
            .take(2)
            .join(' · ');
        notifier.push(
          kind: AppNotificationKind.orderRejected,
          title:
              'Basket partial — ${result.filled} ok, ${result.failed} failed',
          body: reasons.isEmpty ? 'See orders for details' : reasons,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(result);
    } catch (e) {
      setState(() => _error = friendlyError(e, context: 'basket'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Basket order',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 140),
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: scheme.tertiaryContainer.withValues(alpha: 0.3),
              borderRadius: BorderRadius.circular(12),
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
                    'Compose multiple legs and submit as one basket. Each '
                    'leg runs through the same margin / cash checks as a '
                    'normal market order. Partial fills are possible.',
                    style: TextStyle(
                      fontSize: 12,
                      color: scheme.onSurface.withValues(alpha: 0.7),
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          if (_legs.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 28),
              child: Column(
                children: [
                  Icon(
                    Icons.layers_clear_outlined,
                    size: 48,
                    color: scheme.onSurface.withValues(alpha: 0.25),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'No legs yet',
                    style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.65),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Add stocks below to start building the basket.',
                    style: TextStyle(
                      color: scheme.onSurface.withValues(alpha: 0.5),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            )
          else
            for (var i = 0; i < _legs.length; i++) ...[
              _LegTile(
                index: i,
                leg: _legs[i],
                onChanged: (l) => setState(() => _legs[i] = l),
                onRemove: () => setState(() => _legs.removeAt(i)),
              ),
              const SizedBox(height: 10),
            ],
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _addLeg,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Add leg'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.redAccent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _error!,
                style: const TextStyle(
                  color: Colors.redAccent,
                  fontSize: 12.5,
                ),
              ),
            ),
          ],
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton(
            onPressed: _legs.isEmpty || _submitting ? null : _submit,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(54),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _submitting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    _legs.isEmpty
                        ? 'Add at least one leg'
                        : 'Submit basket (${_legs.length} legs)',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _LegTile extends StatelessWidget {
  const _LegTile({
    required this.index,
    required this.leg,
    required this.onChanged,
    required this.onRemove,
  });
  final int index;
  final _DraftLeg leg;
  final ValueChanged<_DraftLeg> onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 8, 12),
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
                width: 22,
                height: 22,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${index + 1}',
                  style: TextStyle(
                    color: scheme.primary,
                    fontWeight: FontWeight.w800,
                    fontSize: 11,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      companyNameFor(leg.symbol),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      '${leg.exchange} • ${leg.symbol}',
                      style: TextStyle(
                        fontSize: 11,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.close, size: 18),
                visualDensity: VisualDensity.compact,
                onPressed: onRemove,
              ),
            ],
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.only(left: 30, right: 8),
            child: Row(
              children: [
                _SideToggle(
                  side: leg.side,
                  onChanged: (s) => onChanged(leg.copyWith(side: s)),
                ),
                const SizedBox(width: 10),
                _ProductToggle(
                  product: leg.product,
                  onChanged: (p) => onChanged(leg.copyWith(product: p)),
                ),
                const Spacer(),
                _QtyStepper(
                  qty: leg.qty,
                  onChanged: (q) => onChanged(leg.copyWith(qty: q)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SideToggle extends StatelessWidget {
  const _SideToggle({required this.side, required this.onChanged});
  final OrderSide side;
  final ValueChanged<OrderSide> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget chip(OrderSide s, String label, Color tint) {
      final active = s == side;
      return InkWell(
        borderRadius: BorderRadius.circular(7),
        onTap: () => onChanged(s),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: active
                ? tint.withValues(alpha: 0.2)
                : scheme.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? tint : scheme.onSurface.withValues(alpha: 0.65),
              fontWeight: FontWeight.w800,
              fontSize: 11,
              letterSpacing: 0.3,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          chip(OrderSide.buy, 'BUY', const Color(0xFF22C55E)),
          chip(OrderSide.sell, 'SELL', const Color(0xFFEF4444)),
        ],
      ),
    );
  }
}

class _ProductToggle extends StatelessWidget {
  const _ProductToggle({required this.product, required this.onChanged});
  final OrderProduct product;
  final ValueChanged<OrderProduct> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget chip(OrderProduct p, String label, Color tint) {
      final active = p == product;
      return InkWell(
        borderRadius: BorderRadius.circular(7),
        onTap: () => onChanged(p),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: active
                ? tint.withValues(alpha: 0.2)
                : scheme.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? tint : scheme.onSurface.withValues(alpha: 0.65),
              fontWeight: FontWeight.w800,
              fontSize: 10.5,
              letterSpacing: 0.3,
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          chip(OrderProduct.delivery, 'CNC', const Color(0xFF06B6D4)),
          chip(OrderProduct.intraday, 'MIS', const Color(0xFFF59E0B)),
        ],
      ),
    );
  }
}

class _QtyStepper extends StatelessWidget {
  const _QtyStepper({required this.qty, required this.onChanged});
  final int qty;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(9),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.remove, size: 16),
            onPressed: qty > 1 ? () => onChanged(qty - 1) : null,
          ),
          SizedBox(
            width: 36,
            child: Text(
              '$qty',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
                fontSize: 13,
              ),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.add, size: 16),
            onPressed: () => onChanged(qty + 1),
          ),
        ],
      ),
    );
  }
}

class _DraftLeg {
  final String symbol;
  final String tradingsymbol;
  final String exchange;
  final OrderSide side;
  final OrderProduct product;
  final int qty;

  const _DraftLeg({
    required this.symbol,
    required this.tradingsymbol,
    required this.exchange,
    required this.side,
    required this.product,
    required this.qty,
  });

  factory _DraftLeg.from(StockSearchResult r) => _DraftLeg(
        symbol: r.symbol,
        tradingsymbol: r.tradingsymbol,
        exchange: r.exchange,
        side: OrderSide.buy,
        product: OrderProduct.delivery,
        qty: 1,
      );

  _DraftLeg copyWith({
    OrderSide? side,
    OrderProduct? product,
    int? qty,
  }) =>
      _DraftLeg(
        symbol: symbol,
        tradingsymbol: tradingsymbol,
        exchange: exchange,
        side: side ?? this.side,
        product: product ?? this.product,
        qty: qty ?? this.qty,
      );
}

/// Search-and-pick destination. We re-route StockSearchScreen here by
/// wrapping it — the search screen already handles add-mode vs detail-mode,
/// we just need the "tap result → return to caller" behaviour.
class _PickSymbolScreen extends StatelessWidget {
  const _PickSymbolScreen();

  @override
  Widget build(BuildContext context) {
    return _PickSymbolBody();
  }
}

/// Custom thin wrapper that intercepts tap and pops with the chosen result.
class _PickSymbolBody extends ConsumerStatefulWidget {
  @override
  ConsumerState<_PickSymbolBody> createState() => _PickSymbolBodyState();
}

class _PickSymbolBodyState extends ConsumerState<_PickSymbolBody> {
  final _controller = TextEditingController();
  String _exchange = 'NSE';
  Future<List<StockSearchResult>>? _resultsFuture;

  void _runSearch() {
    final q = _controller.text.trim();
    setState(() {
      _resultsFuture = q.isEmpty
          ? null
          : ref
              .read(marketRepositoryProvider)
              .search(q, exchange: _exchange);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'Search to add a leg',
            border: InputBorder.none,
          ),
          onChanged: (_) => _runSearch(),
        ),
        actions: [
          PopupMenuButton<String>(
            initialValue: _exchange,
            onSelected: (v) {
              setState(() => _exchange = v);
              _runSearch();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'NSE', child: Text('NSE')),
              PopupMenuItem(value: 'BSE', child: Text('BSE')),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Center(
                child: Text(
                  _exchange,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ),
        ],
      ),
      body: _resultsFuture == null
          ? Center(
              child: Text(
                'Type a symbol or company name',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            )
          : FutureBuilder<List<StockSearchResult>>(
              future: _resultsFuture,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snap.hasError) {
                  return ErrorRetryView(
                    error: snap.error,
                    onRetry: _runSearch,
                  );
                }
                final list = snap.data ?? const [];
                if (list.isEmpty) {
                  return const Center(child: Text('No matches'));
                }
                return ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final r = list[i];
                    return ListTile(
                      title: Text(
                        r.symbol,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text('${r.exchange} • ${r.tradingsymbol}'),
                      trailing: const Icon(Icons.add_circle_outline),
                      onTap: () => Navigator.of(context).pop(r),
                    );
                  },
                );
              },
            ),
    );
  }
}
