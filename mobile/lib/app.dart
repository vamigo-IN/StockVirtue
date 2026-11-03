import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/analytics.dart';
import 'core/market_hours.dart';
import 'core/navigation.dart';
import 'core/theme.dart';
import 'core/theme_provider.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/home/screens/shell_screen.dart';
import 'features/market/company_directory_sync.dart';
import 'features/onboarding/onboarding_storage.dart';
import 'features/notifications/push_service.dart';
import 'features/onboarding/screens/onboarding_screen.dart';
import 'features/privacy/screens/privacy_notice_screen.dart';
import 'features/profile/screens/complete_profile_screen.dart';
import 'features/ticks/ticks_providers.dart';
import 'widgets/error_retry_view.dart';

class StockVirtueApp extends ConsumerWidget {
  const StockVirtueApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Connects/disconnects the Socket.IO client based on auth state.
    ref.watch(socketLifecycleProvider);
    // Registers the FCM device token + shows incoming push notifications
    // (realtime socket events + foreground FCM) while signed in.
    ref.watch(pushLifecycleProvider);
    // Fire-and-forget fetch of /market/holidays — the resolved list
    // overrides the curated fallback inside market_hours.dart for every
    // subsequent isMarketOpen() check.
    ref.watch(liveMarketHolidaysProvider);
    // Tops up the bundled company names with any fresh NSE listings.
    ref.watch(companyDirectorySyncProvider);
    final themeMode =
        ref.watch(themeControllerProvider).value ?? ThemeMode.dark;
    return MaterialApp(
      title: 'StockVirtue',
      // Lets a tapped news push open the story from outside the tree.
      navigatorKey: rootNavigatorKey,
      debugShowCheckedModeBanner: false,
      theme: buildLightTheme(),
      darkTheme: buildDarkTheme(),
      themeMode: themeMode,
      // Auto-logs screen_view for named routes (and app_open / session /
      // engagement events are collected automatically by the SDK).
      navigatorObservers: [Analytics.instance.navigatorObserver],
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
///   2. Current privacy notice  → [PrivacyNoticeScreen]
///      not yet accepted
///   3. User without profile    → [CompleteProfileScreen]
///   4. Freshly signed up AND   → [OnboardingScreen]
///      onboarded flag missing
///   5. Everything ready        → [ShellScreen]
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
      error: (err, _) => Scaffold(
        body: SafeArea(
          child: ErrorRetryView(
            error: err,
            errorContext: 'auth',
            onRetry: () => ref.invalidate(authControllerProvider),
          ),
        ),
      ),
      data: (user) {
        if (user == null) return const LoginScreen();
        if (user.needsPrivacyNotice) return const PrivacyNoticeScreen();
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
              'assets/brand/logo.png',
              width: 132,
              height: 132,
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

