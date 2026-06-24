import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/quote.dart';
import '../../../data/models/tick.dart';
import '../../../data/models/watchlist.dart';
import '../../market/screens/stock_search_screen.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../watchlists_providers.dart';
import '../watchlists_repository.dart';

class WatchlistDetailScreen extends ConsumerStatefulWidget {
  const WatchlistDetailScreen({super.key, required this.watchlistId});
  final String watchlistId;

  @override
  ConsumerState<WatchlistDetailScreen> createState() =>
      _WatchlistDetailScreenState();
}

class _WatchlistDetailScreenState
    extends ConsumerState<WatchlistDetailScreen> {
  List<TickSubscription> _currentSubs = const [];

  /// When non-null, this overrides the watchlist's items for one render
  /// cycle so a drag-to-reorder gets reflected immediately without waiting
  /// for the network round trip + provider invalidation.
  List<WatchlistItem>? _optimisticOrder;

  /// Multi-select mode. When [_selected] is non-empty the screen shifts
  /// into selection UI (checkbox leading + bulk-delete action).
  final Set<String> _selected = <String>{};

  void _syncSubscriptions(List<WatchlistItem> items) {
    final desired = items
        .map((i) => TickSubscription(symbol: i.symbol, exchange: i.exchange))
        .toList();
    final service = ref.read(ticksServiceProvider);
    final existingKeys =
        _currentSubs.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final desiredKeys =
        desired.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final toAdd = desired
        .where((s) => !existingKeys.contains('${s.exchange}:${s.symbol}'))
        .toList();
    final toRemove = _currentSubs
        .where((s) => !desiredKeys.contains('${s.exchange}:${s.symbol}'))
        .toList();
    if (toAdd.isNotEmpty) service.subscribe(toAdd);
    if (toRemove.isNotEmpty) service.unsubscribe(toRemove);
    _currentSubs = desired;
  }

  @override
  void dispose() {
    if (_currentSubs.isNotEmpty) {
      ref.read(ticksServiceProvider).unsubscribe(_currentSubs);
    }
    super.dispose();
  }

  Future<void> _addStock(Watchlist wl) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StockSearchScreen(watchlistId: wl.id),
      ),
    );
  }

  Future<void> _deleteWatchlist(Watchlist wl) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Delete watchlist "${wl.name}"?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(watchlistsRepositoryProvider).delete(wl.id);
      ref.invalidate(watchlistsListProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.redAccent),
      );
    }
  }

  Future<void> _reorder(Watchlist wl, int oldIndex, int newIndex) async {
    // ReorderableListView's quirk: newIndex is "where the item should land
    // after removal", so > oldIndex needs decrementing.
    final next = List<WatchlistItem>.from(_optimisticOrder ?? wl.items);
    if (newIndex > oldIndex) newIndex -= 1;
    final moved = next.removeAt(oldIndex);
    next.insert(newIndex, moved);
    setState(() => _optimisticOrder = next);
    try {
      await ref.read(watchlistsRepositoryProvider).reorderItems(
            wl.id,
            next.map((i) => i.id).toList(),
          );
      ref.invalidate(watchlistsListProvider);
    } catch (e) {
      if (!mounted) return;
      setState(() => _optimisticOrder = null); // revert
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Reorder failed: $e'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  Future<void> _bulkRemove(Watchlist wl) async {
    if (_selected.isEmpty) return;
    final n = _selected.length;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Remove $n stock${n == 1 ? '' : 's'}?'),
        content: const Text('Selected items will be removed from this watchlist.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.redAccent),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final repo = ref.read(watchlistsRepositoryProvider);
    final toRemove = _selected.toList();
    setState(() => _selected.clear());
    // Remove sequentially — each call is small, and one failure shouldn't
    // abort the rest. We surface the first failure if any.
    String? firstError;
    for (final id in toRemove) {
      try {
        await repo.removeItem(wl.id, id);
      } catch (e) {
        firstError ??= '$e';
      }
    }
    ref.invalidate(watchlistsListProvider);
    if (!mounted) return;
    if (firstError != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Some removals failed: $firstError'),
          backgroundColor: Colors.redAccent,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Removed $n stock${n == 1 ? '' : 's'}')),
      );
    }
  }

  void _toggleSelect(String itemId) {
    setState(() {
      if (_selected.contains(itemId)) {
        _selected.remove(itemId);
      } else {
        _selected.add(itemId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(watchlistDetailProvider(widget.watchlistId));
    // Drop the optimistic order if the server-confirmed items match it —
    // we don't want stale local state to outlive a re-fetch.
    detail.whenData((wl) {
      if (wl == null || _optimisticOrder == null) return;
      final serverIds = wl.items.map((i) => i.id).toList();
      final optimisticIds = _optimisticOrder!.map((i) => i.id).toList();
      if (_listsEqual(serverIds, optimisticIds)) {
        _optimisticOrder = null;
      }
    });
    return detail.when(
      loading: () =>
          const Scaffold(body: Center(child: CircularProgressIndicator())),
      error: (e, _) => Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('$e')),
      ),
      data: (wl) {
        if (wl == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Watchlist not found')),
          );
        }
        final items = _optimisticOrder ?? wl.items;
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _syncSubscriptions(items),
        );
        final selectMode = _selected.isNotEmpty;
        return Scaffold(
          appBar: AppBar(
            leading: selectMode
                ? IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: 'Cancel selection',
                    onPressed: () => setState(() => _selected.clear()),
                  )
                : null,
            title: Text(
              selectMode
                  ? '${_selected.length} selected'
                  : wl.name,
            ),
            actions: selectMode
                ? [
                    IconButton(
                      icon: const Icon(Icons.delete_outline),
                      tooltip: 'Remove selected',
                      onPressed: () => _bulkRemove(wl),
                    ),
                  ]
                : [
                    IconButton(
                      icon: const Icon(Icons.delete_sweep_outlined),
                      tooltip: 'Delete watchlist',
                      onPressed: () => _deleteWatchlist(wl),
                    ),
                  ],
          ),
          floatingActionButton: selectMode
              ? null
              : FloatingActionButton.extended(
                  icon: const Icon(Icons.add),
                  label: const Text('Add stock'),
                  onPressed: () => _addStock(wl),
                ),
          body: items.isEmpty
              ? const _EmptyHint()
              : _ItemList(
                  watchlistId: wl.id,
                  items: items,
                  selected: _selected,
                  selectMode: selectMode,
                  onToggleSelect: _toggleSelect,
                  onReorder: (oldIdx, newIdx) =>
                      _reorder(wl, oldIdx, newIdx),
                ),
        );
      },
    );
  }

  bool _listsEqual<T>(List<T> a, List<T> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

class _ItemList extends ConsumerWidget {
  const _ItemList({
    required this.watchlistId,
    required this.items,
    required this.selected,
    required this.selectMode,
    required this.onToggleSelect,
    required this.onReorder,
  });

  final String watchlistId;
  final List<WatchlistItem> items;
  final Set<String> selected;
  final bool selectMode;
  final ValueChanged<String> onToggleSelect;
  final void Function(int oldIndex, int newIndex) onReorder;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotes = ref.watch(watchlistInitialQuotesProvider(watchlistId));
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(watchlistInitialQuotesProvider(watchlistId));
        await ref.read(watchlistInitialQuotesProvider(watchlistId).future);
      },
      child: ReorderableListView.builder(
        padding: const EdgeInsets.only(bottom: 96),
        // Disable the drag affordance while in multi-select mode so taps
        // don't accidentally lift a row mid-selection.
        buildDefaultDragHandles: !selectMode,
        itemCount: items.length,
        onReorder: onReorder,
        itemBuilder: (context, i) {
          final item = items[i];
          final initialQuote = quotes.value?.quotes[item.key];
          return _Row(
            key: ValueKey(item.id),
            item: item,
            initialQuote: initialQuote,
            isSelected: selected.contains(item.id),
            selectMode: selectMode,
            onToggleSelect: () => onToggleSelect(item.id),
          );
        },
      ),
    );
  }
}

