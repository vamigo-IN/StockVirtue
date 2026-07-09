import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_info.dart';
import '../../../core/company_names.dart';
import '../../../core/money_format.dart';
import '../../../data/models/order.dart';
import '../../bookmarks/bookmarks_storage.dart';
import '../../../data/models/portfolio.dart';
import '../../../data/models/quote.dart';
import '../../../data/models/tick.dart';
import '../../../widgets/depth_view.dart';
import '../../chart/screens/chart_screen.dart';
import '../../home/indices_universe.dart';
import '../../home/recently_viewed_storage.dart';
import '../../options/screens/option_chain_screen.dart';
import '../../market/market_repository.dart';
import '../../orders/widgets/trade_sheet.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../home/widgets/recently_viewed_carousel.dart';
import '../../news/widgets/news_section.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../widgets/about_company.dart';
import '../widgets/price_chart.dart';
import '../widgets/similar_stocks.dart';
import '../widgets/trading_info_card.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

class SymbolDetailScreen extends ConsumerStatefulWidget {
  const SymbolDetailScreen({
    super.key,
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
  });

  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;

  @override
  ConsumerState<SymbolDetailScreen> createState() => _SymbolDetailScreenState();
}

class _SymbolDetailScreenState extends ConsumerState<SymbolDetailScreen> {
  Future<Map<String, dynamic>>? _quoteFuture;
  TickSubscription? _sub;
  Map<String, dynamic>? _snapshot;
  List<DepthLevel>? _initialBids;
  List<DepthLevel>? _initialAsks;
  double? _initialYearHigh;
  double? _initialYearLow;
  double? _initialUpperCircuit;
  double? _initialLowerCircuit;
  // Last REST quote LTP for this symbol. Used as a price fallback when opening
  // the trade sheet if no live tick has arrived yet (e.g. BSE index options or
  // thin strikes off-hours), so the Buy/Sell CTA isn't stuck disabled at ₹0.
  double? _restLtp;

  // Mutable so the NSE ↔ BSE toggle in the header can swap us to the
  // other listing without rebuilding the route. The chart, depth view,
  // trade sheet, and position lookup all read from these fields rather
  // than `widget.*` so a flip cleanly re-wires every downstream feature.
  late String _exchange = widget.exchange;
  late String _tradingsymbol = widget.tradingsymbol;
  late String _symboltoken = widget.symboltoken;

  // Resolved counterpart on the other exchange — null while the lookup
  // is in flight or when the stock isn't dual-listed. Drives whether
  // the header shows the interactive toggle or just a static badge.
  StockSearchResult? _counterpart;
  bool _swapping = false;

  bool get _isEquityExchange => _exchange == 'NSE' || _exchange == 'BSE';

  /// The symbol to use for market data + trading. On the derivatives/commodity
  /// exchanges (NFO/BFO/MCX/CDS/NCO) the underlying name (e.g. "NIFTY",
  /// "CRUDEOIL") doesn't exist — the exchange only knows the contract — so we
  /// must address quotes, ticks and orders by the contract tradingsymbol. For
  /// cash equity the two are equivalent.
  String get _quoteSymbol => _isEquityExchange ? widget.symbol : _tradingsymbol;
  // SmartAPI assigns indices a token in the 99926000 (NSE) / 99919000
  // (BSE) range — the prefix identifies most of them without a backend
  // roundtrip. But the prefix isn't reliable for every index (e.g. SENSEX),
  // so we ALSO match against the curated index universe by (symbol, exchange).
  // We route around the trade sheet for these since you can't buy an index spot.
  bool get _isIndex =>
      _isEquityExchange &&
      (_symboltoken.startsWith('99926') ||
          _symboltoken.startsWith('99919') ||
          _isCuratedIndex);

  bool get _isCuratedIndex {
    final sym = widget.symbol.toUpperCase();
    return allIndices
        .any((e) => e.symbol.toUpperCase() == sym && e.exchange == _exchange);
  }

