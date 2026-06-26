import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/market_hours.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/home/screens/shell_screen.dart';
import 'features/onboarding/onboarding_storage.dart';
import 'features/onboarding/screens/onboarding_screen.dart';
import 'features/profile/screens/complete_profile_screen.dart';
import 'features/ticks/ticks_providers.dart';

class StockVirtueApp extends ConsumerWidget {
  const StockVirtueApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Connects/disconnects the Socket.IO client based on auth state.
    ref.watch(socketLifecycleProvider);
    // Fire-and-forget fetch of /market/holidays — the resolved list
    // overrides the curated fallback inside market_hours.dart for every
    // subsequent isMarketOpen() check.
    ref.watch(liveMarketHolidaysProvider);
    final themeMode =
        ref.watch(themeControllerProvider).value ?? ThemeMode.dark;
    return MaterialApp(
      title: 'StockVirtue',
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: themeMode,
      scrollBehavior: const _StockVirtueScrollBehavior(),
      builder: (context, child) {
        // Cap text scaling: a phone set to XL / XXL accessibility font sizes
        // would otherwise overflow fixed layouts across the app. Users still
        // get noticeably larger text (up to 1.3×), just within a safe bound.
        final mq = MediaQuery.of(context);
        return MediaQuery(
          data: mq.copyWith(
            textScaler: mq.textScaler.clamp(
              minScaleFactor: 1.0,
              maxScaleFactor: 1.3,
            ),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
      home: const _AuthGate(),
    );
  }
}

/// Replaces Android 12+'s default `StretchingOverscrollIndicator` with the
/// classic edge glow. The stretch effect rescales rendered pixels at the
/// boundary, which warps text glyphs while explicitly-sized containers look
/// intact — producing the "stretched text, normal background" mismatch.
/// The glow paints a minimal colored arc at the top/bottom on overscroll
/// without distorting any content.
class _StockVirtueScrollBehavior extends MaterialScrollBehavior {
  const _StockVirtueScrollBehavior();

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return GlowingOverscrollIndicator(
      axisDirection: details.direction,
      color: Theme.of(context).colorScheme.primary,
      child: child,
    );
  }
}

/// Window in which a logged-in user is treated as "freshly signed up"
/// and eligible to see the onboarding slides. Once they're older than
/// this, they go straight to the shell regardless of the onboarding
/// flag — so a storage glitch that wipes the seen-bit can't trap a
/// returning user on the slide deck.
const _onboardingFreshWindow = Duration(minutes: 30);

/// Top-level flow controller. The order of stages is:
///   1. No user                 → [LoginScreen]
///   2. User without profile    → [CompleteProfileScreen]
///   3. Freshly signed up AND   → [OnboardingScreen]
///      onboarded flag missing
///   4. Everything ready        → [ShellScreen]
/// `profileComplete` flips on the backend after PATCH /auth/me so we don't
/// need to push routes imperatively — the gate re-renders when the auth
/// state updates and the user falls through to the next stage.
class _AuthGate extends ConsumerWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    return auth.when(
      loading: () => const _SplashScreen(),
      error: (err, _) => _ErrorScreen(error: err.toString()),
      data: (user) {
        if (user == null) return const LoginScreen();
        if (!user.profileComplete) return const CompleteProfileScreen();
        // Returning user — older than the fresh-signup window. Skip
        // onboarding even if the storage flag couldn't be read.
        final createdAt = user.createdAt;
        final isFreshSignup = createdAt == null
            ? true
            : DateTime.now().difference(createdAt) < _onboardingFreshWindow;
        if (!isFreshSignup) return ShellScreen(user: user);

        final seen = ref.watch(onboardingSeenProvider);
        return seen.when(
          loading: () => const _SplashScreen(),
          error: (_, _) => ShellScreen(user: user),
          data: (hasSeen) =>
              hasSeen ? ShellScreen(user: user) : const OnboardingScreen(),
        );
      },
    );
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/logo.png',
              width: 116,
              height: 116,
              filterQuality: FilterQuality.medium,
            ),
            const SizedBox(height: 20),
            const Text(
              'StockVirtue',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Trade. Learn. Compete.',
              style: TextStyle(
                fontSize: 12.5,
                color: scheme.onSurface.withValues(alpha: 0.55),
              ),
            ),
            const SizedBox(height: 28),
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.4,
                color: scheme.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorScreen extends StatelessWidget {
  const _ErrorScreen({required this.error});
  final String error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Text(
              'Something went wrong:\n$error',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.redAccent),
            ),
          ),
        ),
      ),
    );
  }
}
