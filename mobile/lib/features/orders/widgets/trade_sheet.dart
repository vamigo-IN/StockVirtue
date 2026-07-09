import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/analytics.dart';
import '../../../core/error_mapper.dart';
import '../../../core/fees.dart';
import '../../../core/preferences.dart';
import '../../../data/models/order.dart';
import '../../../data/models/tick.dart';
import '../../notifications/notifications_provider.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../ticks/ticks_providers.dart';
import '../../watchlists/watchlists_providers.dart';
import '../orders_providers.dart';
import '../orders_repository.dart';

Future<OrderRecord?> showTradeSheet(
  BuildContext context, {
  required OrderSide side,
  required String symbol,
  required String exchange,
  required String symboltoken,
  required double? referencePrice,
  required int ownedQuantity,
  required double walletBalance,
  int reservedQuantity = 0,
  int lotSize = 1,
  int? initialQuantity,
}) {
  return showModalBottomSheet<OrderRecord>(
    context: context,
    isScrollControlled: true,
    // Cap the sheet height so it can't exceed the screen; the body scrolls.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.of(context).size.height * 0.92,
    ),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: _TradeSheet(
        side: side,
        symbol: symbol,
        exchange: exchange,
        symboltoken: symboltoken,
        referencePrice: referencePrice,
        ownedQuantity: ownedQuantity,
        reservedQuantity: reservedQuantity < 0 ? 0 : reservedQuantity,
        walletBalance: walletBalance,
        lotSize: lotSize < 1 ? 1 : lotSize,
        initialQuantity: initialQuantity,
      ),
    ),
  );
}

class _TradeSheet extends ConsumerStatefulWidget {
  const _TradeSheet({
    required this.side,
    required this.symbol,
    required this.exchange,
    required this.symboltoken,
    required this.referencePrice,
    required this.ownedQuantity,
    required this.reservedQuantity,
    required this.walletBalance,
    required this.lotSize,
    this.initialQuantity,
  });

  final OrderSide side;
  final String symbol;
  final String exchange;
  final String symboltoken;
  final double? referencePrice;
  final int ownedQuantity;

  /// Units of [ownedQuantity] already locked by resting SELL orders. The sheet
  /// caps a sell at (owned − reserved) since reserved units can't be sold twice.
  final int reservedQuantity;
  final double walletBalance;

  /// Contract lot size. 1 for cash equity; the F&O lot (e.g. 65) for
  /// derivatives — quantity is then constrained to whole multiples of this.
  final int lotSize;

  /// Pre-selected quantity (e.g. the full position when squaring off). Falls
  /// back to one lot / 1 unit when null.
  final int? initialQuantity;

  @override
  ConsumerState<_TradeSheet> createState() => _TradeSheetState();
}

class _TradeSheetState extends ConsumerState<_TradeSheet> {
  late OrderType _type;
  late OrderProduct _product;
  late int _qty;
  bool _busy = false;
  String? _error;
  late final TextEditingController _limitController;
  late final TextEditingController _triggerController;
  late final TextEditingController _trailController;

  bool get _isBuy => widget.side == OrderSide.buy;
  bool get _isLimit => _type == OrderType.limit;
  bool get _isStopLoss => _type == OrderType.stopLoss;
  bool get _isStopLossLimit => _type == OrderType.stopLossLimit;
  bool get _isTrailing => _type == OrderType.trailingStop;
  bool get _needsLimit => _isLimit || _isStopLossLimit;
  bool get _needsTrigger => _isStopLoss || _isStopLossLimit;
  bool get _needsTrail => _isTrailing;

  String get _key => '${widget.exchange}:${widget.symboltoken}';

  @override
  void initState() {
    super.initState();
    // Seed type/product from the user's saved defaults so the trade sheet
    // opens on the order shape they actually use most. `prefsProvider`
    // returns the AppPreferences default until storage has loaded, so the
    // first ever tap still gets sensible MARKET / DELIVERY values.
    final prefs = ref.read(prefsProvider);
    _type = prefs.defaultOrderType;
    _product = prefs.defaultProduct;
    // Start at the pre-selected quantity (e.g. full position on square-off),
    // else one lot for F&O / 1 unit for cash.
    _qty = widget.initialQuantity ?? (widget.lotSize > 1 ? widget.lotSize : 1);
    final ref0 = widget.referencePrice;
    final defaultStr = ref0 != null ? ref0.toStringAsFixed(2) : '';
    _limitController = TextEditingController(text: defaultStr);
    _triggerController = TextEditingController(text: defaultStr);
    _trailController = TextEditingController(text: '');
  }