  @override
  void initState() {
    super.initState();
    _attachToCurrentSymbol();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _maybeResolveCounterpart();
      // Record this view for the home "Recently viewed" carousel. Fire-and-
      // forget — failure to persist shouldn't block the detail screen.
      ref.read(recentlyViewedProvider.notifier).record(
            symbol: widget.symbol,
            tradingsymbol: _tradingsymbol,
            symboltoken: _symboltoken,
            exchange: _exchange,
          );
    });
  }

  /// Common init path for the initial render + every exchange swap.
  /// Subscribes the live-tick channel for the current (exchange, symbol)
  /// pair and kicks off the REST quote + snapshot fetches whose results
  /// populate the OHLC strip / depth book / 52w extremes.
  void _attachToCurrentSymbol() {
    final sub = TickSubscription(symbol: _quoteSymbol, exchange: _exchange);
    _sub = sub;
    _restLtp = null;
    final quoteFuture = ref
        .read(marketRepositoryProvider)
        .getRawQuote(_quoteSymbol, _exchange);
    _quoteFuture = quoteFuture;
    quoteFuture.then((raw) {
      if (!mounted) return;
      final l = (raw['ltp'] as num?)?.toDouble();
      if (l != null && l > 0) setState(() => _restLtp = l);
    }).catchError((_) {});
    ref
        .read(marketRepositoryProvider)
        .getSnapshot(_quoteSymbol, _exchange)
        .then((snap) {
          if (mounted) _applySnapshot(snap);
        })
        .catchError((_) {});
    // Subscribe synchronously when called from setState; the
    // post-frame callback in initState handles the very first launch
    // (the socket lifecycle provider may not have connected yet).
    if (mounted) {
      ref.read(ticksServiceProvider).subscribe([sub]);
    }
  }

  Future<void> _maybeResolveCounterpart() async {
    if (!_isEquityExchange) return;
    try {
      final other = await ref
          .read(marketRepositoryProvider)
          .getCounterpart(widget.symbol, _exchange);
      if (!mounted) return;
      setState(() => _counterpart = other);
    } catch (_) {
      // Network/5xx — degrade silently. The toggle just stays hidden.
    }
  }

  /// Flips the screen to the same equity on the other exchange. Tears
  /// down the live tick on the old (exchange, token), swaps state, and
  /// reattaches every downstream fetch to the new pair.
  Future<void> _swapExchange() async {
    final target = _counterpart;
    if (target == null || _swapping) return;
    setState(() => _swapping = true);
    final old = _sub;
    if (old != null) {
      ref.read(ticksServiceProvider).unsubscribe([old]);
    }
    setState(() {
      // The pre-swap counterpart becomes our current symbol; the new
      // counterpart is the one we just left.
      final previous = StockSearchResult(
        symbol: widget.symbol,
        tradingsymbol: _tradingsymbol,
        symboltoken: _symboltoken,
        exchange: _exchange,
        type: 'EQUITY',
        lotSize: 1,
        tickSize: 0.05,
      );
      _exchange = target.exchange;
      _tradingsymbol = target.tradingsymbol;
      _symboltoken = target.symboltoken;
      _counterpart = previous;
      // Reset the dependent snapshot bits so we don't briefly show
      // last-exchange's depth book over the new exchange's price.
      _snapshot = null;
      _initialBids = null;
      _initialAsks = null;
      _initialYearHigh = null;
      _initialYearLow = null;
      _initialUpperCircuit = null;
      _initialLowerCircuit = null;
    });
    _attachToCurrentSymbol();
    // Portfolio position lookup is keyed by (exchange, symboltoken)
    // server-side, so invalidating gives us the correct row for the
    // new exchange.
    ref.invalidate(portfolioProvider);
    setState(() => _swapping = false);
  }

  @override
  void dispose() {
    final sub = _sub;
    if (sub != null) {
      ref.read(ticksServiceProvider).unsubscribe([sub]);
    }
    super.dispose();
  }

  String get _key => '$_exchange:$_symboltoken';

  void _applySnapshot(Map<String, dynamic> snap) {
    final depth = snap['depth'];
    List<DepthLevel>? parseList(Object? raw) {
      if (raw is! List) return null;
      return raw
          .cast<Map<String, dynamic>>()
          .map(DepthLevel.fromJson)
          .toList();
    }
    setState(() {
      _snapshot = snap;
      if (depth is Map<String, dynamic>) {
        _initialBids = parseList(depth['bids']);
        _initialAsks = parseList(depth['asks']);
      }
      _initialYearHigh = (snap['yearHigh'] as num?)?.toDouble();
      _initialYearLow = (snap['yearLow'] as num?)?.toDouble();
      _initialUpperCircuit = (snap['upperCircuit'] as num?)?.toDouble();
      _initialLowerCircuit = (snap['lowerCircuit'] as num?)?.toDouble();
    });
  }

  Future<void> _openTrade(
    OrderSide side,
    Quote? quote,
    PortfolioPosition? position,
    double walletBalance,
  ) async {
    final tick = ref.read(latestTicksProvider)[_key];
    final snapLtp = (_snapshot?['ltp'] as num?)?.toDouble();
    // Reference price for the sheet: prefer a live tick, then the FULL-quote
    // snapshot LTP, then the REST quote LTP. Without this fallback the sheet
    // showed ₹0 (disabling the CTA) for any contract not currently ticking —
    // e.g. SENSEX/BANKEX index options and thin strikes off-hours.
    final price = tick?.ltp ??
        (snapLtp != null && snapLtp > 0 ? snapLtp : null) ??
        _restLtp ??
        quote?.ltp;
    final order = await showTradeSheet(
      context,
      side: side,
      symbol: _quoteSymbol,
      exchange: _exchange,
      symboltoken: _symboltoken,
      referencePrice: price,
      ownedQuantity: position?.quantity ?? 0,
      // Units locked by resting orders can't be sold twice — the sheet caps
      // the sell at (owned − reserved) and surfaces the reserved amount.
      reservedQuantity: position?.reservedQty ?? 0,
      walletBalance: walletBalance,
      lotSize: (_snapshot?['lotSize'] as num?)?.toInt() ?? 1,
    );
    if (order != null && mounted) {
      final (text, color) = _orderFeedback(side, order);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(text), backgroundColor: color),
      );
    }
  }

  /// Post-order snackbar copy + colour. Only a FILLED order has a price —
  /// a pending/queued order (market closed/holiday, or a resting limit/SL)
  /// must NOT print a fill price (that was the "@ ₹?" bug), and a rejection
  /// shows the reason instead.
  (String, Color) _orderFeedback(OrderSide side, OrderRecord order) {
    final verb = side == OrderSide.buy ? 'Bought' : 'Sold';
    switch (order.status) {
      case OrderStatus.filled:
        final px = order.fillPrice;
        final at = px != null ? ' @ ₹${px.toStringAsFixed(2)}' : '';
        return (
          '$verb ${order.quantity} ${order.symbol}$at',
          side == OrderSide.buy ? _upColor : _downColor,
        );
      case OrderStatus.pending:
        final msg = order.type == OrderType.market
            ? 'Order queued — fills at the next market open'
            : 'Order placed — waiting for your price';
        return (msg, const Color(0xFFF59E0B));
      case OrderStatus.rejected:
        return (order.rejectReason ?? 'Order rejected', _downColor);
      case OrderStatus.cancelled:
        return ('Order cancelled', const Color(0xFF6B7280));
    }
  }

  @override
  Widget build(BuildContext context) {
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[_key]),
    );
    final portfolio = ref.watch(portfolioProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          companyNameFor(widget.symbol),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          _BookmarkButton(
            symbol: widget.symbol,
            tradingsymbol: _tradingsymbol,
            symboltoken: _symboltoken,
            exchange: _exchange,
          ),
          if (_isEquityExchange)
            IconButton(
              icon: const Icon(Icons.account_tree_outlined),
              tooltip: 'Options chain',
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) =>
                      OptionChainScreen(underlying: widget.symbol),
                ),
              ),
            ),
          IconButton(
            icon: const Icon(Icons.candlestick_chart_outlined),
            tooltip: 'Open on TradingView',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ChartScreen(
                  symbol: widget.symbol,
                  exchange: _exchange,
                ),
              ),
            ),
          ),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _quoteFuture,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(child: Text('${snap.error}'));
          }
          final raw = snap.data ?? const {};
          final quote = Quote.fromJson(raw.isEmpty ? null : raw);
          final livePrice = tick?.ltp ?? quote?.ltp;
          final close = quote?.close;
          final change =
              (livePrice != null && close != null) ? livePrice - close : null;
          final changePct =
              (change != null && close != null && close > 0)
                  ? (change / close) * 100
                  : null;
          final isUp = (change ?? 0) >= 0;

          final snapshot = portfolio.value;
          final position =
              snapshot?.positionFor(_exchange, _symboltoken);

          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(portfolioProvider);
              final args = PriceChartArgs(
                symbol: _quoteSymbol,
                exchange: _exchange,
                range: ChartRange.m1,
              );
              ref.invalidate(priceChartCandlesProvider(args));
              setState(() {
                _quoteFuture = ref
                    .read(marketRepositoryProvider)
                    .getRawQuote(_quoteSymbol, _exchange);
              });
              await _quoteFuture;
              await ref.read(portfolioProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 120),
              children: [
                _PriceHeader(
                  name: companyNameFor(widget.symbol),
                  ticker: widget.symbol,
                  tradingsymbol: _tradingsymbol,
                  exchange: _exchange,
                  livePrice: livePrice,
                  change: change,
                  changePct: changePct,
                  isUp: isUp,
                  hasCounterpart: _counterpart != null,
                  counterpartExchange: _counterpart?.exchange,
                  swapping: _swapping,
                  onSwap: _swapExchange,
                ),
                const SizedBox(height: 18),
                PriceChart(
                  symbol: _quoteSymbol,
                  exchange: _exchange,
                  symboltoken: _symboltoken,
                ),
                const SizedBox(height: 24),
                _StatsGrid(quote: quote),
                const SizedBox(height: 16),
                _ActivityGrid(quote: quote),
                _spacingIfActivity(quote),
                _ExtremesGrid(
                  yearHigh: tick?.yearHigh ?? _initialYearHigh,
                  yearLow: tick?.yearLow ?? _initialYearLow,
                  upperCircuit: tick?.upperCircuit ?? _initialUpperCircuit,
                  lowerCircuit: tick?.lowerCircuit ?? _initialLowerCircuit,
                ),
                const SizedBox(height: 16),
                TradingInfoCard(snapshot: _snapshot),
                if (_snapshot != null) const SizedBox(height: 16),
                Builder(builder: (context) {
                  final showBids = tick?.bids ?? _initialBids;
                  final showAsks = tick?.asks ?? _initialAsks;
                  // Indices have no order book — the feed returns an all-zero
                  // depth ladder, so skip the section entirely for them.
                  if (_isIndex || showBids == null || showAsks == null) {
                    return const SizedBox.shrink();
                  }
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _SectionLabel('Market depth'),
                      const SizedBox(height: 8),
                      DepthView(bids: showBids, asks: showAsks),
                      const SizedBox(height: 16),
                    ],
                  );
                }),
                if (position != null) ...[
                  _PositionCard(position: position),
                  const SizedBox(height: 16),
                ],
                if (_isIndex) ...[
                  _IndexConstituentsSection(
                    indexSymbol: widget.symbol,
                  ),
                  const SizedBox(height: 16),
                ],
                AboutCompany(symbol: widget.symbol),
                _spacingIfHasInfo(widget.symbol),
                SimilarStocks(symbol: widget.symbol),
                const SizedBox(height: 16),
                NewsSection(symbol: widget.symbol),
                const SizedBox(height: 16),
                RecentlyViewedCarousel(excludeKey: _key),
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: _isIndex
          // Indices aren't directly tradable on the spot market — only
          // via F&O contracts. Swap Buy/Sell for Chart + Option-chain CTAs.
          ? _IndexActionBar(
              underlying: widget.symbol,
              exchange: _exchange,
            )
          : portfolio.maybeWhen(
              data: (p) => _ActionBar(
                ownedQty: p.positionFor(_exchange, _symboltoken)
                        ?.quantity ??
                    0,
                onBuy: () => _openTrade(
                  OrderSide.buy,
                  null,
                  p.positionFor(_exchange, _symboltoken),
                  p.wallet.balance,
                ),
                onSell: () => _openTrade(
                  OrderSide.sell,
                  null,
                  p.positionFor(_exchange, _symboltoken),
                  p.wallet.balance,
                ),
              ),
              orElse: () => const _ActionBar(
                ownedQty: 0,
                onBuy: null,
                onSell: null,
              ),
            ),
    );
  }
}

