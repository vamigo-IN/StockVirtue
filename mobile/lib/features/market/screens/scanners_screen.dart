import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_names.dart';
import '../../../core/money_format.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../market_repository.dart';

enum _ScannerKind { volume, near52High, near52Low }

extension on _ScannerKind {
  String get queryParam => switch (this) {
        _ScannerKind.volume => 'volume',
        _ScannerKind.near52High => '52w-high',
        _ScannerKind.near52Low => '52w-low',
      };

  String get label => switch (this) {
        _ScannerKind.volume => 'Volume shockers',
        _ScannerKind.near52High => 'Near 52w high',
        _ScannerKind.near52Low => 'Near 52w low',
      };

  IconData get icon => switch (this) {
        _ScannerKind.volume => Icons.show_chart,
        _ScannerKind.near52High => Icons.trending_up,
        _ScannerKind.near52Low => Icons.trending_down,
      };

  Color get tint => switch (this) {
        _ScannerKind.volume => const Color(0xFF06B6D4),
        _ScannerKind.near52High => const Color(0xFF22C55E),
        _ScannerKind.near52Low => const Color(0xFFEF4444),
      };

  String get subtitle => switch (this) {
        _ScannerKind.volume =>
          'Highest tradeVolume across the curated large/mid/small-cap universe today',
        _ScannerKind.near52High =>
          'Stocks within 2% of their 52-week high — momentum / breakout candidates',
        _ScannerKind.near52Low =>
          'Stocks within 2% of their 52-week low — reversal / value candidates',
      };
}

final _scannerProvider =
    FutureProvider.autoDispose.family<List<ScannerHit>, _ScannerKind>(
  (ref, kind) => ref.watch(marketRepositoryProvider).runScanner(
        type: kind.queryParam,
      ),
);

/// Stock-screeners screen — three tabs powered by the curated universe and
/// a single FULL-mode multi-quote call per tab on the backend. Results
/// auto-dispose when the tab is left so we don't keep re-fetching.
class ScannersScreen extends ConsumerStatefulWidget {
  const ScannersScreen({super.key});

  @override
  ConsumerState<ScannersScreen> createState() => _ScannersScreenState();
}

class _ScannersScreenState extends ConsumerState<ScannersScreen> {
  _ScannerKind _kind = _ScannerKind.volume;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_scannerProvider(_kind));
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Scanners',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(60),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  for (final k in _ScannerKind.values)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: _Chip(
                        kind: k,
                        selected: k == _kind,
                        onTap: () => setState(() => _kind = k),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(_scannerProvider(_kind));
          await ref.read(_scannerProvider(_kind).future);
        },
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            children: [
              Padding(padding: const EdgeInsets.all(24), child: Text('$e')),
            ],
          ),
          data: (rows) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              _SubtitleCard(kind: _kind),
              const SizedBox(height: 12),
              if (rows.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 32),
                  child: Center(
                    child: Text(
                      'No matches right now',
                      style: TextStyle(
                        color: Theme.of(context)
                            .colorScheme
                            .onSurface
                            .withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                )
              else
                for (final r in rows) ...[
                  _HitTile(hit: r, kind: _kind),
                  const SizedBox(height: 8),
                ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.kind,
    required this.selected,
    required this.onTap,
  });

  final _ScannerKind kind;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected
              ? kind.tint.withValues(alpha: 0.2)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected
                ? kind.tint.withValues(alpha: 0.5)
                : scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              kind.icon,
              size: 14,
              color: selected
                  ? kind.tint
                  : scheme.onSurface.withValues(alpha: 0.65),
            ),
            const SizedBox(width: 5),
            Text(
              kind.label,
              style: TextStyle(
                color: selected
                    ? kind.tint
                    : scheme.onSurface.withValues(alpha: 0.7),
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SubtitleCard extends StatelessWidget {
  const _SubtitleCard({required this.kind});
  final _ScannerKind kind;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: kind.tint.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: kind.tint.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        children: [
          Icon(kind.icon, color: kind.tint, size: 16),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              kind.subtitle,
              style: TextStyle(
                fontSize: 11.5,
                color: scheme.onSurface.withValues(alpha: 0.75),
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HitTile extends StatelessWidget {
  const _HitTile({required this.hit, required this.kind});
  final ScannerHit hit;
  final _ScannerKind kind;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ltp = hit.ltp;
    final dayPct = hit.dayChangePct;
    final isUp = (dayPct ?? 0) >= 0;
    final upColor = const Color(0xFF22C55E);
    final downColor = const Color(0xFFEF4444);
    final pctColor = isUp ? upColor : downColor;

    String secondary;
    switch (kind) {
      case _ScannerKind.volume:
        final v = hit.tradeVolume ?? 0;
        secondary = 'Volume ${_compact(v)}';
        break;
      case _ScannerKind.near52High:
        final high = hit.yearHigh;
        final fromHigh = hit.fromHighPct;
        secondary = high != null
            ? '52w high ${high.toStringAsFixed(2)} · '
                '${fromHigh != null ? '${fromHigh.toStringAsFixed(2)}%' : '—'}'
            : '';
        break;
      case _ScannerKind.near52Low:
        final low = hit.yearLow;
        final fromLow = hit.fromLowPct;
        secondary = low != null
            ? '52w low ${low.toStringAsFixed(2)} · '
                '+${(fromLow ?? 0).toStringAsFixed(2)}%'
            : '';
        break;
    }

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: hit.symbol,
            tradingsymbol: hit.tradingsymbol,
            symboltoken: hit.symboltoken,
            exchange: hit.exchange,
          ),
        ),
      ),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    companyNameFor(hit.symbol),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    secondary,
                    style: TextStyle(
                      fontSize: 11.5,
                      color: scheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  ltp != null ? formatInr(ltp) : '—',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                if (dayPct != null)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: pctColor.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: Text(
                      '${isUp ? '+' : ''}${dayPct.toStringAsFixed(2)}%',
                      style: TextStyle(
                        color: pctColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
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

String _compact(double v) {
  final abs = v.abs();
  if (abs >= 10000000) return '${(v / 10000000).toStringAsFixed(2)} Cr';
  if (abs >= 100000) return '${(v / 100000).toStringAsFixed(2)} L';
  if (abs >= 1000) return '${(v / 1000).toStringAsFixed(1)} K';
  return v.toStringAsFixed(0);
}