class _Row extends ConsumerWidget {
  const _Row({
    required super.key,
    required this.item,
    required this.initialQuote,
    required this.isSelected,
    required this.selectMode,
    required this.onToggleSelect,
  });

  final WatchlistItem item;
  final Quote? initialQuote;
  final bool isSelected;
  final bool selectMode;
  final VoidCallback onToggleSelect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tick = ref.watch(
      latestTicksProvider.select<Tick?>((m) => m[item.key]),
    );

    final ltp = tick?.ltp ?? initialQuote?.ltp;
    final close = initialQuote?.close;
    double? change;
    double? changePct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      changePct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    final color = isUp ? Colors.greenAccent : Colors.redAccent;
    final scheme = Theme.of(context).colorScheme;

    return Material(
      color: isSelected
          ? scheme.primary.withValues(alpha: 0.12)
          : Colors.transparent,
      child: ListTile(
        leading: selectMode
            ? Checkbox(
                value: isSelected,
                onChanged: (_) => onToggleSelect(),
              )
            : null,
        title: Row(
          children: [
            Expanded(
              child: Text(
                item.symbol,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
            Text(
              ltp != null ? '₹${ltp.toStringAsFixed(2)}' : '—',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ],
        ),
        subtitle: Row(
          children: [
            Expanded(
              child: Text(
                '${item.exchange} • ${item.tradingsymbol}',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.6),
                ),
              ),
            ),
            if (change != null && changePct != null)
              Text(
                '${isUp ? '+' : ''}${change.toStringAsFixed(2)} '
                '(${changePct.toStringAsFixed(2)}%)',
                style: TextStyle(color: color, fontWeight: FontWeight.w500),
              ),
          ],
        ),
        onTap: selectMode
            ? onToggleSelect
            : () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => SymbolDetailScreen(
                      symbol: item.symbol,
                      tradingsymbol: item.tradingsymbol,
                      symboltoken: item.symboltoken,
                      exchange: item.exchange,
                    ),
                  ),
                ),
        onLongPress: selectMode ? null : onToggleSelect,
      ),
    );
  }
}

class _EmptyHint extends StatelessWidget {
  const _EmptyHint();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.show_chart,
            size: 48,
            color: scheme.onSurface.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 12),
          Text(
            'No stocks yet. Tap "Add stock" to begin.',
            style: TextStyle(
              color: scheme.onSurface.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }
}
