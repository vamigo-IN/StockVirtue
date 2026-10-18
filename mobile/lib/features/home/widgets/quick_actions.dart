import 'package:flutter/material.dart';

import '../../../core/design/tokens.dart';
import '../../academy/screens/academy_screen.dart';
import '../../ipo/screens/ipo_screen.dart';
import '../../market/screens/commodities_screen.dart';
import '../../market/screens/indices_screen.dart';
import '../../market/screens/scanners_screen.dart';
import '../../market/screens/stock_search_screen.dart';
import '../../options/screens/fno_landing_screen.dart';
import '../../orders/screens/basket_screen.dart';

/// Home shortcuts — a tidy 4-column grid instead of a sideways scroller, so
/// every destination is visible at a glance.
class QuickActions extends StatelessWidget {
  const QuickActions({super.key});

  @override
  Widget build(BuildContext context) {
    final m = context.market;
    void open(Widget screen) => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => screen),
        );
    final actions = <_QuickAction>[
      _QuickAction(
        icon: Icons.candlestick_chart_rounded,
        label: 'Stocks',
        color: m.up,
        onTap: () => open(const StockSearchScreen()),
      ),
      _QuickAction(
        icon: Icons.swap_calls_rounded,
        label: 'F&O',
        color: m.violet,
        onTap: () => open(const FnoLandingScreen()),
      ),
      _QuickAction(
        icon: Icons.show_chart_rounded,
        label: 'Indices',
        color: m.info,
        onTap: () => open(const IndicesScreen()),
      ),
      _QuickAction(
        icon: Icons.diamond_rounded,
        label: 'Commodities',
        color: m.gold,
        onTap: () => open(const CommoditiesScreen()),
      ),
      _QuickAction(
        icon: Icons.rocket_launch_rounded,
        label: 'IPOs',
        color: const Color(0xFFEC4899),
        onTap: () => open(const IpoScreen()),
      ),
      _QuickAction(
        icon: Icons.radar_rounded,
        label: 'Scanners',
        color: m.warning,
        onTap: () => open(const ScannersScreen()),
      ),
      _QuickAction(
        icon: Icons.shopping_basket_rounded,
        label: 'Basket',
        color: const Color(0xFF06B6D4),
        onTap: () => open(const BasketScreen()),
      ),
      _QuickAction(
        icon: Icons.school_rounded,
        label: 'Academy',
        color: m.down,
        onTap: () => open(const AcademyScreen()),
      ),
    ];
    const perRow = 4;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Column(
        children: [
          for (var r = 0; r < actions.length; r += perRow)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final a in actions.skip(r).take(perRow))
                  Expanded(child: _ActionTile(action: a)),
              ],
            ),
        ],
      ),
    );
  }
}

class _QuickAction {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.action});
  final _QuickAction action;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return InkWell(
      borderRadius: BorderRadius.circular(AppRadius.sm),
      onTap: action.onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
        child: Column(
          children: [
            Container(
              width: 48,
              height: 48,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: action.color.withValues(alpha: 0.13),
                borderRadius: BorderRadius.circular(AppRadius.sm + 2),
              ),
              child: Icon(action.icon, color: action.color, size: 22),
            ),
            const SizedBox(height: 7),
            Text(
              action.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: t.labelMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}