class _PriceHeader extends StatelessWidget {
  const _PriceHeader({
    required this.name,
    required this.ticker,
    required this.tradingsymbol,
    required this.exchange,
    required this.livePrice,
    required this.change,
    required this.changePct,
    required this.isUp,
    required this.hasCounterpart,
    required this.counterpartExchange,
    required this.swapping,
    required this.onSwap,
  });

  final String name;
  final String ticker;
  final String tradingsymbol;
  final String exchange;
  final double? livePrice;
  final double? change;
  final double? changePct;
  final bool isUp;
  /// True iff the stock is dual-listed on the other exchange and we've
  /// confirmed the counterpart token. Drives whether the header shows
  /// an interactive segmented toggle vs. a single static badge.
  final bool hasCounterpart;
  /// Label of the *other* exchange the toggle would swap to. We don't
  /// need the full counterpart payload here — the state class owns it.
  final String? counterpartExchange;
  /// Disables the toggle while a swap is in flight so the user can't
  /// double-tap and end up with mis-wired tick subscriptions.
  final bool swapping;
  final VoidCallback onSwap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final pnlColor = isUp ? _upColor : _downColor;
    // Show the ticker stem only when it differs from the friendly name so we
    // don't print "RELIANCE  •  RELIANCE  •  RELIANCE-EQ".
    final showTickerStem =
        ticker.toUpperCase() != name.toUpperCase();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.3,
            height: 1.15,
          ),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            _ExchangeBadge(
              current: exchange,
              counterpartExchange: counterpartExchange,
              hasCounterpart: hasCounterpart,
              swapping: swapping,
              onSwap: onSwap,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                showTickerStem
                    ? '$ticker • $tradingsymbol'
                    : tradingsymbol,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.2,
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 18),
        Text(
          livePrice != null ? formatInr(livePrice!) : '—',
          style: const TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.w700,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 6),
        if (change != null && changePct != null)
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: pnlColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      isUp ? Icons.trending_up : Icons.trending_down,
                      color: pnlColor,
                      size: 14,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${isUp ? '+' : ''}${change!.toStringAsFixed(2)} '
                      '(${isUp ? '+' : ''}${changePct!.toStringAsFixed(2)}%)',
                      style: TextStyle(
                        color: pnlColor,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'today',
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ],
          ),
      ],
    );
  }
}