  @override
  void dispose() {
    _limitController.dispose();
    _triggerController.dispose();
    _trailController.dispose();
    super.dispose();
  }

  double _livePrice(Tick? tick) => tick?.ltp ?? widget.referencePrice ?? 0;

  double get _limitPrice => double.tryParse(_limitController.text) ?? 0;
  double get _triggerPrice => double.tryParse(_triggerController.text) ?? 0;
  double get _trailAmount => double.tryParse(_trailController.text) ?? 0;

  /// Price the user effectively commits to for reservation / notional preview.
  double get _reservationPrice {
    if (_isLimit || _isStopLossLimit) return _limitPrice;
    if (_isStopLoss) return _triggerPrice;
    return widget.referencePrice ?? 0;
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await ref
          .read(ordersRepositoryProvider)
          .place(
            symbol: widget.symbol,
            exchange: widget.exchange,
            side: widget.side,
            quantity: _qty,
            type: _type,
            product: _product,
            limitPrice: _needsLimit ? _limitPrice : null,
            triggerPrice: _needsTrigger ? _triggerPrice : null,
            trailAmount: _needsTrail ? _trailAmount : null,
          );
      ref.invalidate(portfolioProvider);
      ref.invalidate(ordersListProvider);
      ref.invalidate(watchlistsListProvider);
      Analytics.instance.logTrade(
        side: widget.side == OrderSide.buy ? 'buy' : 'sell',
        symbol: widget.symbol,
        quantity: order.quantity,
        orderType: _typeLabelFor(_type),
        status: order.status.name,
        value: order.notional,
      );
      // Push an in-app notification — MARKET fills immediately, the others
      // sit pending until the limit-watcher fires.
      final notifications = ref.read(notificationsProvider.notifier);
      final verb = widget.side == OrderSide.buy ? 'Bought' : 'Sold';
      final side = widget.side == OrderSide.buy ? 'BUY' : 'SELL';
      if (order.status == OrderStatus.filled) {
        final px = order.fillPrice?.toStringAsFixed(2) ?? '?';
        unawaited(
          notifications.push(
            kind: AppNotificationKind.orderFilled,
            title: '$verb ${order.quantity} ${widget.symbol} @ ₹$px',
            body:
                '${widget.exchange} • ${_typeLabelFor(_type)} • '
                '${_product == OrderProduct.intraday ? 'MIS' : 'CNC'}',
          ),
        );
      } else if (order.status == OrderStatus.rejected) {
        unawaited(
          notifications.push(
            kind: AppNotificationKind.orderRejected,
            title: '$side rejected — ${widget.symbol}',
            body: order.rejectReason ?? 'Order rejected by the trade engine',
          ),
        );
      } else {
        // A MARKET order that didn't fill immediately was queued because the
        // market is closed — it executes at the open price when the market
        // next opens. Other pending types wait for their price trigger.
        final isAfterMarket = _type == OrderType.market;
        unawaited(
          notifications.push(
            kind: AppNotificationKind.orderPlaced,
            title: '$side ${order.quantity} ${widget.symbol} '
                '${isAfterMarket ? 'queued' : 'pending'}',
            body: isAfterMarket
                ? 'Market is closed — this order will execute at the '
                    'open price when the market reopens.'
                : '${_typeLabelFor(_type)} order on ${widget.exchange} — '
                    'waiting for trigger',
          ),
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(order);
    } catch (e) {
      setState(() => _error = friendlyError(e, context: 'trade'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Lot-constrained instrument (F&O). Quantity must be whole multiples of the
  /// lot size, with the lot size itself as the minimum.
  bool get _isLotted => widget.lotSize > 1;
  int get _step => _isLotted ? widget.lotSize : 1;
  int get _lots => widget.lotSize > 0 ? _qty ~/ widget.lotSize : _qty;

  String _typeLabelFor(OrderType t) => switch (t) {
    OrderType.market => 'MARKET',
    OrderType.limit => 'LIMIT',
    OrderType.stopLoss => 'SL',
    OrderType.stopLossLimit => 'SL-L',
    OrderType.trailingStop => 'TRAIL',
  };

  int get _maxQty {
    final raw = _rawMaxQty;
    if (_step <= 1) return raw;
    return raw ~/ _step * _step; // largest whole-lot quantity ≤ raw
  }

  /// Sellable quantity = owned minus whatever resting orders have reserved.
  int get _availableToSell {
    final avail = widget.ownedQuantity - widget.reservedQuantity;
    return avail < 0 ? 0 : avail;
  }

  int get _rawMaxQty {
    if (!_isBuy) {
      // Short-selling is disabled — you can only sell what you hold, minus any
      // units reserved by resting orders (0 ⇒ can't submit).
      return _availableToSell;
    }
    final price = _reservationPrice;
    if (price <= 0) return 0;
    return (widget.walletBalance / price).floor();
  }

  Widget _fieldLabel(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.6,
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55),
      ),
    ),
  );

  String _ctaLabel(double notional) {
    final ts = _triggerPrice.toStringAsFixed(2);
    final ls = _limitPrice.toStringAsFixed(2);
    final trail = _trailAmount.toStringAsFixed(2);
    final verb = _isBuy ? 'Buy' : 'Sell';
    if (_isTrailing) return '$verb with trailing stop ₹$trail';
    if (_isStopLossLimit) {
      return '$verb SL-L trigger ₹$ts → limit ₹$ls';
    }
    if (_isStopLoss) return '$verb SL trigger ₹$ts';
    if (_isLimit) return 'Place $verb limit @ ₹$ls';
    return '$verb ${widget.symbol} @ market';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.6);
    final tick = ref.watch(latestTicksProvider.select<Tick?>((m) => m[_key]));
    final livePrice = _livePrice(tick);
    final orderPrice = _reservationPrice;
    final notional = orderPrice * _qty;
    final accent = _isBuy ? Colors.greenAccent : Colors.redAccent;

    final canSubmit =
        !_busy &&
        _qty > 0 &&
        _qty <= _maxQty &&
        orderPrice > 0 &&
        (!_needsLimit || _limitController.text.trim().isNotEmpty) &&
        (!_needsTrigger || _triggerController.text.trim().isNotEmpty) &&
        (!_needsTrail ||
            (_trailController.text.trim().isNotEmpty && _trailAmount > 0));

    String? hint;
    if (_needsTrigger && livePrice > 0 && _triggerPrice > 0) {
      if (_isBuy && _triggerPrice <= livePrice) {
        hint = 'Buy trigger usually sits ABOVE current price.';
      } else if (!_isBuy && _triggerPrice >= livePrice) {
        hint = 'Sell trigger usually sits BELOW current price.';
      }
    }
    // Whole position locked by resting orders — tell the user how to free it,
    // instead of leaving the CTA silently disabled at "0 lots".
    if (!_isBuy && widget.reservedQuantity > 0 && _availableToSell == 0) {
      hint = 'All ${widget.ownedQuantity} units are reserved by open orders. '
          'Cancel them from the Orders tab to sell.';
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: scheme.onSurface.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '${_isBuy ? 'Buy' : 'Sell'} ${widget.symbol}',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 4),
            Text(
              '${widget.exchange} • LTP ₹${livePrice.toStringAsFixed(2)}',
              style: TextStyle(color: muted),
            ),
            const SizedBox(height: 20),
            _fieldLabel('Product'),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Delivery'),
                  selected: _product == OrderProduct.delivery,
                  onSelected: (_) =>
                      setState(() => _product = OrderProduct.delivery),
                ),
                ChoiceChip(
                  label: const Text('Intraday'),
                  selected: _product == OrderProduct.intraday,
                  onSelected: (_) =>
                      setState(() => _product = OrderProduct.intraday),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _fieldLabel('Order type'),
            // Wrap (not SegmentedButton): five segments + large system fonts
            // would otherwise wrap each label and stretch the control downward.
            // Chips flow onto a second row gracefully instead.
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final t in OrderType.values)
                  ChoiceChip(
                    label: Text(switch (t) {
                      OrderType.market => 'Market',
                      OrderType.limit => 'Limit',
                      OrderType.stopLoss => 'SL',
                      OrderType.stopLossLimit => 'SL-L',
                      OrderType.trailingStop => 'Trail',
                    }),
                    selected: _type == t,
                    onSelected: (_) => setState(() => _type = t),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            if (_needsTrigger || _needsTrail || _needsLimit)
              _fieldLabel('Price'),
            if (_needsTrigger)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _triggerController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Trigger price (₹)',
                    prefixText: '₹ ',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            if (_needsTrail)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _trailController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  decoration: InputDecoration(
                    labelText: 'Trail amount (₹)',
                    prefixText: '₹ ',
                    helperText: livePrice > 0
                        ? 'Initial trigger ≈ ₹${(livePrice - _trailAmount).toStringAsFixed(2)}'
                        : 'Trigger ratchets up with price',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            if (_needsLimit)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: TextField(
                  controller: _limitController,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Limit price (₹)',
                    prefixText: '₹ ',
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            if (hint != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  hint,
                  style: const TextStyle(color: Colors.amber, fontSize: 12),
                ),
              ),
            _fieldLabel('Quantity'),
            Row(
              children: [
                Expanded(
                  child: Text(
                    _isBuy
                        ? 'Available ₹${widget.walletBalance.toStringAsFixed(2)}'
                        : widget.reservedQuantity > 0
                        ? 'You hold ${widget.ownedQuantity} · '
                            '${widget.reservedQuantity} reserved'
                        : 'You hold ${widget.ownedQuantity}',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(
                        context,
                      ).colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  _isLotted
                      ? 'Max ${_maxQty ~/ widget.lotSize} lots'
                      : 'Max $_maxQty',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                IconButton.filledTonal(
                  onPressed: _qty - _step >= _step
                      ? () => setState(() => _qty -= _step)
                      : null,
                  icon: const Icon(Icons.remove),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    // F&O: a non-editable lots display (steps by the lot only),
                    // so quantity can't be set to a non-lot value. Equity: a
                    // free-entry quantity field.
                    child: _isLotted
                        ? Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '$_lots',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              Text(
                                _lots == 1 ? 'lot' : 'lots',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Theme.of(context).colorScheme.onSurface
                                      .withValues(alpha: 0.55),
                                ),
                              ),
                            ],
                          )
                        : TextField(
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w600,
                            ),
                            controller: TextEditingController(text: '$_qty')
                              ..selection = TextSelection.collapsed(
                                offset: '$_qty'.length,
                              ),
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                            ],
                            decoration: const InputDecoration(
                              labelText: 'Quantity',
                            ),
                            onChanged: (v) {
                              final n = int.tryParse(v) ?? 0;
                              setState(() => _qty = n);
                            },
                          ),
                  ),
                ),
                IconButton.filledTonal(
                  onPressed: _qty + _step <= _maxQty
                      ? () => setState(() => _qty += _step)
                      : null,
                  icon: const Icon(Icons.add),
                ),
              ],
            ),
            if (_isLotted) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(
                  '$_lots × ${widget.lotSize} = $_qty units · lot size '
                  '${widget.lotSize}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(
                      context,
                    ).colorScheme.onSurface.withValues(alpha: 0.6),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 24),
            Builder(
              builder: (context) {
                final feeEst = estimateFees(
                  side: _isBuy ? 'BUY' : 'SELL',
                  exchange: widget.exchange,
                  notional: notional,
                  intraday: _product == OrderProduct.intraday,
                );
                final outflow = _isBuy
                    ? notional + feeEst.total
                    : notional - feeEst.total;
                return Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            _needsLimit || _isStopLoss
                                ? 'Reserved'
                                : 'Notional',
                          ),
                          Text(
                            '₹${notional.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              'Est. fees (STT, GST, etc.)',
                              style: TextStyle(color: muted, fontSize: 12),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '₹${feeEst.total.toStringAsFixed(2)}',
                            style: TextStyle(color: muted, fontSize: 12),
                          ),
                        ],
                      ),
                      const Divider(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(_isBuy ? 'You pay' : 'You receive'),
                          Text(
                            '₹${outflow.toStringAsFixed(2)}',
                            style: const TextStyle(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                );
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: accent,
                foregroundColor: Colors.black,
                minimumSize: const Size.fromHeight(52),
              ),
              onPressed: canSubmit ? _submit : null,
              child: _busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(
                      _ctaLabel(notional),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
