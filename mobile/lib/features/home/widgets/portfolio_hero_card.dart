import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/money_format.dart';
import '../../../data/models/portfolio.dart';
import '../../home/screens/shell_screen.dart';
import '../../portfolio/portfolio_providers.dart';

/// Compact portfolio strip at the top of home. Single row: equity on the
/// left, day-P&L chip on the right, gradient tint that picks up the
/// market mood. Tap → Portfolio tab.
///
/// Trimmed from the earlier hero (Invested / Cash / Holdings sub-strip)
/// because users almost always tap into the Portfolio tab when they
/// want detail; keeping all that metadata on home was just visual
/// weight competing with watchlists + movers.
class PortfolioHeroCard extends ConsumerWidget {
  const PortfolioHeroCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: portfolio.when(
        loading: () => const _SkeletonStrip(),
        error: (_, _) =>
            _ErrorStrip(onRetry: () => ref.invalidate(portfolioProvider)),
        data: (snap) => _LoadedStrip(snap: snap),
      ),
    );
  }
}

class _LoadedStrip extends ConsumerWidget {
  const _LoadedStrip({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final s = snap.summary;
    final isUp = s.unrealizedPnL >= 0;
    const upColor = Color(0xFF22C55E);
    const downColor = Color(0xFFEF4444);
    final pnlColor = isUp ? upColor : downColor;
    final pnlPct = s.invested > 0 ? (s.unrealizedPnL / s.invested) * 100 : 0.0;

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => ref.read(shellTabIndexProvider.notifier).state = 1,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: LinearGradient(
            colors: [
              scheme.primaryContainer.withValues(alpha: 0.45),
              scheme.surfaceContainerHighest.withValues(alpha: 0.35),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 10, 12, 10),
          child: Row(
            children: [
              // Label + value live in the same column on the left.
              // We use a compact label and a slightly tighter weight
              // than the old hero to fit the single-line height.
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.account_balance_wallet_outlined,
                          size: 13,
                          color: scheme.onSurface.withValues(alpha: 0.55),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          'Total equity',
                          style: TextStyle(
                            color: scheme.onSurface.withValues(alpha: 0.6),
                            fontSize: 11,
                            letterSpacing: 0.3,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _money(s.totalEquity),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
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
                      size: 12,
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '${isUp ? '+' : ''}${pnlPct.toStringAsFixed(2)}%',
                      style: TextStyle(
                        color: pnlColor,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Icon(
                Icons.chevron_right,
                size: 16,
                color: scheme.onSurface.withValues(alpha: 0.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SkeletonStrip extends StatelessWidget {
  const _SkeletonStrip();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      height: 58,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
        borderRadius: BorderRadius.circular(14),
      ),
    );
  }
}

class _ErrorStrip extends StatelessWidget {
  const _ErrorStrip({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 6, 10),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: scheme.error, size: 16),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Could not load portfolio',
              style: TextStyle(fontSize: 12.5),
            ),
          ),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              minimumSize: const Size(0, 28),
              visualDensity: VisualDensity.compact,
            ),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}

String _money(double v) => formatInr(v);
