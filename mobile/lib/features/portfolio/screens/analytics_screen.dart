import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/analytics.dart';
import '../analytics_repository.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// Three-tab analytics page:
///   * By symbol — per-stock realized + trade count + fees
///   * Risk    — Sharpe / Sortino / Max DD / CAGR from snapshot curve
///   * Capital gains — FIFO-allocated disposals, ST vs LT totals
/// All three views drive off the snapshot table + filled-order
/// history that's already in place; no live LTP fetches.
class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Analytics',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'By symbol'),
            Tab(text: 'Risk'),
            Tab(text: 'Cap gains'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: const [
          _BySymbolTab(),
          _RiskTab(),
          _CapGainsTab(),
        ],
      ),
    );
  }
}

// ─── By symbol ─────────────────────────────────────────────────────────

class _BySymbolTab extends ConsumerWidget {
  const _BySymbolTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(perSymbolPnLProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(perSymbolPnLProvider);
        await ref.read(perSymbolPnLProvider.future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [Padding(padding: const EdgeInsets.all(24), child: Text('$e'))],
        ),
        data: (rows) {
          if (rows.isEmpty) {
            return const _EmptyState(
              icon: Icons.bar_chart,
              title: 'No trading yet',
              hint: 'Per-symbol P&L appears once you start placing orders.',
            );
          }
          final sorted = List<SymbolPnL>.from(rows)
            ..sort((a, b) => b.realizedPnL.compareTo(a.realizedPnL));
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              for (final r in sorted) ...[
                _SymbolPnLTile(row: r),
                const SizedBox(height: 8),
              ],
            ],
          );
        },
      ),
    );
  }
}

class _SymbolPnLTile extends StatelessWidget {
  const _SymbolPnLTile({required this.row});
  final SymbolPnL row;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = row.realizedPnL >= 0;
    final color = isUp ? _upColor : _downColor;
    return Container(
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
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        row.symbol,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      row.exchange,
                      style: TextStyle(
                        fontSize: 10,
                        color: scheme.onSurface.withValues(alpha: 0.55),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${row.trades} trade${row.trades == 1 ? '' : 's'} · '
                  '${formatInr(row.fees)} fees',
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
                '${isUp ? '+' : ''}${formatInr(row.realizedPnL)}',
                style: TextStyle(
                  color: color,
                  fontWeight: FontWeight.w900,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                row.openQty == 0
                    ? 'closed'
                    : 'open ${row.openQty.abs()} @ ${formatInr(row.avgPrice)}',
                style: TextStyle(
                  fontSize: 11,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Risk ──────────────────────────────────────────────────────────────

class _RiskTab extends ConsumerWidget {
  const _RiskTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(riskMetricsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(riskMetricsProvider);
        await ref.read(riskMetricsProvider.future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [Padding(padding: const EdgeInsets.all(24), child: Text('$e'))],
        ),
        data: (m) {
          if (m.points < 2) {
            return const _EmptyState(
              icon: Icons.show_chart,
              title: 'Not enough history yet',
              hint:
                  'Risk metrics need at least 2 daily portfolio snapshots. '
                  'Come back after 00:05 IST tomorrow.',
            );
          }
          final low = m.points < 30;
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              if (low)
                Container(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    '${m.points} snapshots so far — values stabilise after '
                    '~30 days of trading history.',
                    style: const TextStyle(
                      color: Color(0xFFF59E0B),
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              if (low) const SizedBox(height: 14),
              _MetricsGrid(metrics: m),
              const SizedBox(height: 14),
              _MetricNotes(),
            ],
          );
        },
      ),
    );
  }
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.metrics});
  final RiskMetrics metrics;

  @override
  Widget build(BuildContext context) {
    final isReturnPositive = metrics.totalReturnPct >= 0;
    final isCagrPositive = metrics.cagrPct >= 0;
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: [
        _MetricCard(
          label: 'Total return',
          value:
              '${isReturnPositive ? '+' : ''}${metrics.totalReturnPct.toStringAsFixed(2)}%',
          tone: isReturnPositive ? _upColor : _downColor,
        ),
        _MetricCard(
          label: 'CAGR',
          value:
              '${isCagrPositive ? '+' : ''}${metrics.cagrPct.toStringAsFixed(2)}%',
          tone: isCagrPositive ? _upColor : _downColor,
        ),
        _MetricCard(
          label: 'Sharpe',
          value: metrics.sharpe.toStringAsFixed(2),
          tone: metrics.sharpe >= 1 ? _upColor : null,
        ),
        _MetricCard(
          label: 'Sortino',
          value: metrics.sortino.toStringAsFixed(2),
          tone: metrics.sortino >= 1 ? _upColor : null,
        ),
        _MetricCard(
          label: 'Vol (annualised)',
          value: '${metrics.annualisedVolPct.toStringAsFixed(1)}%',
        ),
        _MetricCard(
          label: 'Max drawdown',
          value: '-${metrics.maxDrawdownPct.toStringAsFixed(2)}%',
          tone: _downColor,
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value, this.tone});
  final String label;
  final String value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: (MediaQuery.sizeOf(context).width - 16 * 2 - 10) / 2,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: scheme.onSurface.withValues(alpha: 0.55),
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontWeight: FontWeight.w900,
                fontSize: 20,
                letterSpacing: -0.4,
                color: tone,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MetricNotes extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _NoteLine(
            label: 'Sharpe',
            text:
                'Annualised return ÷ volatility. >1 is good, >2 is excellent. Negative if you\'re losing money on a risk-adjusted basis.',
          ),
          _NoteLine(
            label: 'Sortino',
            text:
                'Like Sharpe but only counts downside volatility — strategies that ramp hard then chop sideways get rewarded.',
          ),
          _NoteLine(
            label: 'Max drawdown',
            text:
                'Largest peak-to-trough drop in equity. The pain you\'d have felt at the worst point.',
          ),
          _NoteLine(
            label: 'CAGR',
            text:
                'Compound annual growth rate — what your portfolio would have to return per year, every year, to land at the same place.',
          ),
        ],
      ),
    );
  }
}

