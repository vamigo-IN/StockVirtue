import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/portfolio.dart';
import '../../../data/models/user.dart';
import '../../bookmarks/bookmarks_storage.dart';
import '../../bookmarks/widgets/bookmarks_rail.dart';
import '../../news/widgets/news_section.dart';
import '../../market/market_repository.dart';
import '../../portfolio/portfolio_live.dart';
import '../../portfolio/portfolio_providers.dart';
import '../../ticks/ticks_providers.dart';
import '../../ticks/ticks_service.dart';
import '../../watchlists/watchlists_providers.dart';
import '../home_providers.dart';
import '../widgets/home_app_bar.dart';
import '../widgets/indices_strip.dart';
import '../widgets/daily_summary_card.dart';
import '../widgets/market_status_card.dart';
import '../widgets/portfolio_hero_card.dart';
import '../widgets/quick_actions.dart';
import '../widgets/recently_viewed_carousel.dart';
import '../widgets/top_movers_section.dart';
import '../widgets/trending_stocks_carousel.dart';
import '../widgets/watchlists_strip.dart';

/// The Groww-style landing tab. Owns the tick-subscription lifecycle for the
/// indices and trending strips: when the home data arrives we subscribe to
/// those symbols, and we tear them down on dispose. Detail screens manage
/// their own subscriptions independently.
class HomeTab extends ConsumerStatefulWidget {
  const HomeTab({super.key, required this.user});
  final AppUser user;

  @override
  ConsumerState<HomeTab> createState() => _HomeTabState();
}

class _HomeTabState extends ConsumerState<HomeTab> {
  List<TickSubscription> _subs = const [];

  void _sync(
    List<FeedQuote> indices,
    List<FeedQuote> trending,
    List<BookmarkedSymbol> bookmarks,
    List<PortfolioPosition> positions,
  ) {
    if (!mounted) return;
    // Dedup by key — a symbol can appear in more than one strip (e.g. a
    // holding that's also trending), and we want exactly one subscription.
    final byKey = <String, TickSubscription>{};
    void put(TickSubscription s) => byKey['${s.exchange}:${s.symbol}'] = s;
    for (final q in indices) {
      put(TickSubscription(symbol: q.symbol, exchange: q.exchange));
    }
    for (final q in trending) {
      put(TickSubscription(symbol: q.symbol, exchange: q.exchange));
    }
    for (final b in bookmarks) {
      put(TickSubscription(symbol: b.symbol, exchange: b.exchange));
    }
    // Holdings too, so the live portfolio hero strip ticks without a poll.
    for (final p in positions) {
      put(subForPosition(p));
    }
    final desired = byKey.values.toList();
    final service = ref.read(ticksServiceProvider);
    final existing = _subs.map((s) => '${s.exchange}:${s.symbol}').toSet();
    final wanted = byKey.keys.toSet();
    final toAdd = desired
        .where((s) => !existing.contains('${s.exchange}:${s.symbol}'))
        .toList();
    final toRemove = _subs
        .where((s) => !wanted.contains('${s.exchange}:${s.symbol}'))
        .toList();
    if (toAdd.isNotEmpty) service.subscribe(toAdd);
    if (toRemove.isNotEmpty) service.unsubscribe(toRemove);
    _subs = desired;
  }

  @override
  void dispose() {
    if (_subs.isNotEmpty) {
      ref.read(ticksServiceProvider).unsubscribe(_subs);
    }
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(homeIndicesProvider);
    ref.invalidate(homeTrendingProvider);
    ref.invalidate(portfolioProvider);
    ref.invalidate(watchlistsListProvider);
    await Future.wait([
      ref.read(homeIndicesProvider.future),
      ref.read(homeTrendingProvider.future),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final indices = ref.watch(homeIndicesProvider).value ?? const [];
    final trending = ref.watch(homeTrendingProvider).value ?? const [];
    final bookmarks = ref.watch(bookmarksProvider).value ?? const [];
    final positions =
        ref.watch(portfolioProvider).value?.positions ?? const [];
    if (indices.isNotEmpty ||
        trending.isNotEmpty ||
        bookmarks.isNotEmpty ||
        positions.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _sync(indices, trending, bookmarks, positions),
      );
    }
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            HomeAppBar(user: widget.user),
            const SizedBox(height: 8),
            const PortfolioHeroCard(),
            const MarketStatusCard(),
            const SizedBox(height: 12),
            const DailySummaryCard(),
            const SizedBox(height: 18),
            const _SectionHeader(title: 'Markets', subtitle: 'Live'),
            const SizedBox(height: 10),
            const IndicesStrip(),
            const SizedBox(height: 24),
            const QuickActions(),
            const SizedBox(height: 24),
            const _SectionHeader(
              title: 'Most traded',
              subtitle: 'Popular among investors',
            ),
            const SizedBox(height: 10),
            const TrendingStocksCarousel(),
            const SizedBox(height: 24),
            const BookmarksRail(),
            const SizedBox(height: 24),
            const RecentlyViewedCarousel(),
            const SizedBox(height: 8),
            const _SectionHeader(title: 'Top movers', subtitle: 'NSE'),
            const SizedBox(height: 10),
            const TopMoversSection(),
            const SizedBox(height: 24),
            const _SectionHeader(
              title: 'My watchlists',
              subtitle: 'Your saved lists',
            ),
            const SizedBox(height: 10),
            const WatchlistsStrip(),
            const SizedBox(height: 24),
            const NewsSection(),
            const SizedBox(height: 16),
            const _LearnCard(),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, this.subtitle});
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(width: 10),
            Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Text(
                subtitle!,
                style: TextStyle(
                  fontSize: 12,
                  color: scheme.onSurface.withValues(alpha: 0.55),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LearnCard extends StatelessWidget {
  const _LearnCard();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              scheme.tertiaryContainer.withValues(alpha: 0.5),
              scheme.surfaceContainerHighest.withValues(alpha: 0.3),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.tertiary.withValues(alpha: 0.18),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                Icons.school_outlined,
                color: scheme.tertiary,
                size: 22,
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Trade risk-free',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Virtual ₹10L starting balance. Real prices, simulated trades.',
                    style: TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
