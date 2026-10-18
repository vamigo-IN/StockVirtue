import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart' hide ShimmerEffect;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:skeletonizer/skeletonizer.dart';

import '../../../core/design/tokens.dart';
import '../../../core/money_format.dart';
import '../../../data/models/portfolio.dart';
import '../../home/screens/shell_screen.dart';
import '../../portfolio/portfolio_live.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../ticks/ticks_providers.dart';

/// Portfolio hero at the top of home: live total equity in large type, the
/// unrealised P&L on open positions, and a slim row of where the money is
/// (invested · free cash · margin in use). Rides the brand gradient; ticks
/// live with holdings. Tap → Portfolio tab.
class PortfolioHeroCard extends ConsumerWidget {
  const PortfolioHeroCard({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portfolio = ref.watch(portfolioProvider);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: portfolio.when(
        loading: () => const _SkeletonHero(),
        error: (_, _) =>
            _ErrorStrip(onRetry: () => ref.invalidate(portfolioProvider)),
        data: (snap) => _Hero(snap: snap)
            .animate()
            .fadeIn(duration: 300.ms)
            .slideY(begin: 0.04, end: 0),
      ),
    );
  }
}

class _Hero extends ConsumerWidget {
  const _Hero({required this.snap});
  final PortfolioSnapshot snap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = context.market;
    final t = Theme.of(context).textTheme;
    // Live-overlaid totals — equity + P&L track holding LTPs in real time
    // (rebuilds only when the aggregate changes), matching the Portfolio tab.
    final live =
        ref.watch(latestTicksProvider.select((map) => liveSummaryOf(snap, map)));
    final isUp = live.unrealizedPnL >= 0;
    final pnlPct =
        live.invested > 0 ? (live.unrealizedPnL / live.invested) * 100 : 0.0;
    const onHero = Colors.white;
    final muted = Colors.white.withValues(alpha: 0.72);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: m.heroGradient,
          ),
          borderRadius: BorderRadius.circular(AppRadius.lg),
          border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
        ),
        child: InkWell(
          onTap: () => ref.read(shellTabIndexProvider.notifier).state = 1,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 16, 14, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      Icons.account_balance_wallet_outlined,
                      size: 14,
                      color: muted,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Total equity',
                      style: t.labelMedium?.copyWith(color: muted),
                    ),
                    const Spacer(),
                    Icon(Icons.chevron_right_rounded, size: 18, color: muted),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  formatInr(live.totalEquity),
                  style: t.headlineLarge?.copyWith(color: onHero),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: (isUp ? m.up : m.down).withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(AppRadius.xs),
                      ),
                      child: Text(
                        '${formatInr(live.unrealizedPnL, sign: true)} '
                        '(${isUp ? '+' : ''}${pnlPct.toStringAsFixed(2)}%)',
                        style: t.labelMedium?.copyWith(
                          color: isUp ? const Color(0xFF7CF5B6) : const Color(0xFFFFA4A4),
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'on open positions',
                      style: t.bodySmall?.copyWith(color: muted),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Container(
                  height: 1,
                  color: Colors.white.withValues(alpha: 0.10),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _HeroStat(
                      label: 'Invested',
                      value: formatInrCompact(live.invested),
                    ),
                    _HeroStat(
                      label: 'Free cash',
                      value: formatInrCompact(snap.wallet.available),
                    ),
                    _HeroStat(
                      label: 'Margin used',
                      value: formatInrCompact(snap.wallet.marginReserved),
                      alignEnd: true,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({
    required this.label,
    required this.value,
    this.alignEnd = false,
  });

  final String label;
  final String value;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        crossAxisAlignment:
            alignEnd ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: t.labelSmall?.copyWith(
              color: Colors.white.withValues(alpha: 0.62),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: t.titleSmall?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonHero extends StatelessWidget {
  const _SkeletonHero();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Skeletonizer(
      effect: ShimmerEffect(
        baseColor: scheme.surfaceContainerHigh,
        highlightColor: scheme.surfaceContainerHighest,
      ),
      child: const Bone(
        height: 168,
        borderRadius: BorderRadius.all(Radius.circular(AppRadius.lg)),
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
        color: scheme.errorContainer.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: scheme.error, size: 16),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Couldn’t load your portfolio. Check your connection.',
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
