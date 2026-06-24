import 'package:flutter/material.dart';

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
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final a in actions) ...[
            Expanded(child: _ActionTile(action: a)),
            if (a != actions.last) const SizedBox(width: 8),
          ],
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
              style: const TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
