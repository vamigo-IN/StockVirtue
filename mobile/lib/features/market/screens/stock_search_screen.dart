import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

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
  String _exchange = 'NSE';
  Future<List<StockSearchResult>>? _resultsFuture;
  final _adding = <String>{};

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
          : ref
              .read(marketRepositoryProvider)
              .search(_query, exchange: _exchange);
    });
  }

  void _setExchange(String ex) {
    if (ex == _exchange) return;
    setState(() => _exchange = ex);
    if (_query.isNotEmpty) _runSearch();
  }

  Future<void> _add(StockSearchResult r) async {
    final listId = widget.watchlistId;
    if (listId == null) return;
    if (_adding.contains(r.symboltoken)) return;
    setState(() => _adding.add(r.symboltoken));
    try {
      await ref
          .read(watchlistsRepositoryProvider)
          .addItem(listId, r.symbol, r.exchange);
      ref.invalidate(watchlistsListProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Added ${r.symbol}')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed: $e'),
          backgroundColor: Colors.redAccent,
        ),
      );
    } finally {
      if (mounted) setState(() => _adding.remove(r.symboltoken));
    }
  }

  void _openDetail(StockSearchResult r) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SymbolDetailScreen(
          symbol: r.symbol,
          tradingsymbol: r.tradingsymbol,
          symboltoken: r.symboltoken,
          exchange: r.exchange,
        ),
      ),
    );
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
            hintText: 'Search by name or symbol',
            border: InputBorder.none,
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
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: _ExchangeToggle(
              selected: _exchange,
              onChanged: _setExchange,
            ),
          ),
        ),
      ),
      body: _resultsFuture == null
          ? const _Hint(
              icon: Icons.search,
              text: 'Type a symbol or company name',
            )
          : FutureBuilder<List<StockSearchResult>>(
              future: _resultsFuture,
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (snapshot.hasError) {
                  return _Hint(icon: Icons.error, text: '${snapshot.error}');
                }
                final results = snapshot.data ?? const [];
                if (results.isEmpty) {
                  return _Hint(
                    icon: Icons.search_off,
                    text: 'No matches for "$_query" on $_exchange',
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  itemCount: results.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final r = results[i];
                    final busy = _adding.contains(r.symboltoken);
                    final addMode = widget.watchlistId != null;
                    return _ResultTile(
                      result: r,
                      busy: busy,
                      addMode: addMode,
                      onTap: busy
                          ? null
                          : () => addMode ? _add(r) : _openDetail(r),
                    );
                  },
                );
              },
            ),
    );
  }
}

class _ExchangeToggle extends StatelessWidget {
  const _ExchangeToggle({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    Widget tab(String label, IconData icon) {
      final isActive = label == selected;
      return Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: () => onChanged(label),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: isActive
                  ? scheme.primary
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  icon,
                  size: 14,
                  color: isActive
                      ? scheme.onPrimary
                      : scheme.onSurface.withValues(alpha: 0.65),
                ),
                const SizedBox(width: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    letterSpacing: 0.3,
                    color: isActive
                        ? scheme.onPrimary
                        : scheme.onSurface.withValues(alpha: 0.65),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          tab('NSE', Icons.account_balance_outlined),
          tab('BSE', Icons.account_balance),
        ],
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
    final color = _hashColor(result.symbol);
    return ListTile(
      leading: Container(
        width: 38,
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          result.symbol.isNotEmpty ? result.symbol[0] : '?',
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w800,
            fontSize: 15,
          ),
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              result.symbol,
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
          '${result.exchange} • ${result.tradingsymbol}',
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

const _badgeColors = [
  Color(0xFF6366F1),
  Color(0xFFEC4899),
  Color(0xFFF59E0B),
  Color(0xFF10B981),
  Color(0xFF06B6D4),
  Color(0xFF8B5CF6),
  Color(0xFFEF4444),
  Color(0xFF14B8A6),
];

Color _hashColor(String s) {
  var h = 0;
  for (final c in s.codeUnits) {
    h = (h * 31 + c) & 0x7FFFFFFF;
  }
  return _badgeColors[h % _badgeColors.length];
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
