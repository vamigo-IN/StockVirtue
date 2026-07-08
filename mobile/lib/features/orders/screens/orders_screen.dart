import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/error_mapper.dart';
import '../../../core/money_format.dart';
import '../../../data/models/order.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/fno_badge.dart';
import '../../home/screens/shell_screen.dart';
import '../../notifications/notifications_provider.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../orders_providers.dart';
import '../orders_repository.dart';
import '../trade_notes_storage.dart';
import '../widgets/export_sheet.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

class OrdersScreen extends ConsumerStatefulWidget {
  const OrdersScreen({super.key});

  @override
  ConsumerState<OrdersScreen> createState() => _OrdersScreenState();
}

enum _OrdersFilter { all, pending, filled, cancelled, rejected, gtc }

extension on _OrdersFilter {
  String get label => switch (this) {
        _OrdersFilter.all => 'All',
        _OrdersFilter.pending => 'Pending',
        _OrdersFilter.filled => 'Filled',
        _OrdersFilter.cancelled => 'Cancelled',
        _OrdersFilter.rejected => 'Rejected',
        _OrdersFilter.gtc => 'GTC',
      };
}

/// "Good Till Cancelled" — the order persists across trading sessions
/// because it's a triggered (limit / SL / SL-L / trail) order on DELIVERY
/// product. MIS orders auto-square at 15:20 IST so they can't be GTC.
bool _isGtcOrder(OrderRecord o) =>
    o.isPending && o.isTriggered && !o.isIntraday;

class _OrdersScreenState extends ConsumerState<OrdersScreen> {
  _OrdersFilter _filter = _OrdersFilter.all;

  Iterable<OrderRecord> _apply(List<OrderRecord> list) {
    switch (_filter) {
      case _OrdersFilter.all:
        return list;
      case _OrdersFilter.pending:
        return list.where((o) => o.status == OrderStatus.pending);
      case _OrdersFilter.filled:
        return list.where((o) => o.status == OrderStatus.filled);
      case _OrdersFilter.cancelled:
        return list.where((o) => o.status == OrderStatus.cancelled);
      case _OrdersFilter.rejected:
        return list.where((o) => o.status == OrderStatus.rejected);
      case _OrdersFilter.gtc:
        return list.where(_isGtcOrder);
    }
  }

