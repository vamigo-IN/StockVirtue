import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_info.dart';
import '../../../core/money_format.dart';
import '../../../data/models/portfolio.dart';
import '../../../widgets/error_retry_view.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../portfolio_providers.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Risk concentration view — same data the AllocationCard sector
/// donut uses, but expanded into a sortable list with per-sector P&L
/// tiles, weight bars, and the underlying position drill-down. Lets
/// users spot which slice of the portfolio is dragging or leading.
class SectorHeatmapScreen extends ConsumerWidget {
  const SectorHeatmapScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Sector heatmap',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(portfolioProvider);
          await ref.read(portfolioProvider.future);
        },
        child: portfolio.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorRetryView(
            error: e,
            onRetry: () => ref.invalidate(portfolioProvider),
          ),
          data: (snap) => _Body(snap: snap),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    if (snap.positions.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          Center(
            child: Icon(
              Icons.grid_view_outlined,
              size: 48,
              color: scheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              'No positions to map yet',
              style: TextStyle(
                color: scheme.onSurface.withValues(alpha: 0.6),
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      );
    }
    final buckets = _bucketize(snap.positions);
    final totalInvested = buckets.fold<double>(0, (acc, b) => acc + b.invested);
    final totalPnl = buckets.fold<double>(0, (acc, b) => acc + b.unrealizedPnL);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _Hero(
          totalInvested: totalInvested,
          totalPnL: totalPnl,
          sectorCount: buckets.length,
        ),
        const SizedBox(height: 16),
        for (final b in buckets) ...[
          _SectorCard(bucket: b, totalInvested: totalInvested),
          const SizedBox(height: 10),
        ],
      ],
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.totalInvested,
    required this.totalPnL,
    required this.sectorCount,
  });
  final double totalInvested;
  final double totalPnL;
  final int sectorCount;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = totalPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    final pct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0.0;
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.55),
            scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Capital deployed',
            style: TextStyle(
              color: scheme.onSurface.withValues(alpha: 0.65),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            formatInr(totalInvested),
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${isUp ? '+' : ''}${formatInr(totalPnL)} '
                  '(${pct.toStringAsFixed(2)}%)',
                  style: TextStyle(
                    color: color,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                'across $sectorCount sector${sectorCount == 1 ? '' : 's'}',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.6),
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectorCard extends StatelessWidget {
  const _SectorCard({required this.bucket, required this.totalInvested});
  final _Bucket bucket;
  final double totalInvested;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final weight = totalInvested > 0 ? bucket.invested / totalInvested : 0.0;
    final isUp = bucket.unrealizedPnL >= 0;
    final pnlColor = isUp ? _upColor : _downColor;
    final pnlPct =
        bucket.invested > 0 ? (bucket.unrealizedPnL / bucket.invested) * 100 : 0.0;
    return Container(
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
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: bucket.tint,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  bucket.sector,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              Text(
                '${(weight * 100).toStringAsFixed(1)}%',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w700,
                  fontSize: 12.5,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Weight bar — width proportional to share of total capital.
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              height: 6,
              child: Stack(
                children: [
                  Container(
                    color: scheme.surface.withValues(alpha: 0.6),
                  ),
                  FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: weight.clamp(0.0, 1.0),
                    child: Container(color: bucket.tint),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${formatInr(bucket.invested)} invested',
                  style: TextStyle(
                    fontSize: 12,
                    color: scheme.onSurface.withValues(alpha: 0.65),
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
                decoration: BoxDecoration(
                  color: pnlColor.withValues(alpha: 0.16),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${isUp ? '+' : ''}${formatInr(bucket.unrealizedPnL)} '
                  '(${pnlPct.toStringAsFixed(2)}%)',
                  style: TextStyle(
                    color: pnlColor,
                    fontWeight: FontWeight.w800,
                    fontSize: 11.5,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            height: 1,
            color: scheme.outlineVariant.withValues(alpha: 0.2),
          ),
          for (final p in bucket.positions) ...[
            const SizedBox(height: 6),
            _PositionRow(position: p),
          ],
        ],
      ),
    );
  }
}

class _PositionRow extends StatelessWidget {
  const _PositionRow({required this.position});
  final PortfolioPosition position;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = position.unrealizedPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SymbolDetailScreen(
            symbol: position.symbol,
            tradingsymbol: position.tradingsymbol,
            symboltoken: position.symboltoken,
            exchange: position.exchange,
          ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Row(
          children: [
            Expanded(
              child: Text(
                position.symbol,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              formatInr(position.invested),
              style: TextStyle(
                fontSize: 11.5,
                color: scheme.onSurface.withValues(alpha: 0.6),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              '${isUp ? '+' : ''}${position.unrealizedPnLPct.toStringAsFixed(2)}%',
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bucket {
  final String sector;
  final List<PortfolioPosition> positions;
  final double invested;
  final double unrealizedPnL;
  final Color tint;
  const _Bucket({
    required this.sector,
    required this.positions,
    required this.invested,
    required this.unrealizedPnL,
    required this.tint,
  });
}

const _sectorPalette = <Color>[
  Color(0xFF6366F1), // indigo
  Color(0xFF06B6D4), // cyan
  Color(0xFFEC4899), // pink
  Color(0xFFF59E0B), // amber
  Color(0xFF22C55E), // emerald
  Color(0xFF8B5CF6), // violet
  Color(0xFFEF4444), // red
  Color(0xFFFACC15), // yellow
  Color(0xFF14B8A6), // teal
];

List<_Bucket> _bucketize(List<PortfolioPosition> positions) {
  final byKey = <String, List<PortfolioPosition>>{};
  for (final p in positions) {
    if (p.invested.abs() <= 0) continue;
    final sector = companyInfoFor(p.symbol)?.sector ?? 'Other';
    (byKey[sector] ??= []).add(p);
  }
  final out = <_Bucket>[];
  var i = 0;
  for (final entry in byKey.entries) {
    final invested = entry.value.fold<double>(
      0,
      (acc, p) => acc + p.invested.abs(),
    );
    final pnl = entry.value.fold<double>(
      0,
      (acc, p) => acc + p.unrealizedPnL,
    );
    out.add(_Bucket(
      sector: entry.key,
      positions: List.of(entry.value)
        ..sort((a, b) => b.invested.abs().compareTo(a.invested.abs())),
      invested: invested,
      unrealizedPnL: pnl,
      tint: _sectorPalette[i % _sectorPalette.length],
    ));
    i++;
  }
  // Sort sectors by capital deployed, descending — most concentrated first.
  out.sort((a, b) => b.invested.compareTo(a.invested));
  return out;
}
