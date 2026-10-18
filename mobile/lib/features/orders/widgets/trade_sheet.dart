import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/analytics.dart';
import '../../../core/company_names.dart';
import '../../../core/design/tokens.dart';
import '../../../core/error_mapper.dart';
import '../../../core/fees.dart';
import '../../../core/money_format.dart';
import '../../../core/preferences.dart';
import '../../../data/models/order.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/fno_badge.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/symbol_avatar.dart';
import '../../notifications/notifications_provider.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../ticks/ticks_providers.dart';
import '../../watchlists/watchlists_providers.dart';
import '../orders_providers.dart';
import '../orders_repository.dart';

/// What the ticket needs to price an order like a real broker: whether the
/// contract trades on margin (futures), at what rate, and — for MCX — the
/// physical lot ("1 kg") behind the quoted unit ("per 10 g"). Built from the
/// quote / snapshot response or a portfolio position.
class TradeContract {
  const TradeContract({
    this.tradingsymbol,
    this.isFuture = false,
    this.marginRatePct,
    this.lotLabel,
    this.quoteUnit,
    this.positionAvgPrice,
    this.positionMargin,
    this.leveragedPosition = false,
  });

  final String? tradingsymbol;
  final bool isFuture;
  final double? marginRatePct;
  final String? lotLabel;
  final String? quoteUnit;

  /// Existing position (for an exit): average price, blocked margin, and
  /// whether it's held on margin — drives the "est. P&L / margin released"
  /// preview instead of a full-value "you receive".
  final double? positionAvgPrice;
  final double? positionMargin;
  final bool leveragedPosition;

  bool get onMargin => isFuture && (marginRatePct ?? 0) > 0;

  factory TradeContract.fromQuote(Map<String, dynamic>? raw) {
    if (raw == null) return const TradeContract();
    return TradeContract(
      tradingsymbol: raw['tradingsymbol']?.toString(),
      isFuture: raw['isFuture'] == true,
      marginRatePct: (raw['marginRatePct'] as num?)?.toDouble(),
      lotLabel: raw['lotLabel']?.toString(),
      quoteUnit: raw['quoteUnit']?.toString(),
    );
  }