  @override
  Widget build(BuildContext context) {
    final orders = ref.watch(ordersListProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Orders',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.ios_share),
            tooltip: 'Export trades',
            onPressed: () => showExportSheet(context, ref),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final f in _OrdersFilter.values)
                    _FilterChip(
                      label: f.label,
                      selected: _filter == f,
                      onTap: () => setState(() => _filter = f),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(ordersListProvider);
          await ref.read(ordersListProvider.future);
        },
        child: orders.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
            ],
          ),
          data: (all) {
            final list = _apply(all).toList();
            final isAll = _filter == _OrdersFilter.all;
            if (list.isEmpty) {
              return ListView(
                children: [
                  const SizedBox(height: 64),
                  EmptyState(
                    icon: Icons.receipt_long,
                    title: isAll
                        ? 'No orders yet'
                        : 'No ${_filter.label.toLowerCase()} orders',
                    subtitle: isAll
                        ? 'Place a trade from your home feed to see it here.'
                        : null,
                    actionLabel: isAll ? 'Go to home' : null,
                    onAction: isAll
                        ? () =>
                            ref.read(shellTabIndexProvider.notifier).state = 0
                        : null,
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, i) => _OrderTile(order: list[i]),
            );
          },
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: selected
                ? scheme.primary
                : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected
                  ? scheme.onPrimary
                  : scheme.onSurface.withValues(alpha: 0.7),
              fontWeight: FontWeight.w700,
              fontSize: 12.5,
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderTile extends ConsumerStatefulWidget {
  const _OrderTile({required this.order});
  final OrderRecord order;

  @override
  ConsumerState<_OrderTile> createState() => _OrderTileState();
}

class _OrderTileState extends ConsumerState<_OrderTile> {
  bool _cancelling = false;

  /// Whether this order's threshold can be edited in place. MARKET
  /// fills at the next tick, so the sheet only makes sense for the
  /// limit-style variants.
  bool get _canModify {
    if (!widget.order.isPending) return false;
    return widget.order.type == OrderType.limit ||
        widget.order.type == OrderType.stopLoss ||
        widget.order.type == OrderType.stopLossLimit ||
        widget.order.type == OrderType.trailingStop;
  }

  Future<void> _openModifySheet() async {
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ModifyOrderSheet(order: widget.order),
    );
    if (result == true && mounted) {
      ref.invalidate(ordersListProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order updated')),
      );
    }
  }

  Future<void> _cancel() async {
    setState(() => _cancelling = true);
    try {
      await ref.read(ordersRepositoryProvider).cancel(widget.order.id);
      ref.invalidate(ordersListProvider);
      ref.invalidate(portfolioProvider);
      ref.read(notificationsProvider.notifier).push(
            kind: AppNotificationKind.orderCancelled,
            title: 'Cancelled ${widget.order.quantity} '
                '${widget.order.symbol}',
            body: '${widget.order.side == OrderSide.buy ? 'BUY' : 'SELL'} '
                'order on ${widget.order.exchange} cancelled',
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Order cancelled')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError(e, context: 'order-cancel')),
          backgroundColor: Colors.redAccent,
        ),
      );
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isBuy = order.side == OrderSide.buy;
    final sideColor = isBuy ? _upColor : _downColor;
    final scheme = Theme.of(context).colorScheme;
    final timeStr = _formatTime(order.createdAt);
    // Every pending USER order is cancellable on a learning platform —
    // including after-market MARKET orders queued for the next open (type
    // MARKET, so not "triggered") and resting limit/SL orders. System
    // square-off / expiry-settlement fills are never user-cancellable.
    final showCancel = order.isPending && !order.isAutoGenerated;
    final priceShown =
        order.fillPrice ?? order.limitPrice ?? order.triggerPrice;
    // For F&O show the actual contract (…CE / …PE / …FUT) instead of the bare
    // underlying, and colour-code Call/Put/Future.
    final isFno = isFnoExchange(order.exchange);
    final name = isFno ? order.tradingsymbol : companyNameFor(order.symbol);
    final kind = isFno ? fnoKind(order.tradingsymbol) : null;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: order.symbol,
            tradingsymbol: order.tradingsymbol,
            symboltoken: order.symboltoken,
            exchange: order.exchange,
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
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 34,
                height: 34,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: sideColor.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isBuy ? Icons.arrow_upward : Icons.arrow_downward,
                  color: sideColor,
                  size: 18,
                ),
              ),
              const SizedBox(width: 10),
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
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        if (kind != null) ...[
                          FnoBadge(label: kind.label, color: kind.color),
                          const SizedBox(width: 4),
                        ],
                        _StatusBadge(status: order.status),
                        if (_isGtcOrder(order)) ...[
                          const SizedBox(width: 4),
                          const _GtcBadge(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${isBuy ? 'BUY' : 'SELL'} ${order.quantity} • '
                      '${_typeLabel(order)} • '
                      '${order.isIntraday ? 'MIS' : 'CNC'}'
                      '${order.isAutoGenerated ? ' • Auto square-off' : ''}',
                      style: TextStyle(
                        color: scheme.onSurface.withValues(alpha: 0.65),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    priceShown != null ? formatInr(priceShown) : '—',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    timeStr,
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (order.notional != null || order.fees > 0 || showCancel) ...[
            const SizedBox(height: 10),
            Container(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.2),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                if (order.notional != null) ...[
                  Text(
                    'Value',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    formatInr(order.notional!),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
                if (order.fees > 0) ...[
                  const SizedBox(width: 12),
                  Text(
                    'Fees',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    formatInr(order.fees),
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
                const Spacer(),
                if (_canModify)
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: TextButton(
                      style: TextButton.styleFrom(
                        foregroundColor: scheme.primary,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        minimumSize: const Size(0, 28),
                      ),
                      onPressed: _cancelling ? null : _openModifySheet,
                      child: const Text(
                        'Modify',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                if (showCancel)
                  TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: _downColor,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      minimumSize: const Size(0, 28),
                    ),
                    onPressed: _cancelling ? null : _cancel,
                    child: _cancelling
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text(
                            'Cancel',
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                  ),
              ],
            ),
          ],
          if (order.rejectReason != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: _downColor.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                order.rejectReason!,
                style: TextStyle(
                  fontSize: 11.5,
                  color: _downColor.withValues(alpha: 0.85),
                ),
              ),
            ),
          ],
          _NoteRow(orderId: order.id),
        ],
        ),
      ),
    );
  }

  static String _formatTime(DateTime t) {
    final local = t.toLocal();
    final h = local.hour.toString().padLeft(2, '0');
    final m = local.minute.toString().padLeft(2, '0');
    return '${local.day}/${local.month} $h:$m';
  }

  static String _typeLabel(OrderRecord o) {
    if (o.isTrailingStop) return 'TRAIL';
    if (o.isStopLossLimit) return 'SL-L';
    if (o.isStopLoss) return 'SL';
    if (o.isLimit) return 'LIMIT';
    return 'MARKET';
  }
}

