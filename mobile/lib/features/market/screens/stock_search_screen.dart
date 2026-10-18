import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/error_mapper.dart';
import '../../../widgets/ui/skeletons.dart';
import '../../../widgets/ui/stock_logo.dart';
import '../../home/home_providers.dart';
import '../../home/indices_universe.dart';
import '../../home/recently_viewed_storage.dart';
import '../../portfolio/screens/sector_heatmap_screen.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../watchlists/watchlists_providers.dart';
import '../../watchlists/watchlists_repository.dart';
import '../market_repository.dart';

class StockSearchScreen extends ConsumerStatefulWidget {
  /// When [watchlistId] is provided, tapping a result adds it to that list.
  /// When null (e.g., launched from the home search pill), tapping opens the
  /// symbol detail screen instead.
  const StockSearchScreen({super.key, this.watchlistId});
  final String? watchlistId;

  @override
  ConsumerState<StockSearchScreen> createState() => _StockSearchScreenState();
}

class _StockSearchScreenState extends ConsumerState<StockSearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';
  Future<List<StockSearchResult>>? _resultsFuture;
  final _adding = <String>{};

  bool get _addMode => widget.watchlistId != null;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onChanged);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 250), _runSearch);
  }

  void _runSearch() {
    if (!mounted) return;
    setState(() {
      _query = _controller.text.trim();
      _resultsFuture = _query.isEmpty
          ? null
          : ref.read(marketRepositoryProvider).search(_query);
    });
  }

  Future<void> _addFor(String symbol, String exchange, String token) async {
    final listId = widget.watchlistId;
    if (listId == null) return;
    if (_adding.contains(token)) return;
    setState(() => _adding.add(token));
    try {
      await ref
          .read(watchlistsRepositoryProvider)
          .addItem(listId, symbol, exchange);
      ref.invalidate(watchlistsListProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${companyNameFor(symbol)} to watchlist')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(friendlyError(e, context: 'watchlist')),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    } finally {
      if (mounted) setState(() => _adding.remove(token));
    }
  }

  void _openDetailFor(
    String symbol,
    String tradingsymbol,
    String token,
    String exchange,
  ) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SymbolDetailScreen(
          symbol: symbol,
          tradingsymbol: tradingsymbol,
          symboltoken: token,
          exchange: exchange,
        ),
      ),
    );
  }

  /// Add to the watchlist (add-mode) or open the detail screen otherwise.
  void _select({
    required String symbol,
    required String tradingsymbol,
    required String symboltoken,
    required String exchange,
  }) {
    if (_addMode) {
      _addFor(symbol, exchange, symboltoken);
    } else {
      _openDetailFor(symbol, tradingsymbol, symboltoken, exchange);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          controller: _controller,
          autofocus: true,
          decoration: InputDecoration(
            hintText: 'Search “Kotak”, “Tata Motors”, “NIFTY”…',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
            hintStyle: TextStyle(
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.5),
            ),
          ),
        ),
        actions: [
          if (_controller.text.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.clear),
              onPressed: () => _controller.clear(),
            ),
        ],
      ),
      body: _resultsFuture == null
          ? _buildSuggestions()
          : FutureBuilder<List<StockSearchResult>>(
              future: _resultsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const SkeletonList(rows: 7);
                }
                if (snapshot.hasError) {
                  return _Hint(
                    icon: Icons.error_outline,
                    text: friendlyError(snapshot.error, context: 'search'),
                  );
                }
                final results = snapshot.data ?? const [];
                if (results.isEmpty) {
                  return _Hint(
                    icon: Icons.search_off,
                    text: 'No stocks match “$_query”.\n'
                        'Try the company name or the NSE symbol.',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: results.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = results[i];
                    final busy = _adding.contains(r.symboltoken);
                    return _ResultTile(
                      result: r,
                      busy: busy,
                      addMode: _addMode,
                      onTap: busy
                          ? null
                          : () => _select(
                                symbol: r.symbol,
                                tradingsymbol: r.tradingsymbol,
                                symboltoken: r.symboltoken,
                                exchange: r.exchange,
                              ),
                    );
                  },
                );
              },
            ),
    );
  }

  /// Empty-state content shown before the user types: recent views, trending
  /// stocks and sector shortcuts so the page is never blank.
  Widget _buildSuggestions() {
    final recent = ref.watch(recentlyViewedProvider).value ?? const <RecentSymbol>[];
    final trending = ref.watch(homeTrendingProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 28),
      children: [
        if (recent.isNotEmpty) ...[
          const _SectionLabel('Recent'),
          for (final r in recent.take(6))
            _SuggestionTile(
              symbol: r.symbol,
              sub: r.tradingsymbol,
              exchange: r.exchange,
              busy: _adding.contains(r.symboltoken),
              addMode: _addMode,
              onTap: () => _select(
                symbol: r.symbol,
                tradingsymbol: r.tradingsymbol,
                symboltoken: r.symboltoken,
                exchange: r.exchange,
              ),
            ),
          const SizedBox(height: 14),
        ],
        const _SectionLabel('Trending'),
        trending.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 28),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const SizedBox.shrink(),
          data: (list) => Column(
            children: [
              for (final q in list.take(8))
                _SuggestionTile(
                  symbol: q.symbol,
                  sub: q.tradingsymbol,
                  exchange: q.exchange,
                  ltp: q.ltp,
                  busy: _adding.contains(q.symboltoken),
                  addMode: _addMode,
                  onTap: () => _select(
                    symbol: q.symbol,
                    tradingsymbol: q.tradingsymbol,
                    symboltoken: q.symboltoken,
                    exchange: q.exchange,
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const _SectionLabel('Sectors'),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final s in sectoralIndices.take(10))
                _SectorChip(
                  label: s.fullName,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const SectorHeatmapScreen(),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}

/// Compact tile used in the search empty-state (recent + trending lists).
class _SuggestionTile extends StatelessWidget {
  const _SuggestionTile({
    required this.symbol,
    required this.sub,
    required this.exchange,
    required this.onTap,
    required this.busy,
    required this.addMode,
    this.ltp,
  });

  final String symbol;
  final String sub;
  final String exchange;
  final double? ltp;
  final bool busy;
  final bool addMode;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      dense: true,
      leading: StockLogo(symbol: symbol, exchange: exchange, size: 38),
      title: Text(
        companyNameFor(symbol),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
      subtitle: Text(
        '$symbol · $exchange',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 11.5,
          color: scheme.onSurface.withValues(alpha: 0.6),
        ),
      ),
      trailing: busy
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : ltp != null
              ? Text(
                  ltp!.toStringAsFixed(2),
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                )
              : Icon(
                  addMode ? Icons.add_circle_outline : Icons.chevron_right,
                  color: scheme.onSurface.withValues(alpha: 0.5),
                  size: 20,
                ),
      onTap: busy ? null : onTap,
    );
  }
}

class _SectorChip extends StatelessWidget {
  const _SectorChip({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.35),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({
    required this.result,
    required this.busy,
    required this.addMode,
    required this.onTap,
  });

  final StockSearchResult result;
  final bool busy;
  final bool addMode;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    // Company name first ("Kotak Mahindra Bank"), ticker underneath — the
    // way people actually think about a stock.
    final name = result.companyName ?? companyNameFor(result.symbol);
    final showTicker = name.toUpperCase() != result.symbol.toUpperCase();
    return ListTile(
      leading: StockLogo(
        symbol: result.symbol,
        exchange: result.exchange,
        size: 40,
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: 14.5,
              ),
            ),
          ),
          if (result.type != 'EQUITY') ...[
            const SizedBox(width: 8),
            _TypeBadge(type: result.type),
          ],
        ],
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Text(
          showTicker
              ? '${result.symbol} · ${result.exchange}'
              : '${result.exchange} · ${result.tradingsymbol}',
          style: TextStyle(
            fontSize: 12,
            color: scheme.onSurface.withValues(alpha: 0.6),
          ),
        ),
      ),
      trailing: busy
          ? const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(
              addMode ? Icons.add_circle_outline : Icons.chevron_right,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
      onTap: onTap,
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type});
  final String type;

  @override
  Widget build(BuildContext context) {
    final color = switch (type) {
      'INDEX' => Colors.blueAccent,
      'OPTION' => Colors.purpleAccent,
      'FUTURE' => Colors.orangeAccent,
      _ => Colors.grey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        type,
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

class _Hint extends StatelessWidget {
  const _Hint({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 48,
            color: Theme.of(context)
                .colorScheme
                .onSurface
                .withValues(alpha: 0.3),
          ),
          const SizedBox(height: 12),
          Text(
            text,
            style: TextStyle(
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}