  TradeContract withPosition({
    required double avgPrice,
    required double margin,
    required bool leveraged,
  }) =>
      TradeContract(
        tradingsymbol: tradingsymbol,
        isFuture: isFuture || leveraged,
        marginRatePct: marginRatePct,
        lotLabel: lotLabel,
        quoteUnit: quoteUnit,
        positionAvgPrice: avgPrice,
        positionMargin: margin,
        leveragedPosition: leveraged,
      );
}

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
  TradeContract contract = const TradeContract(),
  String? displayName,
}) {
  HapticFeedback.selectionClick();
  return showModalBottomSheet<OrderRecord>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    // Cap the sheet height so it can't exceed the screen; the body scrolls.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.of(context).size.height * 0.94,
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
        contract: contract,
        displayName: displayName,
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
    required this.contract,
    this.initialQuantity,
    this.displayName,
  });

  final OrderSide side;

  /// Symbol the order is placed against (the contract tradingsymbol for
  /// derivatives, the ticker for cash equity).
  final String symbol;
  final String exchange;
  final String symboltoken;
  final double? referencePrice;
  final int ownedQuantity;

  /// Units of [ownedQuantity] already locked by resting SELL orders. The sheet
  /// caps a sell at (owned − reserved) since reserved units can't be sold twice.
  final int reservedQuantity;

  /// Cash free to commit (wallet balance − holds − blocked margin).
  final double walletBalance;

  /// Contract lot size, in the quoted unit. 1 for cash equity; the F&O / MCX
  /// lot (e.g. 75, or 100 for GOLD) for derivatives.
  final int lotSize;

  /// Pre-selected quantity (e.g. the full position when squaring off).
  final int? initialQuantity;
  final TradeContract contract;
  final String? displayName;

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
  late final TextEditingController _qtyController;

  bool get _isBuy => widget.side == OrderSide.buy;
  bool get _isLimit => _type == OrderType.limit;
  bool get _isStopLoss => _type == OrderType.stopLoss;
  bool get _isStopLossLimit => _type == OrderType.stopLossLimit;
  bool get _isTrailing => _type == OrderType.trailingStop;
  bool get _needsLimit => _isLimit || _isStopLossLimit;
  bool get _needsTrigger => _isStopLoss || _isStopLossLimit;
  bool get _needsTrail => _isTrailing;
  bool get _isDerivative => isFnoExchange(widget.exchange);

  /// BUY of a futures contract (or exit of a margined long) — priced on
  /// margin rather than full value.
  bool get _onMargin =>
      _isBuy ? widget.contract.onMargin : widget.contract.leveragedPosition;

  String get _key => '${widget.exchange}:${widget.symboltoken}';

  String get _tradingsymbol => widget.contract.tradingsymbol ?? widget.symbol;

  FeeSegment get _segment => feeSegmentFor(widget.exchange, _tradingsymbol);

  @override
  void initState() {
    super.initState();
    // Seed type/product from the user's saved defaults so the sheet opens on
    // the order shape they actually use most.
    final prefs = ref.read(prefsProvider);
    _type = prefs.defaultOrderType;
    _product = prefs.defaultProduct;
    _qty = widget.initialQuantity ?? (widget.lotSize > 1 ? widget.lotSize : 1);
    final ref0 = widget.referencePrice;
    final defaultStr = ref0 != null ? ref0.toStringAsFixed(2) : '';
    _limitController = TextEditingController(text: defaultStr);
    _triggerController = TextEditingController(text: defaultStr);
    _trailController = TextEditingController(text: '');
    _qtyController = TextEditingController(text: '$_qty');
  }

  @override
  void dispose() {
    _limitController.dispose();
    _triggerController.dispose();
    _trailController.dispose();
    _qtyController.dispose();
    super.dispose();
  }

  double _livePrice(Tick? tick) => tick?.ltp ?? widget.referencePrice ?? 0;

  double get _limitPrice => double.tryParse(_limitController.text) ?? 0;
  double get _triggerPrice => double.tryParse(_triggerController.text) ?? 0;
  double get _trailAmount => double.tryParse(_trailController.text) ?? 0;

  /// Price the user effectively commits to for reservation / value preview.
  double _orderPrice(double live) {
    if (_isLimit || _isStopLossLimit) return _limitPrice;
    if (_isStopLoss) return _triggerPrice;
    return live > 0 ? live : (widget.referencePrice ?? 0);
  }

  FeeBreakdown _fees(double notional) => estimateFees(
        side: _isBuy ? 'BUY' : 'SELL',
        exchange: widget.exchange,
        notional: notional,
        intraday: _product == OrderProduct.intraday,
        segment: _segment,
      );

  /// Cash one unit needs on a BUY at [price]: margin share or full price,
  /// plus a proportional fee estimate.
  double _cashPerUnit(double price) {
    if (price <= 0) return 0;
    final base = _onMargin
        ? price * (widget.contract.marginRatePct ?? 100) / 100
        : price;
    final lotNotional = price * widget.lotSize;
    final feePerUnit = _fees(lotNotional).total / widget.lotSize;
    return base + feePerUnit;
  }

  Future<void> _submit() async {
    HapticFeedback.mediumImpact();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await ref.read(ordersRepositoryProvider).place(
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
        side: _isBuy ? 'buy' : 'sell',
        symbol: widget.symbol,
        quantity: order.quantity,
        orderType: _typeLabelFor(_type),
        status: order.status.name,
        value: order.notional,
      );
      // Push an in-app notification — MARKET fills immediately, the others
      // sit pending until the limit-watcher fires.
      final notifications = ref.read(notificationsProvider.notifier);
      final verb = _isBuy ? 'Bought' : 'Sold';
      final side = _isBuy ? 'BUY' : 'SELL';
      final name = _title;
      if (order.status == OrderStatus.filled) {
        final px = order.fillPrice?.toStringAsFixed(2) ?? '?';
        unawaited(
          notifications.push(
            kind: AppNotificationKind.orderFilled,
            title: '$verb ${order.quantity} $name @ ₹$px',
            body: '${widget.exchange} • ${_typeLabelFor(_type)} • '
                '${_productLabel(_product, short: true)}',
          ),
        );
      } else if (order.status == OrderStatus.rejected) {
        unawaited(
          notifications.push(
            kind: AppNotificationKind.orderRejected,
            title: '$side rejected — $name',
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
            title: '$side ${order.quantity} $name '
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
      HapticFeedback.heavyImpact();
      Navigator.of(context).pop(order);
    } catch (e) {
      HapticFeedback.vibrate();
      setState(() => _error = friendlyError(e, context: 'trade'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Lot-constrained instrument (F&O / MCX). Quantity steps in whole lots.
  bool get _isLotted => widget.lotSize > 1;
  int get _step => _isLotted ? widget.lotSize : 1;
  int get _lots => widget.lotSize > 0 ? _qty ~/ widget.lotSize : _qty;

  String get _title {
    if (widget.displayName != null) return widget.displayName!;
    return _isDerivative
        ? prettyContract(_tradingsymbol)
        : companyNameFor(widget.symbol);
  }

  String _typeLabelFor(OrderType t) => switch (t) {
        OrderType.market => 'MARKET',
        OrderType.limit => 'LIMIT',
        OrderType.stopLoss => 'SL',
        OrderType.stopLossLimit => 'SL-L',
        OrderType.trailingStop => 'TRAIL',
      };

  String _productLabel(OrderProduct p, {bool short = false}) {
    if (_isDerivative) {
      return p == OrderProduct.intraday
          ? (short ? 'MIS' : 'Intraday · MIS')
          : (short ? 'NRML' : 'Carry forward · NRML');
    }
    return p == OrderProduct.intraday
        ? (short ? 'MIS' : 'Intraday · MIS')
        : (short ? 'CNC' : 'Delivery · CNC');
  }

  /// Sellable quantity = owned minus whatever resting orders have reserved.
  int get _availableToSell {
    final avail = widget.ownedQuantity.abs() - widget.reservedQuantity;
    return avail < 0 ? 0 : avail;
  }

  int _maxQty(double price) {
    if (!_isBuy) {
      // Short-selling is disabled — you can only sell what you hold, minus any
      // units reserved by resting orders. A whole-position exit may be an odd
      // lot (legacy MCX positions), so it isn't rounded down.
      return _availableToSell;
    }
    final perUnit = _cashPerUnit(price);
    if (perUnit <= 0) return 0;
    final raw = (widget.walletBalance / perUnit).floor();
    if (_step <= 1) return raw;
    return raw ~/ _step * _step; // largest whole-lot quantity ≤ raw
  }

  bool _qtyValid(int maxQty) {
    if (_qty <= 0 || _qty > maxQty) return false;
    if (!_isLotted) return true;
    // Whole lots — or exactly the whole remaining position on an exit.
    return _qty % _step == 0 || (!_isBuy && _qty == _availableToSell);
  }

  void _setQty(int q) {
    setState(() {
      _qty = q;
      _qtyController.text = '$q';
      _qtyController.selection =
          TextSelection.collapsed(offset: _qtyController.text.length);
    });
    HapticFeedback.selectionClick();
  }

  String _ctaLabel() {
    final ts = _triggerPrice.toStringAsFixed(2);
    final ls = _limitPrice.toStringAsFixed(2);
    final trail = _trailAmount.toStringAsFixed(2);
    final verb = _isBuy ? 'Buy' : 'Sell';
    if (_isTrailing) return '$verb with trailing stop ₹$trail';
    if (_isStopLossLimit) return '$verb · SL ₹$ts → limit ₹$ls';
    if (_isStopLoss) return '$verb · SL trigger ₹$ts';
    if (_isLimit) return 'Place $verb limit @ ₹$ls';
    final unit = _isLotted ? '$_lots ${_lots == 1 ? 'lot' : 'lots'}' : '$_qty';
    return '$verb $unit at market';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final tick = ref.watch(latestTicksProvider.select<Tick?>((map) => map[_key]));
    final livePrice = _livePrice(tick);
    final price = _orderPrice(livePrice);
    final maxQty = _maxQty(price);
    final accent = _isBuy ? m.up : m.down;

    final notional = price * _qty;
    final fees = _fees(notional);
    final marginRate = widget.contract.marginRatePct ?? 0;

    final canSubmit = !_busy &&
        _qtyValid(maxQty) &&
        price > 0 &&
        (!_needsLimit || _limitController.text.trim().isNotEmpty) &&
        (!_needsTrigger || _triggerController.text.trim().isNotEmpty) &&
        (!_needsTrail ||
            (_trailController.text.trim().isNotEmpty && _trailAmount > 0));

    String? hint;
    if (_needsTrigger && livePrice > 0 && _triggerPrice > 0) {
      if (_isBuy && _triggerPrice <= livePrice) {
        hint = 'A buy stop-loss usually sits ABOVE the current price.';
      } else if (!_isBuy && _triggerPrice >= livePrice) {
        hint = 'A sell stop-loss usually sits BELOW the current price.';
      }
    }
    if (!_isBuy && widget.reservedQuantity > 0 && _availableToSell == 0) {
      hint = 'All ${widget.ownedQuantity.abs()} units are reserved by open '
          'orders. Cancel them from the Orders tab to sell.';
    }
    if (_isBuy && price > 0 && maxQty < _step) {
      hint = _onMargin
          ? 'Not enough free margin for even one lot '
              '(${formatInrCompact(_cashPerUnit(price) * _step)} needed). '
              'Try a mini contract.'
          : 'Not enough available balance for this order.';
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: scheme.outline,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _Header(
            title: _title,
            symbol: _isDerivative ? _tradingsymbol : widget.symbol,
            exchange: widget.exchange,
            isBuy: _isBuy,
            livePrice: livePrice,
            changePct: tick != null && (tick.close ?? 0) > 0
                ? ((tick.ltp - tick.close!) / tick.close!) * 100
                : null,
            badge: widget.contract.isFuture ? 'FUT · MARGIN' : null,
          ),
          const SizedBox(height: 18),
          _FieldLabel(_isDerivative ? 'Product' : 'Product'),
          SegmentedButton<OrderProduct>(
            showSelectedIcon: false,
            segments: [
              ButtonSegment(
                value: OrderProduct.delivery,
                label: Text(_productLabel(OrderProduct.delivery)),
              ),
              ButtonSegment(
                value: OrderProduct.intraday,
                label: Text(_productLabel(OrderProduct.intraday)),
              ),
            ],
            selected: {_product},
            onSelectionChanged: (s) => setState(() => _product = s.first),
          ),
          const SizedBox(height: 16),
          const _FieldLabel('Order type'),
          // Chips (not a SegmentedButton): five options + large system fonts
          // would otherwise squash each label.
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final ot in OrderType.values)
                ChoiceChip(
                  label: Text(switch (ot) {
                    OrderType.market => 'Market',
                    OrderType.limit => 'Limit',
                    OrderType.stopLoss => 'Stop-loss',
                    OrderType.stopLossLimit => 'SL-Limit',
                    OrderType.trailingStop => 'Trailing',
                  }),
                  selected: _type == ot,
                  onSelected: (_) {
                    HapticFeedback.selectionClick();
                    setState(() => _type = ot);
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_needsTrigger)
            _PriceField(
              controller: _triggerController,
              label: 'Trigger price',
              onChanged: () => setState(() {}),
            ),
          if (_needsTrail)
            _PriceField(
              controller: _trailController,
              label: 'Trail by',
              helper: livePrice > 0
                  ? 'Initial trigger ≈ ₹${(_isBuy ? livePrice + _trailAmount : livePrice - _trailAmount).toStringAsFixed(2)} — it follows the price'
                  : 'The trigger follows the price as it moves your way',
              onChanged: () => setState(() {}),
            ),
          if (_needsLimit)
            _PriceField(
              controller: _limitController,
              label: 'Limit price',
              onChanged: () => setState(() {}),
            ),
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InfoBanner(
                tone: BannerTone.warning,
                icon: Icons.lightbulb_outline_rounded,
                message: hint,
              ),
            ),
          Row(
            children: [
              const Expanded(child: _FieldLabel('Quantity')),
              Text(
                _isBuy
                    ? 'Available ${formatInrCompact(widget.walletBalance)}'
                    : widget.reservedQuantity > 0
                        ? 'Hold ${widget.ownedQuantity.abs()} · ${widget.reservedQuantity} reserved'
                        : 'You hold ${widget.ownedQuantity.abs()}',
                style: t.bodySmall,
              ),
            ],
          ),
          _QuantityStepper(
            qty: _qty,
            lots: _lots,
            lotted: _isLotted,
            controller: _qtyController,
            canDecrement: _qty - _step >= _step,
            canIncrement: _qty + _step <= maxQty,
            onDecrement: () => _setQty(_qty - _step),
            onIncrement: () => _setQty(_qty + _step),
            onTyped: (n) => setState(() => _qty = n),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                  _isLotted
                      ? '1 lot = ${widget.contract.lotLabel ?? '${widget.lotSize} units'}'
                          '${widget.contract.quoteUnit != null ? ' · priced per ${widget.contract.quoteUnit}' : ''}'
                      : 'Max ${maxQty > 0 ? maxQty : 0} shares',
                  style: t.bodySmall,
                ),
              ),
              if (maxQty >= _step && _qty != maxQty)
                TextButton(
                  style: TextButton.styleFrom(
                    visualDensity: VisualDensity.compact,
                  ),
                  onPressed: () => _setQty(maxQty),
                  child: Text(
                    _isBuy
                        ? 'Max ${_isLotted ? '${maxQty ~/ _step} lots' : maxQty}'
                        : 'Sell all',
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          _CostCard(
            rows: _summaryRows(
              notional: notional,
              fees: fees.total,
              price: price,
              marginRate: marginRate,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            InfoBanner(
              tone: BannerTone.danger,
              icon: Icons.error_outline_rounded,
              message: _error!,
            ).animate().shake(hz: 3, duration: 350.ms),
          ],
          const SizedBox(height: 18),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: accent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: scheme.surfaceContainerHighest,
              minimumSize: const Size.fromHeight(56),
            ),
            onPressed: canSubmit ? _submit : null,
            child: _busy
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.4,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    _ctaLabel(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
          ),
          const SizedBox(height: 10),
          Text(
            'Virtual money · simulated at live NSE/BSE/MCX prices',
            textAlign: TextAlign.center,
            style: t.bodySmall,
          ),
        ],
      ),
    );
  }

  /// Cost breakdown, shaped by what the order actually does to the wallet.
  List<_CostRow> _summaryRows({
    required double notional,
    required double fees,
    required double price,
    required double marginRate,
  }) {
    final reservedWord =
        (_needsLimit || _isStopLoss || _isTrailing) ? ' (reserved)' : '';
    if (_isBuy && _onMargin) {
      final margin = notional * marginRate / 100;
      return [
        _CostRow('Contract value', formatInr(notional)),
        _CostRow(
          'Margin (${marginRate.toStringAsFixed(0)}% of value)$reservedWord',
          formatInr(margin),
        ),
        _CostRow('Charges & taxes', formatInr(fees), muted: true),
        _CostRow('Blocked from wallet', formatInr(margin + fees), total: true),
      ];
    }
    if (!_isBuy && _onMargin) {
      final avg = widget.contract.positionAvgPrice ?? price;
      final pnl = (price - avg) * _qty;
      final owned = widget.ownedQuantity.abs();
      final released = owned > 0
          ? (widget.contract.positionMargin ?? 0) * _qty / owned
          : 0.0;
      return [
        _CostRow('Contract value', formatInr(notional), muted: true),
        _CostRow(
          'Est. P&L (vs avg ${formatInr(avg)})',
          formatInr(pnl, sign: true),
          color: context.market.changeColor(pnl),
        ),
        _CostRow('Charges & taxes', formatInr(fees), muted: true),
        _CostRow('Margin released', formatInr(released), total: true),
      ];
    }
    if (_isBuy) {
      return [
        _CostRow('Order value$reservedWord', formatInr(notional)),
        _CostRow('Charges & taxes', formatInr(fees), muted: true),
        _CostRow('Total payable', formatInr(notional + fees), total: true),
      ];
    }
    return [
      _CostRow('Order value', formatInr(notional)),
      _CostRow('Charges & taxes', formatInr(fees), muted: true),
      _CostRow('You receive', formatInr(notional - fees), total: true),
    ];
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.title,
    required this.symbol,
    required this.exchange,
    required this.isBuy,
    required this.livePrice,
    required this.changePct,
    this.badge,
  });

  final String title;
  final String symbol;
  final String exchange;
  final bool isBuy;
  final double livePrice;
  final double? changePct;
  final String? badge;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final accent = isBuy ? m.up : m.down;
    return Row(
      children: [
        SymbolAvatar(symbol: symbol, size: 46),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: accent.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      isBuy ? 'BUY' : 'SELL',
                      style: TextStyle(
                        color: accent,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(exchange, style: t.labelSmall),
                  if (badge != null) ...[
                    const SizedBox(width: 6),
                    FnoBadge(label: badge!, color: m.violet),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: t.titleLarge,
              ),
            ],
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              livePrice > 0 ? formatInr(livePrice) : '—',
              style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            if (changePct != null) ...[
              const SizedBox(height: 4),
              ChangePill(percent: changePct, compact: true),
            ],
          ],
        ),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 0.8,
            ),
      ),
    );
  }
}