/// "GTC" pill shown next to the status badge on long-lived triggered
/// DELIVERY orders. Communicates that these orders survive the daily
/// auto-square pass that kills intraday positions at 15:20 IST and the
/// expiry-settlement that closes F&O on the contract's expiry day.
class _GtcBadge extends StatelessWidget {
  const _GtcBadge();

  @override
  Widget build(BuildContext context) {
    const tint = Color(0xFF06B6D4);
    return Tooltip(
      message:
          'Good Till Cancelled — this order persists across trading days '
          'until you cancel it or it triggers.',
      triggerMode: TooltipTriggerMode.longPress,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: tint.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: tint.withValues(alpha: 0.4), width: 0.8),
        ),
        child: const Text(
          'GTC',
          style: TextStyle(
            color: tint,
            fontSize: 9.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.6,
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final OrderStatus status;

  @override
  Widget build(BuildContext context) {
    late final Color color;
    late final String label;
    switch (status) {
      case OrderStatus.pending:
        color = const Color(0xFFF59E0B);
        label = 'PENDING';
        break;
      case OrderStatus.filled:
        color = _upColor;
        label = 'FILLED';
        break;
      case OrderStatus.cancelled:
        color =
            Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55);
        label = 'CANCELLED';
        break;
      case OrderStatus.rejected:
        color = _downColor;
        label = 'REJECTED';
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
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
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

/// Trade-journal row — shows the user's saved note for an order, or a quiet
/// "Add note" affordance when empty. Tap → bottom-sheet editor.
class _NoteRow extends ConsumerWidget {
  const _NoteRow({required this.orderId});
  final String orderId;

  Future<void> _edit(BuildContext context, WidgetRef ref) async {
    final current = ref.read(tradeNoteProvider(orderId)) ?? '';
    final controller = TextEditingController(text: current);
    final updated = await showModalBottomSheet<String?>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) {
        final viewInsets = MediaQuery.viewInsetsOf(ctx);
        return Padding(
          padding: EdgeInsets.fromLTRB(20, 8, 20, 24 + viewInsets.bottom),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Row(
                children: [
                  Icon(Icons.edit_note, size: 20),
                  SizedBox(width: 8),
                  Text(
                    'Trade journal',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                'Why this trade? What would you do differently? '
                'Notes stay on this device only.',
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(ctx)
                      .colorScheme
                      .onSurface
                      .withValues(alpha: 0.6),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: controller,
                autofocus: true,
                maxLines: 4,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText:
                      'e.g. breakout above 50DMA on heavy volume; '
                      'stop at 1860',
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (current.isNotEmpty)
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(ctx).pop(''),
                      icon: const Icon(Icons.delete_outline, size: 16),
                      label: const Text('Delete'),
                    ),
                  const Spacer(),
                  FilledButton(
                    onPressed: () =>
                        Navigator.of(ctx).pop(controller.text.trim()),
                    child: const Text('Save'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
    if (updated != null) {
      await ref.read(tradeNotesProvider.notifier).set(orderId, updated);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final note = ref.watch(tradeNoteProvider(orderId));
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () => _edit(context, ref),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          decoration: BoxDecoration(
            color: note == null
                ? scheme.surface.withValues(alpha: 0.5)
                : const Color(0xFFF59E0B).withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: note == null
                  ? scheme.outlineVariant.withValues(alpha: 0.3)
                  : const Color(0xFFF59E0B).withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            children: [
              Icon(
                note == null
                    ? Icons.note_add_outlined
                    : Icons.edit_note,
                size: 14,
                color: note == null
                    ? scheme.onSurface.withValues(alpha: 0.55)
                    : const Color(0xFFF59E0B),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  note ?? 'Add a journal note',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11.5,
                    color: note == null
                        ? scheme.onSurface.withValues(alpha: 0.55)
                        : scheme.onSurface,
                    fontStyle: note == null ? FontStyle.italic : null,
                    fontWeight: note == null
                        ? FontWeight.w500
                        : FontWeight.w600,
                    height: 1.35,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Edit a pending order's price + quantity in place. Visibility of the
/// price field depends on the order type:
///   * LIMIT / STOP_LOSS_LIMIT — limit price + quantity
///   * STOP_LOSS / TRAILING_STOP — trigger price + quantity
///   * STOP_LOSS_LIMIT also shows the trigger so both can be tuned.
class _ModifyOrderSheet extends ConsumerStatefulWidget {
  const _ModifyOrderSheet({required this.order});
  final OrderRecord order;

  @override
  ConsumerState<_ModifyOrderSheet> createState() => _ModifyOrderSheetState();
}

class _ModifyOrderSheetState extends ConsumerState<_ModifyOrderSheet> {
  late final TextEditingController _qtyC;
  late final TextEditingController _limitC;
  late final TextEditingController _trigC;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _qtyC = TextEditingController(text: '${widget.order.quantity}');
    _limitC = TextEditingController(
      text: widget.order.limitPrice != null
          ? widget.order.limitPrice!.toStringAsFixed(2)
          : '',
    );
    _trigC = TextEditingController(
      text: widget.order.triggerPrice != null
          ? widget.order.triggerPrice!.toStringAsFixed(2)
          : '',
    );
  }

  @override
  void dispose() {
    _qtyC.dispose();
    _limitC.dispose();
    _trigC.dispose();
    super.dispose();
  }

  bool get _showLimit =>
      widget.order.type == OrderType.limit ||
      widget.order.type == OrderType.stopLossLimit;
  bool get _showTrigger =>
      widget.order.type == OrderType.stopLoss ||
      widget.order.type == OrderType.stopLossLimit ||
      widget.order.type == OrderType.trailingStop;

  Future<void> _save() async {
    final qty = int.tryParse(_qtyC.text.trim());
    if (qty == null || qty <= 0) {
      setState(() => _error = 'Quantity must be a positive integer');
      return;
    }
    double? limit;
    double? trigger;
    if (_showLimit) {
      limit = double.tryParse(_limitC.text.trim());
      if (limit == null || limit <= 0) {
        setState(() => _error = 'Limit price must be positive');
        return;
      }
    }
    if (_showTrigger) {
      trigger = double.tryParse(_trigC.text.trim());
      if (trigger == null || trigger <= 0) {
        setState(() => _error = 'Trigger price must be positive');
        return;
      }
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).modify(
            widget.order.id,
            quantity: qty == widget.order.quantity ? null : qty,
            limitPrice:
                _showLimit && limit != widget.order.limitPrice ? limit : null,
            triggerPrice: _showTrigger && trigger != widget.order.triggerPrice
                ? trigger
                : null,
          );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = friendlyError(e, context: 'order-modify'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final viewInsets = MediaQuery.viewInsetsOf(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 24 + viewInsets.bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Modify ${widget.order.symbol}',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            '${widget.order.side == OrderSide.buy ? 'BUY' : 'SELL'} · '
            '${_typeLabel(widget.order.type)} · ${widget.order.exchange}',
            style: TextStyle(
              fontSize: 12,
              color: scheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _qtyC,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Quantity',
              prefixIcon: Icon(Icons.numbers),
            ),
          ),
          if (_showLimit) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _limitC,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Limit price (₹)',
                prefixIcon: Icon(Icons.price_change_outlined),
              ),
            ),
          ],
          if (_showTrigger) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _trigC,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Trigger price (₹)',
                prefixIcon: Icon(Icons.flash_on),
              ),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 10,
                vertical: 8,
              ),
              decoration: BoxDecoration(
                color: Colors.redAccent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(8),
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
          const SizedBox(height: 18),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
            ),
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'Save changes',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
          ),
        ],
      ),
    );
  }
}

String _typeLabel(OrderType t) {
  switch (t) {
    case OrderType.market:
      return 'Market';
    case OrderType.limit:
      return 'Limit';
    case OrderType.stopLoss:
      return 'SL-M';
    case OrderType.stopLossLimit:
      return 'SL-L';
    case OrderType.trailingStop:
      return 'Trailing SL';
  }
}

