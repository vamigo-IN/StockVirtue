import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
// StateProvider moved to the legacy import in Riverpod 3.x.
import 'package:flutter_riverpod/legacy.dart';

import '../../../core/analytics.dart';
import '../../../data/models/user.dart';
import '../../orders/screens/orders_screen.dart';
import '../../portfolio/screens/portfolio_screen.dart';
import '../../rooms/screens/rooms_landing_screen.dart';
import 'home_tab.dart';

/// 0 = Home, 1 = Portfolio, 2 = Orders, 3 = Rooms.
final shellTabIndexProvider = StateProvider<int>((_) => 0);

/// Screen names logged to Firebase Analytics on tab switch (the tabs live in
/// an IndexedStack, which the route observer can't see).
const _tabScreenNames = ['Home', 'Portfolio', 'Orders', 'Rooms'];

class ShellScreen extends ConsumerWidget {
  const ShellScreen({super.key, required this.user});
  final AppUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final index = ref.watch(shellTabIndexProvider);
    final tabs = [
      HomeTab(user: user),
      const PortfolioScreen(),
      const OrdersScreen(),
      const RoomsLandingScreen(),
    ];
    return PopScope(
      // We intercept the system back gesture at the app root: from a sub-tab
      // it returns to Home; from Home it asks before exiting the app.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (ref.read(shellTabIndexProvider) != 0) {
          ref.read(shellTabIndexProvider.notifier).state = 0;
          return;
        }
        final shouldExit = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Exit StockVirtue?'),
            content: const Text('Are you sure you want to close the app?'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(false),
                child: const Text('Stay'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(ctx).pop(true),
                child: const Text('Exit'),
              ),
            ],
          ),
        );
        if (shouldExit == true) await SystemNavigator.pop();
      },
      child: Scaffold(
        body: IndexedStack(index: index, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) {
          HapticFeedback.selectionClick();
          ref.read(shellTabIndexProvider.notifier).state = i;
          Analytics.instance.logScreen(_tabScreenNames[i]);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.space_dashboard_outlined),
            selectedIcon: Icon(Icons.space_dashboard_rounded),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.donut_large_rounded),
            selectedIcon: Icon(Icons.donut_small_rounded),
            label: 'Portfolio',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long_rounded),
            label: 'Orders',
          ),
          NavigationDestination(
            icon: Icon(Icons.emoji_events_outlined),
            selectedIcon: Icon(Icons.emoji_events_rounded),
            label: 'Rooms',
          ),
        ],
        ),
      ),
    );
  }
}