/// Header chip showing the current exchange. Renders a static pill for
/// single-listed symbols (NIFTY, F&O contracts, BSE-only stocks, etc.)
/// and a two-segment NSE/BSE toggle when the same equity is listed on
/// both exchanges. Tapping the inactive segment kicks off [onSwap] on
/// the parent state class, which tears down the old tick subscription
/// and re-fetches every dependent quote/snapshot/chart against the
/// other token.
class _ExchangeBadge extends StatelessWidget {
  const _ExchangeBadge({
    required this.current,
    required this.counterpartExchange,
    required this.hasCounterpart,
    required this.swapping,
    required this.onSwap,
  });

  final String current;
  final String? counterpartExchange;
  final bool hasCounterpart;
  final bool swapping;
  final VoidCallback onSwap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (!hasCounterpart || counterpartExchange == null) {
      // Single-listed → original static badge.
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(5),
        ),
        child: Text(
          current,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: scheme.onSurface.withValues(alpha: 0.75),
          ),
        ),
      );
    }
    // Dual-listed → segmented toggle. The active segment is filled with
    // the surface-container tone; the inactive segment is a transparent
    // tappable area that fires onSwap. We render the two segments in
    // NSE/BSE order regardless of which side we're on so the layout
    // doesn't shift after a swap (only the active highlight moves).
    final pair = <String>{current, counterpartExchange!};
    final ordered = ['NSE', 'BSE'].where(pair.contains).toList();
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final ex in ordered)
            _BadgeSegment(
              label: ex,
              active: ex == current,
              busy: swapping && ex != current,
              onTap: ex == current || swapping ? null : onSwap,
            ),
        ],
      ),
    );
  }
}

