import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/black_scholes.dart';
import '../../../core/money_format.dart';
import '../../../data/models/option_chain.dart';
import '../../../data/models/tick.dart';
import '../../home/home_providers.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../widgets/greeks_sheet.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);
// Call legs are bullish (green-leaning), puts bearish (pink-leaning).
const _callTint = Color(0xFF22C55E);
const _putTint = Color(0xFFEF4444);

class OptionChainScreen extends ConsumerStatefulWidget {
  const OptionChainScreen({super.key, required this.underlying});
  final String underlying;

  @override
  ConsumerState<OptionChainScreen> createState() => _OptionChainScreenState();
}

class _OptionChainScreenState extends ConsumerState<OptionChainScreen> {
  Future<List<String>>? _expiriesFuture;
  Future<OptionChain>? _chainFuture;
  String? _selectedExpiry;
  double? _pcr;
  // The underlying's REST quote — gives us its tick key (exchange:token)
  // for the live LTP subscription, and a `close` so we can show day-change
  // on the spot bar. Looked up from the shared indices feed so we don't
  // fire an extra request the home screen already paid for.
  FeedQuote? _underlying;
  TickSubscription? _underlyingSub;

  @override
  void initState() {
    super.initState();
    _expiriesFuture = ref
        .read(marketRepositoryProvider)
        .getExpiries(widget.underlying)
        .then((list) {
      if (mounted && list.isNotEmpty) {
        setState(() {
          _selectedExpiry = list.first;
          _loadChain(list.first);
        });
      }
      return list;
    });
    ref.read(marketRepositoryProvider).getPCR().then((rows) {
      if (!mounted) return;
      for (final r in rows) {
        if (r.tradingsymbol.toUpperCase() ==
            widget.underlying.toUpperCase()) {
          setState(() => _pcr = r.pcr);
          break;
        }
      }
    }).catchError((_) {});
    // Resolve the underlying's tick key once the indices feed loads, then
    // subscribe so the spot bar updates without a poll. The feed is a
    // future, so we hook it via the post-frame callback rather than
    // ref.watch (initState can't subscribe to providers reactively).
    WidgetsBinding.instance.addPostFrameCallback((_) => _resolveUnderlying());
  }

  Future<void> _resolveUnderlying() async {
    try {
      final list = await ref.read(allIndexQuotesProvider.future);
      if (!mounted) return;
      final upper = widget.underlying.toUpperCase();
      for (final q in list) {
        if (q.symbol.toUpperCase() == upper) {
          setState(() => _underlying = q);
          final sub =
              TickSubscription(symbol: q.symbol, exchange: q.exchange);
          ref.read(ticksServiceProvider).subscribe([sub]);
          _underlyingSub = sub;
          break;
        }
      }
    } catch (_) {
      // Best-effort. Spot bar still renders from the chain payload's spot.
    }
  }

  @override
  void dispose() {
    final sub = _underlyingSub;
    if (sub != null) {
      ref.read(ticksServiceProvider).unsubscribe([sub]);
    }
    super.dispose();
  }

  void _loadChain(String expiry) {
    _chainFuture = ref
        .read(marketRepositoryProvider)
        .getOptionChain(widget.underlying, expiry);
  }