class _NoteLine extends StatelessWidget {
  const _NoteLine({required this.label, required this.text});
  final String label;
  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: RichText(
        text: TextSpan(
          style: TextStyle(
            fontSize: 11.5,
            color: scheme.onSurface.withValues(alpha: 0.65),
            height: 1.4,
          ),
          children: [
            TextSpan(
              text: '$label · ',
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
            TextSpan(text: text),
          ],
        ),
      ),
    );
  }
}

// ─── Capital gains ────────────────────────────────────────────────────

class _CapGainsTab extends ConsumerWidget {
  const _CapGainsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(capitalGainsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(capitalGainsProvider);
        await ref.read(capitalGainsProvider.future);
      },
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [Padding(padding: const EdgeInsets.all(24), child: Text('$e'))],
        ),
        data: (report) {
          if (report.rows.isEmpty) {
            return const _EmptyState(
              icon: Icons.receipt_long,
              title: 'No realized disposals yet',
              hint:
                  'Close some positions and the FIFO-allocated capital gains report will populate here.',
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              _CapGainsSummary(report: report),
              const SizedBox(height: 14),
              for (final r in report.rows) ...[
                _CapGainRowTile(row: r),
                const SizedBox(height: 8),
              ],
              const SizedBox(height: 6),
              _CapGainsDisclaimer(),
            ],
          );
        },
      ),
    );
  }
}

class _CapGainsSummary extends StatelessWidget {
  const _CapGainsSummary({required this.report});
  final CapGainsReport report;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final totalUp = report.total >= 0;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            scheme.primaryContainer.withValues(alpha: 0.55),
            scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.35),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Net realized gain',
            style: TextStyle(
              fontSize: 12,
              color: scheme.onSurface.withValues(alpha: 0.65),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${totalUp ? '+' : ''}${formatInr(report.total)}',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
              color: totalUp ? _upColor : _downColor,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'From ${report.from ?? '—'} to ${report.to}',
            style: TextStyle(
              fontSize: 11,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _TermPill(
                  label: 'Short term',
                  value: report.shortTermTotal,
                  hint: '≤ 365d · MIS · F&O',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _TermPill(
                  label: 'Long term',
                  value: report.longTermTotal,
                  hint: '> 365d delivery',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TermPill extends StatelessWidget {
  const _TermPill({
    required this.label,
    required this.value,
    required this.hint,
  });
  final String label;
  final double value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = value >= 0;
    final color = isUp ? _upColor : _downColor;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            '${isUp ? '+' : ''}${formatInr(value)}',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w900,
              color: color,
            ),
          ),
          Text(
            hint,
            style: TextStyle(
              fontSize: 10,
              color: scheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _CapGainRowTile extends StatelessWidget {
  const _CapGainRowTile({required this.row});
  final CapGainRow row;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUp = row.gain >= 0;
    final color = isUp ? _upColor : _downColor;
    final termTone = row.term == 'LONG'
        ? const Color(0xFF8B5CF6)
        : const Color(0xFFF59E0B);
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
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
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        row.symbol,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: termTone.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        row.term,
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                          color: termTone,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                Text(
                  '${row.quantity} · ${row.buyDate} → ${row.sellDate}',
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
                const SizedBox(height: 1),
                Text(
                  '${formatInr(row.buyPrice)} → ${formatInr(row.sellPrice)}',
                  style: TextStyle(
                    fontSize: 11,
                    color: scheme.onSurface.withValues(alpha: 0.55),
                  ),
                ),
              ],
            ),
          ),
          Text(
            '${isUp ? '+' : ''}${formatInr(row.gain)}',
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w900,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}

class _CapGainsDisclaimer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        'FIFO allocation. Indian-tax classification: equity delivery > 365 '
        'days = LONG; MIS + F&O are always SHORT. Numbers are net of '
        'brokerage and statutory charges from each leg. Not tax advice.',
        style: TextStyle(
          fontSize: 11,
          color: scheme.onSurface.withValues(alpha: 0.55),
          height: 1.4,
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.icon,
    required this.title,
    required this.hint,
  });
  final IconData icon;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.fromLTRB(32, 60, 32, 32),
      children: [
        Icon(
          icon,
          size: 48,
          color: scheme.onSurface.withValues(alpha: 0.4),
        ),
        const SizedBox(height: 12),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          hint,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12.5,
            color: scheme.onSurface.withValues(alpha: 0.6),
            height: 1.4,
          ),
        ),
      ],
    );
  }
}