class _BadgeSegment extends StatelessWidget {
  const _BadgeSegment({
    required this.label,
    required this.active,
    required this.busy,
    required this.onTap,
  });
  final String label;
  final bool active;
  final bool busy;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(4),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: active
              ? scheme.primary.withValues(alpha: 0.22)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy) ...[
              const SizedBox(
                width: 9,
                height: 9,
                child: CircularProgressIndicator(strokeWidth: 1.4),
              ),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
                color: active
                    ? scheme.primary
                    : scheme.onSurface.withValues(alpha: 0.65),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.quote});
  final Quote? quote;

  @override
  Widget build(BuildContext context) {
    return _StatBoard(
      title: 'OHLC',
      items: [
        _StatItem('Open', quote?.open),
        _StatItem('High', quote?.high),
        _StatItem('Low', quote?.low),
        _StatItem('Prev close', quote?.close),
      ],
    );
  }
}

/// Trade-activity board from the FULL quote — VWAP, traded volume, open
/// interest (F&O / commodities), and total book buy/sell quantity. Hidden
/// until at least two of these are present so cash equity without depth data
/// doesn't show an empty card.
class _ActivityGrid extends StatelessWidget {
  const _ActivityGrid({required this.quote});
  final Quote? quote;

  @override
  Widget build(BuildContext context) {
    final items = _activityItems(quote);
    if (items.length < 2) return const SizedBox.shrink();
    return _StatBoard(title: 'Activity', items: items);
  }
}

