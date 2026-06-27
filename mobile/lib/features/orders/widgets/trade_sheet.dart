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
import '../../market/market_repository.dart';
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

  // Live-preview state — populated lazily when the user taps "Verify with
  // broker preview" so we don't fire SmartAPI calls on every keystroke.
  BrokeragePreview? _brokeragePreview;
  MarginPreview? _marginPreview;
  bool _previewLoading = false;
  String? _previewError;

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

  Future<void> _loadPreview() async {
    if (_previewLoading) return;
    setState(() {
      _previewLoading = true;
      _previewError = null;
    });
    try {
      final price = _reservationPrice > 0
          ? _reservationPrice
          : (widget.referencePrice ?? 0);
      if (price <= 0 || _qty <= 0) {
        throw StateError('Set price and quantity first');
      }
      final repo = ref.read(marketRepositoryProvider);
      final tradeType = _isBuy ? 'BUY' : 'SELL';
      // Map our OrderProduct to SmartAPI's expected vocabulary.
      // CARRYFORWARD is the F&O equivalent of DELIVERY.
      final isFno = widget.exchange == 'NFO' || widget.exchange == 'BFO';
      final productType = _product == OrderProduct.intraday
          ? 'INTRADAY'
          : (isFno ? 'CARRYFORWARD' : 'DELIVERY');
      final orderType = _isLimit
          ? 'LIMIT'
          : _isStopLoss
          ? 'STOPLOSS_MARKET'
          : _isStopLossLimit
          ? 'STOPLOSS_LIMIT'
          : 'MARKET';

      final results = await Future.wait([
        repo.getBrokeragePreview(
          exchange: widget.exchange,
          symbolName: widget.symbol,
          token: widget.symboltoken,
          quantity: _qty,
          price: price,
          productType: productType,
          transactionType: tradeType,
        ),
        repo.getMarginPreview(
          exchange: widget.exchange,
          qty: _qty,
          price: price,
          productType: productType,
          token: widget.symboltoken,
          tradeType: tradeType,
          orderType: orderType,
          triggerPrice: _needsTrigger ? _triggerPrice : null,
        ),
      ]);
      if (!mounted) return;
      setState(() {
        _brokeragePreview = results[0] as BrokeragePreview;
        _marginPreview = results[1] as MarginPreview;
      });
    } catch (e) {
      if (mounted) {
        setState(() => _previewError = friendlyError(e, context: 'trade'));
      }
    } finally {
      if (mounted) setState(() => _previewLoading = false);
    }
  }

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

  int get _rawMaxQty {
    if (!_isBuy) {
      // Short-selling is disabled — you can only sell what you hold, so the
      // sell quantity is capped at the owned position (0 ⇒ can't submit).
      return widget.ownedQuantity;
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
                  color: Colors.white.withValues(alpha: 0.3),
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
              style: TextStyle(color: Colors.white.withValues(alpha: 0.6)),
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
                    color: Colors.white.withValues(alpha: 0.05),
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
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.6),
                                fontSize: 12,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            '₹${feeEst.total.toStringAsFixed(2)}',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.6),
                              fontSize: 12,
                            ),
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
                      const SizedBox(height: 8),
                      _LivePreviewSection(
                        loading: _previewLoading,
                        error: _previewError,
                        brokerage: _brokeragePreview,
                        margin: _marginPreview,
                        isFno:
                            widget.exchange == 'NFO' ||
                            widget.exchange == 'BFO',
                        onLoad: _loadPreview,
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

/// Fetches authoritative broker fee + margin numbers from SmartAPI when
/// the user taps "Verify with broker preview". Folded into the existing
/// summary card so the comparison sits next to our local estimate.
class _LivePreviewSection extends StatelessWidget {
  const _LivePreviewSection({
    required this.loading,
    required this.error,
    required this.brokerage,
    required this.margin,
    required this.isFno,
    required this.onLoad,
  });

  final bool loading;
  final String? error;
  final BrokeragePreview? brokerage;
  final MarginPreview? margin;
  final bool isFno;
  final VoidCallback onLoad;

  @override
  Widget build(BuildContext context) {
    if (brokerage == null && margin == null && error == null) {
      return Padding(
        padding: const EdgeInsets.only(top: 4),
        child: SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: loading ? null : onLoad,
            icon: loading
                ? const SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.verified_outlined, size: 16),
            label: const Text(
              'Verify with broker preview',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(38),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
          ),
        ),
      );
    }
    if (error != null) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.redAccent.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.error_outline,
                color: Colors.redAccent,
                size: 14,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  error!,
                  style: const TextStyle(
                    color: Colors.redAccent,
                    fontSize: 11.5,
                  ),
                ),
              ),
              TextButton(
                onPressed: onLoad,
                style: TextButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  minimumSize: const Size(0, 24),
                ),
                child: const Text('Retry', style: TextStyle(fontSize: 11)),
              ),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        decoration: BoxDecoration(
          color: const Color(0xFF06B6D4).withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: const Color(0xFF06B6D4).withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.verified_outlined,
                  color: Color(0xFF06B6D4),
                  size: 14,
                ),
                const SizedBox(width: 6),
                const Text(
                  'Broker preview',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.4,
                    color: Color(0xFF06B6D4),
                  ),
                ),
                const Spacer(),
                Text(
                  'via SmartAPI',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.white.withValues(alpha: 0.45),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (brokerage != null) ...[
              _PreviewRow(
                label: 'Total charges',
                value: '₹${brokerage!.totalCharges.toStringAsFixed(2)}',
                bold: true,
              ),
              _PreviewRow(
                label: 'Brokerage',
                value: '₹${brokerage!.brokerage.toStringAsFixed(2)}',
              ),
              _PreviewRow(
                label: 'STT',
                value: '₹${brokerage!.stt.toStringAsFixed(2)}',
              ),
              _PreviewRow(
                label: 'Exchange + SEBI',
                value:
                    '₹${(brokerage!.transactionCharges + brokerage!.sebiCharges).toStringAsFixed(2)}',
              ),
              _PreviewRow(
                label: 'GST',
                value: '₹${brokerage!.gst.toStringAsFixed(2)}',
              ),
              _PreviewRow(
                label: 'Stamp duty',
                value: '₹${brokerage!.stampDuty.toStringAsFixed(2)}',
              ),
            ],
            if (isFno && margin != null) ...[
              const SizedBox(height: 4),
              Container(
                height: 1,
                color: Colors.white.withValues(alpha: 0.08),
                margin: const EdgeInsets.symmetric(vertical: 4),
              ),
              _PreviewRow(
                label: 'Margin required',
                value: '₹${margin!.totalMarginRequired.toStringAsFixed(2)}',
                bold: true,
              ),
              if (margin!.spanMargin > 0)
                _PreviewRow(
                  label: 'SPAN',
                  value: '₹${margin!.spanMargin.toStringAsFixed(2)}',
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({
    required this.label,
    required this.value,
    this.bold = false,
  });
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final muted = Colors.white.withValues(alpha: 0.65);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              color: bold ? null : muted,
              fontWeight: bold ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
              color: bold ? null : muted,
            ),
          ),
        ],
      ),
    );
  }
}
