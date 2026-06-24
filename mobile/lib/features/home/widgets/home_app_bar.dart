import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme_provider.dart';
import '../../../data/models/user.dart';
import '../../market/screens/stock_search_screen.dart';
import '../../notifications/notifications_provider.dart';
import '../../notifications/screens/notifications_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../ticks/ticks_providers.dart';

/// Scroll-with-content header shown at the top of the home feed: greeting,
/// avatar, status indicators, theme toggle, log-out, and a search pill that
/// opens stock search. Sits inside the ListView so it scrolls away on swipe.
class HomeAppBar extends ConsumerWidget {
  const HomeAppBar({super.key, required this.user});
  final AppUser user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final greeting = _greeting();
    final name = _shortName(user);
    return Material(
      color: scheme.surface,
      elevation: 0,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 12, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ProfileScreen(),
                      ),
                    ),
                    child: _Avatar(name: name, avatarUrl: user.avatarUrl),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: InkWell(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => const ProfileScreen(),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            greeting,
                            style: TextStyle(
                              color: scheme.onSurface.withValues(alpha: 0.6),
                              fontSize: 12,
                              letterSpacing: 0.3,
                            ),
                          ),
                          Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const _SocketIndicator(),
                  const _NotificationsBell(),
                  _ThemeToggleButton(),
                ],
              ),
              const SizedBox(height: 12),
              _SearchPill(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const StockSearchScreen(),
                    ),
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  static String _shortName(AppUser u) {
    final n = u.displayName?.trim();
    if (n != null && n.isNotEmpty) return n.split(' ').first;
    return 'Trader';
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name, this.avatarUrl});
  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final letter = name.isNotEmpty ? name[0].toUpperCase() : 'T';
    final fallback = Container(
      width: 38,
      height: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [scheme.primary, scheme.tertiary],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        letter,
        style: TextStyle(
          color: scheme.onPrimary,
          fontWeight: FontWeight.w700,
          fontSize: 16,
        ),
      ),
    );
    final url = avatarUrl;
    if (url == null || url.isEmpty) return fallback;
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.network(
        url,
        width: 38,
        height: 38,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}

class _SearchPill extends StatelessWidget {
  const _SearchPill({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.4),
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.search,
              color: scheme.onSurface.withValues(alpha: 0.55),
              size: 20,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'Search stocks, indices, F&O…',
                style: TextStyle(
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  fontSize: 14,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: scheme.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: 0.4),
                ),
              ),
              child: Text(
                '⌘ K',
                style: TextStyle(
                  fontSize: 11,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SocketIndicator extends ConsumerWidget {
  const _SocketIndicator();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connected = ref.watch(socketConnectedProvider).value ?? false;
    return Tooltip(
      message: connected ? 'Live data: connected' : 'Live data: offline',
      child: Padding(
        padding: const EdgeInsets.only(right: 4),
        child: Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: connected ? const Color(0xFF22C55E) : Colors.redAccent,
            shape: BoxShape.circle,
            boxShadow: connected
                ? [
                    BoxShadow(
                      color: const Color(0xFF22C55E).withValues(alpha: 0.6),
                      blurRadius: 6,
                    ),
                  ]
                : null,
          ),
        ),
      ),
    );
  }
}

class _ThemeToggleButton extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode =
        ref.watch(themeControllerProvider).value ?? ThemeMode.dark;
    final isDark = mode == ThemeMode.dark;
    return IconButton(
      icon: Icon(
        isDark ? Icons.light_mode_outlined : Icons.dark_mode_outlined,
        size: 22,
      ),
      onPressed: () =>
          ref.read(themeControllerProvider.notifier).toggle(),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Bell icon with an unread badge dot. Opens the NotificationsScreen on tap;
/// the screen itself marks everything read on first frame so the badge
/// clears as soon as the user acknowledges.
class _NotificationsBell extends ConsumerWidget {
  const _NotificationsBell();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsCountProvider);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_none_outlined, size: 22),
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => const NotificationsScreen(),
            ),
          ),
          visualDensity: VisualDensity.compact,
        ),
        if (unread > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: const Color(0xFFEF4444),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: Theme.of(context).colorScheme.surface,
                  width: 1.2,
                ),
              ),
              constraints: const BoxConstraints(minWidth: 16, minHeight: 14),
              child: Text(
                unread > 9 ? '9+' : '$unread',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