List<_StatItem> _activityItems(Quote? q) {
  if (q == null) return const [];
  return <_StatItem>[
    if (q.vwap != null && q.vwap! > 0) _StatItem('VWAP', q.vwap),
    if (q.volume != null && q.volume! > 0)
      _StatItem('Volume', null, display: _compactQty(q.volume!)),
    if (q.opnInterest != null && q.opnInterest! > 0)
      _StatItem('Open interest', null, display: _compactQty(q.opnInterest!)),
    if (q.totBuyQuan != null && q.totBuyQuan! > 0)
      _StatItem('Total buy qty', null, display: _compactQty(q.totBuyQuan!)),
    if (q.totSellQuan != null && q.totSellQuan! > 0)
      _StatItem('Total sell qty', null, display: _compactQty(q.totSellQuan!)),
  ];
}

/// 16px gap before the Range board, but only when the Activity board renders.
Widget _spacingIfActivity(Quote? q) => _activityItems(q).length >= 2
    ? const SizedBox(height: 16)
    : const SizedBox.shrink();

String _compactQty(double n) {
  final a = n.abs();
  if (a >= 10000000) return '${(n / 10000000).toStringAsFixed(2)} Cr';
  if (a >= 100000) return '${(n / 100000).toStringAsFixed(2)} L';
  if (a >= 1000) return '${(n / 1000).toStringAsFixed(1)} K';
  return n.toStringAsFixed(0);
}

class _ExtremesGrid extends StatelessWidget {
  const _ExtremesGrid({
    required this.yearHigh,
    required this.yearLow,
    required this.upperCircuit,
    required this.lowerCircuit,
  });

  final double? yearHigh;
  final double? yearLow;
  final double? upperCircuit;
  final double? lowerCircuit;

  @override
  Widget build(BuildContext context) {
    if (yearHigh == null &&
        yearLow == null &&
        upperCircuit == null &&
        lowerCircuit == null) {
      return const SizedBox.shrink();
    }
    return _StatBoard(
      title: 'Range',
      items: [
        _StatItem('52w high', yearHigh),
        _StatItem('52w low', yearLow),
        _StatItem('Upper circuit', upperCircuit),
        _StatItem('Lower circuit', lowerCircuit),
      ],
    );
  }
}

class _StatItem {
  final String label;
  final double? value;
  /// Preformatted display (e.g. compact volume "1.2 Cr"); overrides the
  /// default INR formatting of [value] when set.
  final String? display;
  const _StatItem(this.label, this.value, {this.display});
}