  void _openLeg(OptionLeg leg) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SymbolDetailScreen(
          symbol: leg.tradingsymbol,
          tradingsymbol: leg.tradingsymbol,
          symboltoken: leg.symboltoken,
          exchange: leg.exchange,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '${widget.underlying} options',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: FutureBuilder<List<String>>(
        future: _expiriesFuture,
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('${snap.error}'),
              ),
            );
          }
          final expiries = snap.data ?? const [];
          if (expiries.isEmpty) {
            return const Center(child: Text('No expiries found'));
          }
          return Column(
            children: [
              if (_pcr != null) _PcrChip(pcr: _pcr!),
              _ExpiryRow(
                expiries: expiries,
                selected: _selectedExpiry,
                onSelected: (e) {
                  setState(() {
                    _selectedExpiry = e;
                    _loadChain(e);
                  });
                },
              ),
              const Divider(height: 1),
              Expanded(
                child: FutureBuilder<OptionChain>(
                  future: _chainFuture,
                  builder: (context, csnap) {
                    if (csnap.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (csnap.hasError) {
                      return Center(child: Text('${csnap.error}'));
                    }
                    final chain = csnap.data;
                    if (chain == null || chain.strikes.isEmpty) {
                      return const Center(child: Text('No strikes'));
                    }
                    return _ChainBody(
                      chain: chain,
                      underlying: _underlying,
                      onOpenLeg: _openLeg,
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ChainBody extends StatefulWidget {
  const _ChainBody({
    required this.chain,
    required this.underlying,
    required this.onOpenLeg,
  });
  final OptionChain chain;
  /// Underlying's REST quote — supplies the tick key and yesterday's close
  /// so the spot bar can show a live day-change badge. Null while the
  /// background lookup hasn't returned yet.
  final FeedQuote? underlying;
  final ValueChanged<OptionLeg> onOpenLeg;

  @override
  State<_ChainBody> createState() => _ChainBodyState();
}

class _ChainBodyState extends State<_ChainBody> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    // Auto-scroll to the ATM strike on first paint so the user lands on
    // the actionable rows instead of the deepest OTM tail.
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToAtm());
  }

  @override
  void didUpdateWidget(covariant _ChainBody old) {
    super.didUpdateWidget(old);
    if (old.chain.expiry != widget.chain.expiry) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToAtm());
    }
  }

  void _scrollToAtm() {
    if (!_scroll.hasClients) return;
    final atm = widget.chain.atmStrike;
    if (atm == null) return;
    final i = widget.chain.strikes.indexWhere((r) => r.strike == atm);
    if (i < 0) return;
    const rowHeight = 56.0;
    final target =
        (i * rowHeight) - (_scroll.position.viewportDimension / 2) + 28;
    _scroll.animateTo(
      target.clamp(0.0, _scroll.position.maxScrollExtent),
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chain = widget.chain;
    final atm = chain.atmStrike;
    final peakOI = chain.peakOI;
    return Column(
      children: [
        if (chain.spot != null)
          _SpotBar(
            fallbackSpot: chain.spot!,
            underlying: widget.underlying,
          ),
        const _ChainHeader(),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            itemCount: chain.strikes.length,
            itemBuilder: (context, i) {
              final row = chain.strikes[i];
              final spot = chain.spot;
              // ITM call: strike < spot. ITM put: strike > spot.
              final callItm = spot != null && row.strike < spot;
              final putItm = spot != null && row.strike > spot;
              final isAtm = atm != null && row.strike == atm;
              return _ChainRow(
                row: row,
                callItm: callItm,
                putItm: putItm,
                isAtm: isAtm,
                peakOI: peakOI,
                spot: spot,
                expiry: widget.chain.expiry,
                onTap: widget.onOpenLeg,
              );
            },
          ),
        ),
      ],
    );
  }
}

/// Live spot ribbon at the top of the chain. Three data layers stacked
/// in priority order:
///   1. Latest tick LTP for the underlying (when subscribed + ticking).
///   2. The REST-fetched FeedQuote.ltp (covers the first paint window
///      before any tick arrives, and the case where the market is shut).
///   3. The spot embedded in the option-chain payload (last-resort).
/// A green/red day-change chip rides alongside whenever we have a
/// previous-day close to compare against.
class _SpotBar extends ConsumerWidget {
  const _SpotBar({
    required this.fallbackSpot,
    required this.underlying,
  });
  final double fallbackSpot;
  final FeedQuote? underlying;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final tickKey = underlying == null
        ? null
        : '${underlying!.exchange}:${underlying!.symboltoken}';
    final tick = tickKey == null
        ? null
        : ref.watch(latestTicksProvider.select<Tick?>((m) => m[tickKey]));
    final live = tick?.ltp ?? underlying?.ltp ?? fallbackSpot;
    final close = underlying?.close;
    double? changePct;
    double? change;
    if (close != null && close > 0) {
      change = live - close;
      changePct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    const upColor = Color(0xFF22C55E);
    const downColor = Color(0xFFEF4444);
    final pctColor = isUp ? upColor : downColor;
    final hasLiveStream = tick != null;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.1),
        border: Border(
          bottom: BorderSide(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
      ),
      child: Row(
        children: [
          Icon(Icons.center_focus_strong, color: scheme.primary, size: 14),
          const SizedBox(width: 6),
          Text(
            'Spot ',
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.6),
              fontWeight: FontWeight.w600,
            ),
          ),
          Text(
            formatInr(live),
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
          if (changePct != null) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: pctColor.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                '${isUp ? '+' : ''}${change!.toStringAsFixed(2)} '
                '(${changePct.toStringAsFixed(2)}%)',
                style: TextStyle(
                  color: pctColor,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.2,
                ),
              ),
            ),
          ],
          const Spacer(),
          if (hasLiveStream) ...[
            // Tiny pulse dot signals "the LTP you see is from a live tick,
            // not a snapshot". Stays solid (no animation needed) since the
            // value beside it is what actually moves.
            Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: upColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              'LIVE',
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: scheme.onSurface.withValues(alpha: 0.65),
              ),
            ),
            const SizedBox(width: 8),
          ],
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              'ATM auto-scrolled',
              style: TextStyle(
                fontSize: 9.5,
                color: scheme.onSurface.withValues(alpha: 0.55),
                fontWeight: FontWeight.w700,
                letterSpacing: 0.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChainHeader extends StatelessWidget {
  const _ChainHeader();

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    const cellStyle = TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Row(
              children: [
                Expanded(
                  child: Text('CALL OI',
                      style: cellStyle.copyWith(color: muted),
                      textAlign: TextAlign.left),
                ),
                Expanded(
                  child: Text('LTP',
                      style: cellStyle.copyWith(color: muted),
                      textAlign: TextAlign.right),
                ),
              ],
            ),
          ),
          Expanded(
            flex: 2,
            child: Text('STRIKE',
                style: cellStyle.copyWith(color: muted),
                textAlign: TextAlign.center),
          ),
          Expanded(
            flex: 5,
            child: Row(
              children: [
                Expanded(
                  child: Text('LTP',
                      style: cellStyle.copyWith(color: muted),
                      textAlign: TextAlign.left),
                ),
                Expanded(
                  child: Text('PUT OI',
                      style: cellStyle.copyWith(color: muted),
                      textAlign: TextAlign.right),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ChainRow extends StatelessWidget {
  const _ChainRow({
    required this.row,
    required this.callItm,
    required this.putItm,
    required this.isAtm,
    required this.peakOI,
    required this.spot,
    required this.expiry,
    required this.onTap,
  });

  final OptionChainRow row;
  final bool callItm;
  final bool putItm;
  final bool isAtm;
  final double peakOI;
  final double? spot;
  final String expiry;
  final ValueChanged<OptionLeg> onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final callBg = callItm
        ? _callTint.withValues(alpha: 0.07)
        : Colors.transparent;
    final putBg =
        putItm ? _putTint.withValues(alpha: 0.07) : Colors.transparent;
    final atmDeco = isAtm
        ? BoxDecoration(
            color: scheme.primary.withValues(alpha: 0.1),
            border: Border(
              top: BorderSide(color: scheme.primary, width: 1.2),
              bottom: BorderSide(color: scheme.primary, width: 1.2),
            ),
          )
        : null;
    return Container(
      decoration: atmDeco,
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Container(
              color: callBg,
              child: _LegCell(
                leg: row.call,
                isCall: true,
                peakOI: peakOI,
                strike: row.strike,
                spot: spot,
                expiry: expiry,
                onTap: onTap,
              ),
            ),
          ),
          SizedBox(
            width: 0,
            child: Container(width: 1, color: scheme.outlineVariant),
          ),
          Expanded(
            flex: 2,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              alignment: Alignment.center,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    row.strike.toStringAsFixed(
                      row.strike % 1 == 0 ? 0 : 2,
                    ),
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 13,
                      color: isAtm ? scheme.primary : null,
                    ),
                  ),
                  if (isAtm)
                    Padding(
                      padding: const EdgeInsets.only(top: 1),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 4,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: scheme.primary.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Text(
                          'ATM',
                          style: TextStyle(
                            fontSize: 8,
                            color: scheme.primary,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            flex: 5,
            child: Container(
              color: putBg,
              child: _LegCell(
                leg: row.put,
                isCall: false,
                peakOI: peakOI,
                strike: row.strike,
                spot: spot,
                expiry: expiry,
                onTap: onTap,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LegCell extends StatelessWidget {
  const _LegCell({
    required this.leg,
    required this.isCall,
    required this.peakOI,
    required this.strike,
    required this.spot,
    required this.expiry,
    required this.onTap,
  });
  final OptionLeg? leg;
  final bool isCall;
  final double peakOI;
  final double strike;
  final double? spot;
  final String expiry;
  final ValueChanged<OptionLeg> onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (leg == null) {
      return SizedBox(
        height: 56,
        child: Center(
          child: Text(
            '—',
            style: TextStyle(
              color: scheme.onSurface.withValues(alpha: 0.3),
            ),
          ),
        ),
      );
    }
    final oi = leg!.opnInterest ?? 0;
    final oiBarWidth = peakOI > 0 ? (oi / peakOI).clamp(0.0, 1.0) : 0.0;
    final pct = leg!.changePct;
    final isUp = (pct ?? 0) >= 0;
    final pctColor = isUp ? _upColor : _downColor;
    // OI bar sits behind the cell, aligned to the outer edge:
    //   - Call cell → bar grows from the LEFT (toward the centre/strike)
    //   - Put cell  → bar grows from the RIGHT (toward the centre/strike)
    // This gives the classic "more OI = taller bar inward" Groww layout.
    return InkWell(
      onTap: () => onTap(leg!),
      onLongPress: spot == null
          ? null
          : () => showGreeksSheet(
                context,
                leg: leg!,
                strike: strike,
                spot: spot!,
                expiry: expiry,
                right: isCall ? OptionRight.call : OptionRight.put,
              ),
      child: SizedBox(
        height: 56,
        child: Stack(
          children: [
            Positioned.fill(
              child: Align(
                alignment:
                    isCall ? Alignment.centerLeft : Alignment.centerRight,
                child: FractionallySizedBox(
                  widthFactor: oiBarWidth,
                  heightFactor: 1,
                  child: Container(
                    color: (isCall ? _callTint : _putTint)
                        .withValues(alpha: 0.13),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  if (isCall) ...[
                    Expanded(
                      child: Text(
                        _compactOI(oi),
                        textAlign: TextAlign.left,
                        style: TextStyle(
                          fontSize: 11,
                          color: scheme.onSurface.withValues(alpha: 0.65),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            leg!.ltp != null
                                ? leg!.ltp!.toStringAsFixed(2)
                                : '—',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          if (pct != null)
                            Text(
                              '${isUp ? '+' : ''}${pct.toStringAsFixed(1)}%',
                              style: TextStyle(
                                color: pctColor,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ] else ...[
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            leg!.ltp != null
                                ? leg!.ltp!.toStringAsFixed(2)
                                : '—',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                          if (pct != null)
                            Text(
                              '${isUp ? '+' : ''}${pct.toStringAsFixed(1)}%',
                              style: TextStyle(
                                color: pctColor,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: Text(
                        _compactOI(oi),
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 11,
                          color: scheme.onSurface.withValues(alpha: 0.65),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _compactOI(double oi) {
  if (oi <= 0) return '—';
  if (oi >= 10000000) return '${(oi / 10000000).toStringAsFixed(2)}Cr';
  if (oi >= 100000) return '${(oi / 100000).toStringAsFixed(1)}L';
  if (oi >= 1000) return '${(oi / 1000).toStringAsFixed(1)}K';
  return oi.toStringAsFixed(0);
}

class _ExpiryRow extends StatelessWidget {
  const _ExpiryRow({
    required this.expiries,
    required this.selected,
    required this.onSelected,
  });
  final List<String> expiries;
  final String? selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 52,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: expiries.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final e = expiries[i];
          return ChoiceChip(
            label: Text(e),
            selected: e == selected,
            onSelected: (_) => onSelected(e),
          );
        },
      ),
    );
  }
}

class _PcrChip extends StatelessWidget {
  const _PcrChip({required this.pcr});
  final double pcr;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isBullish = pcr < 1;
    final tint =
        isBullish ? const Color(0xFF22C55E) : const Color(0xFFEF4444);
    final label = isBullish ? 'Bullish skew' : 'Bearish / Hedging';
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: tint.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(
                'PCR ${pcr.toStringAsFixed(2)}',
                style: TextStyle(
                  color: tint,
                  fontWeight: FontWeight.w800,
                  fontSize: 11.5,
                  letterSpacing: 0.3,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSurface.withValues(alpha: 0.65),
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Tooltip(
              message:
                  'Put-Call Ratio = total put OI ÷ total call OI. '
                  '>1 typically signals bearish positioning, <1 bullish.',
              triggerMode: TooltipTriggerMode.tap,
              child: Icon(
                Icons.info_outline,
                size: 14,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
