import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../onboarding_storage.dart';

/// Post-signup learning slides. Shown once per device; the [onboardingSeenProvider]
/// flag persists in secure storage so subsequent app launches skip straight
/// to the home tab.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pageController = PageController();
  int _index = 0;

  static const _slides = <_Slide>[
    _Slide(
      icon: Icons.account_balance_wallet_outlined,
      title: 'Trade with virtual ₹10,00,000',
      subtitle:
          'StockVirtue gives every new account ten lakh in virtual cash so you can '
          'experiment without putting real money on the line.',
      color: Color(0xFF22C55E),
    ),
    _Slide(
      icon: Icons.bolt_outlined,
      title: 'Real Indian market prices',
      subtitle:
          'Live NSE & BSE quotes via SmartAPI, second-by-second tick updates, '
          'and the full 5-level order book on every symbol.',
      color: Color(0xFF06B6D4),
    ),
    _Slide(
      icon: Icons.swap_calls_outlined,
      title: 'F&O, MIS, stop-losses & more',
      subtitle:
          'Sell short on F&O, run intraday MIS positions, place SL / SL-L / '
          'trailing-stop orders — the same products real Indian brokers offer.',
      color: Color(0xFF6366F1),
    ),
    _Slide(
      icon: Icons.emoji_events_outlined,
      title: 'Climb the leaderboard',
      subtitle:
          'Every trader is ranked by % return on virtual equity. Practice, '
          'iterate, and watch your rank move with each closed position.',
      color: Color(0xFFF59E0B),
    ),
  ];

  Future<void> _finish() async {
    await ref.read(onboardingSeenProvider.notifier).markSeen();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isLast = _index == _slides.length - 1;
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Row(
                children: [
                  Text(
                    'StockVirtue',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                      color: scheme.onSurface.withValues(alpha: 0.7),
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _finish,
                    child: Text(
                      'Skip',
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: scheme.onSurface.withValues(alpha: 0.75),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (i) => setState(() => _index = i),
                itemCount: _slides.length,
                itemBuilder: (_, i) => _SlideView(slide: _slides[i]),
              ),
            ),
            _Dots(count: _slides.length, index: _index),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () {
                    if (isLast) {
                      _finish();
                    } else {
                      _pageController.nextPage(
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeOut,
                      );
                    }
                  },
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  child: Text(
                    isLast ? 'Get started' : 'Next',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  const _Slide({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
  });
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 30, 28, 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Spacer(),
          Container(
            width: 120,
            height: 120,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  slide.color.withValues(alpha: 0.3),
                  slide.color.withValues(alpha: 0.05),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(36),
              border: Border.all(
                color: slide.color.withValues(alpha: 0.35),
                width: 1.2,
              ),
            ),
            child: Icon(slide.icon, color: slide.color, size: 54),
          ),
          const SizedBox(height: 36),
          Text(
            slide.title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.3,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            slide.subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              height: 1.5,
              color: scheme.onSurface.withValues(alpha: 0.7),
            ),
          ),
          const Spacer(),
          const Spacer(),
        ],
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});
  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            width: i == index ? 22 : 7,
            height: 7,
            decoration: BoxDecoration(
              color: i == index
                  ? scheme.primary
                  : scheme.onSurface.withValues(alpha: 0.25),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
      ],
    );
  }
}