class _StatBoard extends StatelessWidget {
  const _StatBoard({required this.title, required this.items});
  final String title;
  final List<_StatItem> items;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 8),
          // Render the items two-per-row, with a hairline divider between
          // rows. Handles any count (4 for OHLC/Range, 4–5 for Activity).
          for (var i = 0; i < items.length; i += 2) ...[
            if (i > 0)
              Container(
                height: 1,
                margin: const EdgeInsets.symmetric(vertical: 8),
                color: scheme.outlineVariant.withValues(alpha: 0.2),
              ),
            Row(
              children: [
                _StatCell(item: items[i]),
                if (i + 1 < items.length)
                  _StatCell(item: items[i + 1])
                else
                  const Spacer(),
              ],
            ),
          ],
          const SizedBox(height: 6),
        ],
      ),
    );
  }
}

class _StatCell extends StatelessWidget {
  const _StatCell({required this.item});
  final _StatItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            item.label,
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 3),
          Text(
            item.display ??
                (item.value != null ? formatInr(item.value!) : '—'),
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _PositionCard extends StatelessWidget {
  const _PositionCard({required this.position});
  final PortfolioPosition position;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = position.unrealizedPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    final qty = position.quantity;
    final isShort = qty < 0;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.primaryContainer.withValues(alpha: 0.35),
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
              Text(
                isShort ? 'Short' : 'Long',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 11,
                  letterSpacing: 0.5,
                  color: isShort ? _downColor : _upColor,
                ),
              ),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  '${qty.abs()} @ ${formatInr(position.avgPrice)}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _MiniMetric(
                  label: 'Invested',
                  value: formatInr(position.invested),
                ),
              ),
              Expanded(
                child: _MiniMetric(
                  label: 'Current',
                  value: formatInr(position.currentValue),
                ),
              ),
              Expanded(
                child: _MiniMetric(
                  label: 'P&L',
                  value:
                      '${isUp ? '+' : ''}${formatInr(position.unrealizedPnL)}',
                  color: color,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: scheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
        const SizedBox(height: 3),
        Text(
          value,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 13,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.ownedQty,
    required this.onBuy,
    required this.onSell,
  });

  final int ownedQty;
  final VoidCallback? onBuy;
  final VoidCallback? onSell;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Short-selling is disabled — you can only sell what you hold.
    final canSell = ownedQty > 0;
    final sellTooltip =
        canSell ? null : 'You can only sell holdings you own.';
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Row(
          children: [
            Expanded(
              child: FilledButton(
                style: FilledButton.styleFrom(
                  backgroundColor: _upColor,
                  foregroundColor: Colors.black,
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                onPressed: onBuy,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      ownedQty < 0
                          ? Icons.shopping_cart_checkout
                          : Icons.add_shopping_cart,
                      size: 18,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      ownedQty < 0 ? 'Cover' : 'Buy',
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Tooltip(
                message: sellTooltip ?? '',
                triggerMode: canSell
                    ? TooltipTriggerMode.manual
                    : TooltipTriggerMode.longPress,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _downColor,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor:
                        scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    disabledForegroundColor:
                        scheme.onSurface.withValues(alpha: 0.4),
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  onPressed: canSell ? onSell : null,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.remove_shopping_cart, size: 18),
                      const SizedBox(width: 8),
                      const Text(
                        'Sell',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Adds a 16-px gap *only* when the curated-info widgets actually render.
/// Without this, generic equities (no curated info → empty widgets) would
/// leave a giant blank below the depth view.
Widget _spacingIfHasInfo(String symbol) =>
    companyInfoFor(symbol) == null
        ? const SizedBox.shrink()
        : const SizedBox(height: 16);

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
      ),
    );
  }
}

/// Star toggle in the AppBar. Filled gold when bookmarked, outlined when not.
/// Mutation is optimistic — the BookmarksNotifier updates state synchronously
/// in memory and persists async, so the icon flips instantly even on slow
/// storage backends.
class _BookmarkButton extends ConsumerWidget {
  const _BookmarkButton({
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
  });

  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = '$exchange:$symboltoken';
    final starred = ref.watch(isBookmarkedProvider(key));
    return IconButton(
      icon: Icon(
        starred ? Icons.star_rounded : Icons.star_outline_rounded,
        color: starred ? const Color(0xFFF59E0B) : null,
      ),
      tooltip: starred ? 'Remove bookmark' : 'Bookmark',
      onPressed: () {
        ref.read(bookmarksProvider.notifier).toggle(
              symbol: symbol,
              tradingsymbol: tradingsymbol,
              symboltoken: symboltoken,
              exchange: exchange,
            );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              starred ? 'Removed from bookmarks' : 'Bookmarked $symbol',
            ),
            duration: const Duration(seconds: 1),
          ),
        );
      },
    );
  }
}