class _PriceField extends StatelessWidget {
  const _PriceField({
    required this.controller,
    required this.label,
    required this.onChanged,
    this.helper,
  });

  final TextEditingController controller;
  final String label;
  final String? helper;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
        ],
        decoration: InputDecoration(
          labelText: label,
          prefixText: '₹ ',
          helperText: helper,
        ),
        onChanged: (_) => onChanged(),
      ),
    );
  }
}

class _QuantityStepper extends StatelessWidget {
  const _QuantityStepper({
    required this.qty,
    required this.lots,
    required this.lotted,
    required this.controller,
    required this.canDecrement,
    required this.canIncrement,
    required this.onDecrement,
    required this.onIncrement,
    required this.onTyped,
  });

  final int qty;
  final int lots;
  final bool lotted;
  final TextEditingController controller;
  final bool canDecrement;
  final bool canIncrement;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;
  final ValueChanged<int> onTyped;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Row(
        children: [
          IconButton.filledTonal(
            onPressed: canDecrement ? onDecrement : null,
            icon: const Icon(Icons.remove_rounded),
          ),
          Expanded(
            // Lotted contracts: a read-only lots display that steps by whole
            // lots, so quantity can't be set to an odd value. Equity: a free
            // entry field.
            child: lotted
                ? Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '$lots',
                        textAlign: TextAlign.center,
                        style: t.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        '${lots == 1 ? 'lot' : 'lots'} · $qty units',
                        style: t.bodySmall,
                      ),
                    ],
                  )
                : TextField(
                    controller: controller,
                    keyboardType: TextInputType.number,
                    textAlign: TextAlign.center,
                    style: t.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                      isDense: true,
                      filled: false,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                    ),
                    onChanged: (v) => onTyped(int.tryParse(v) ?? 0),
                  ),
          ),
          IconButton.filledTonal(
            onPressed: canIncrement ? onIncrement : null,
            icon: const Icon(Icons.add_rounded),
          ),
        ],
      ),
    );
  }
}

class _CostRow {
  const _CostRow(
    this.label,
    this.value, {
    this.muted = false,
    this.total = false,
    this.color,
  });
  final String label;
  final String value;
  final bool muted;
  final bool total;
  final Color? color;
}

class _CostCard extends StatelessWidget {
  const _CostCard({required this.rows});
  final List<_CostRow> rows;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        children: [
          for (final r in rows) ...[
            if (r.total) const Divider(height: 18),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      r.label,
                      style: r.total
                          ? t.titleSmall
                          : t.bodyMedium?.copyWith(
                              color: r.muted ? scheme.onSurfaceVariant : null,
                            ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    r.value,
                    style: (r.total ? t.titleMedium : t.bodyMedium)?.copyWith(
                      fontWeight: r.total ? FontWeight.w800 : FontWeight.w600,
                      color: r.color ??
                          (r.muted ? scheme.onSurfaceVariant : null),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
