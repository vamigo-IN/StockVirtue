import 'package:flutter/material.dart';

import '../../market/screens/commodities_screen.dart';
import '../../market/screens/indices_screen.dart';
import '../../market/screens/scanners_screen.dart';
import '../../market/screens/stock_search_screen.dart';
import '../../options/screens/fno_landing_screen.dart';
import '../../orders/screens/basket_screen.dart';

class QuickActions extends StatelessWidget {
  const QuickActions({super.key});

  @override
  Widget build(BuildContext context) {
    final actions = <_QuickAction>[
      _QuickAction(
        icon: Icons.candlestick_chart_outlined,
        label: 'Stocks',
        color: const Color(0xFF22C55E),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const StockSearchScreen()),
        ),
      ),
      _QuickAction(
        icon: Icons.swap_calls_outlined,
        label: 'F&O',
        color: const Color(0xFF6366F1),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const FnoLandingScreen()),
        ),
      ),
      _QuickAction(
        icon: Icons.show_chart,
        label: 'Indices',
        color: const Color(0xFFF59E0B),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const IndicesScreen()),
        ),
      ),
      _QuickAction(
        icon: Icons.diamond_outlined,
        label: 'Commodities',
        color: const Color(0xFFEAB308),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const CommoditiesScreen()),
        ),
      ),
      _QuickAction(
        icon: Icons.radar,
        label: 'Scanners',
        color: const Color(0xFFEC4899),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const ScannersScreen()),
        ),
      ),
      _QuickAction(
        icon: Icons.shopping_basket_outlined,
        label: 'Basket',
        color: const Color(0xFF06B6D4),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const BasketScreen()),
        ),
      ),
    ];
    // Horizontally scrollable so the row scales past the ~5 that fit on a
    // phone width without cramping labels like "Commodities".
    return SizedBox(
      height: 78,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: actions.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) => SizedBox(
          width: 78,
          child: _ActionTile(action: actions[i]),
        ),
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
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: action.onTap,
      child: Ink(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          children: [
            Container(
              width: 36,
              height: 36,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: action.color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(action.icon, color: action.color, size: 18),
            ),
            const SizedBox(height: 6),
            Text(
              action.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