/// Bottom action bar shown on index detail screens. An index can't be
/// bought as a spot instrument, so instead of Buy/Sell we offer two
/// read/trade entry points: a Chart button and an Option-chain button
/// (F&O contracts on the underlying are the real way to take a view).
class _IndexActionBar extends StatelessWidget {
  const _IndexActionBar({
    required this.underlying,
    required this.exchange,
  });
  final String underlying;
  final String exchange;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        decoration: BoxDecoration(
          color: scheme.surface,
          border: Border(
            top: BorderSide(
              color: scheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.info_outline,
                  size: 12,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    'Indices aren\'t traded as spot — view the chart or trade F&O.',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.55),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => ChartScreen(
                          symbol: underlying,
                          exchange: exchange,
                        ),
                      ),
                    ),
                    icon: const Icon(Icons.candlestick_chart_outlined, size: 18),
                    label: const Text(
                      'Chart',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) =>
                            OptionChainScreen(underlying: underlying),
                      ),
                    ),
                    icon: const Icon(Icons.account_tree_outlined, size: 18),
                    label: const Text(
                      'Option chain',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(48),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
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

/// Index constituents with live LTP + day-change pill per row. Fetched
/// from /market/indices/:symbol/constituents, which the backend
/// enriches via a multi-quote pass against the curated symbol list.
/// Renders nothing for indices we haven't curated yet (the API
/// returns 400, the repository maps that to null).
class _IndexConstituentsSection extends ConsumerStatefulWidget {
  const _IndexConstituentsSection({required this.indexSymbol});
  final String indexSymbol;

  @override
  ConsumerState<_IndexConstituentsSection> createState() =>
      _IndexConstituentsSectionState();
}

class _IndexConstituentsSectionState
    extends ConsumerState<_IndexConstituentsSection> {
  late Future<List<IndexMember>?> _future;

  @override
  void initState() {
    super.initState();
    _future = ref
        .read(marketRepositoryProvider)
        .getIndexConstituents(widget.indexSymbol);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return FutureBuilder<List<IndexMember>?>(
      future: _future,
      builder: (context, snap) {
        if (snap.connectionState == ConnectionState.waiting) {
          return const SizedBox.shrink();
        }
        final members = snap.data;
        if (members == null || members.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Row(
                children: [
                  Icon(
                    Icons.dynamic_feed,
                    size: 14,
                    color: scheme.onSurface.withValues(alpha: 0.7),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Constituents',
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 14,
                      color: scheme.onSurface.withValues(alpha: 0.85),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${members.length} stocks',
                    style: TextStyle(
                      fontSize: 11,
                      color: scheme.onSurface.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
            Container(
              decoration: BoxDecoration(
                color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: 0.3),
                ),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < members.length; i++) ...[
                    _ConstituentRow(member: members[i]),
                    if (i != members.length - 1)
                      Divider(
                        height: 1,
                        thickness: 1,
                        color: scheme.outlineVariant.withValues(alpha: 0.15),
                      ),
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ConstituentRow extends StatelessWidget {
  const _ConstituentRow({required this.member});
  final IndexMember member;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ltp = member.ltp;
    final pct = member.changePct;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? _upColor : _downColor;
    final tradable = member.symboltoken != null && member.symboltoken!.isNotEmpty;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: tradable
          ? () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SymbolDetailScreen(
                    symbol: member.symbol,
                    tradingsymbol: member.tradingsymbol ?? member.symbol,
                    symboltoken: member.symboltoken!,
                    exchange: member.exchange,
                  ),
                ),
              )
          : null,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    member.symbol,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    member.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
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
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                if (pct != null)
                  Text(
                    '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%',
                    style: TextStyle(
                      color: pctColor,
                      fontWeight: FontWeight.w700,
                      fontSize: 11.5,
                    ),
                  )
                else
                  Text(
                    tradable ? '' : 'Unlisted',
                    style: TextStyle(
                      fontSize: 10.5,
                      color: scheme.onSurface.withValues(alpha: 0.45),
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
