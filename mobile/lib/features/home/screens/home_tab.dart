import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/models/portfolio.dart';
import '../../../data/models/user.dart';
import '../../../core/design/tokens.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../academy/screens/academy_screen.dart';
import '../../bookmarks/bookmarks_storage.dart';
import '../../bookmarks/widgets/bookmarks_rail.dart';
import '../../ipo/ipo_repository.dart';
import '../../ipo/widgets/ipo_home_section.dart';
import '../../market/screens/indices_screen.dart';
import '../../market/screens/stock_search_screen.dart';
import '../../news/news_repository.dart';
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
  /// Read once while mounted — `ref` is off-limits in dispose(), where
  /// the subscriptions are released.
  late final TicksService _ticks;

  @override
  void initState() {
    super.initState();
    _ticks = ref.read(ticksServiceProvider);
  }

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
    final service = _ticks;
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
      _ticks.unsubscribe(_subs);
    }
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(homeIndicesProvider);
    ref.invalidate(homeTrendingProvider);
    ref.invalidate(portfolioProvider);
    ref.invalidate(watchlistsListProvider);
    ref.invalidate(ipoBoardProvider);
    ref.invalidate(moversProvider);
    ref.invalidate(marketsNewsProvider);
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
          padding: const EdgeInsets.only(bottom: AppSpace.xxl),
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            HomeAppBar(user: widget.user),
            const SizedBox(height: AppSpace.xs),
            const PortfolioHeroCard(),
            const SizedBox(height: AppSpace.sm),
            const MarketStatusCard(),
            SectionHeader(
              title: 'Indices',
              actionLabel: 'See all',
              onAction: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const IndicesScreen()),
              ),
            ),
            const IndicesStrip(),
            const SizedBox(height: AppSpace.lg),
            const QuickActions(),
            SectionHeader(
              title: 'Most traded',
              subtitle: 'Popular large caps on NSE',
              actionLabel: 'Explore',
              onAction: () => Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const StockSearchScreen()),
              ),
            ),
            const TrendingStocksCarousel(),
            const SectionHeader(
              title: 'Top movers',
              subtitle: 'Biggest moves on NSE today',
            ),
            const TopMoversSection(),
            const IpoHomeSection(),
            const SectionHeader(title: 'My watchlists'),
            const WatchlistsStrip(),
            const BookmarksRail(),
            const RecentlyViewedCarousel(),
            const NewsSection(),
            const SizedBox(height: AppSpace.lg),
            const _LearnCard(),
          ],
        ),
      ),
    );
  }
}

class _LearnCard extends StatelessWidget {
  const _LearnCard();

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final m = context.market;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.md),
      child: AppCard(
        radius: AppRadius.md,
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const AcademyScreen()),
        ),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: m.violet.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(AppRadius.sm),
              ),
              child: Icon(Icons.school_rounded, color: m.violet, size: 22),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Learn while you trade',
                    style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'Bite-sized lessons in the Trading Academy. Real prices, '
                    'virtual money — zero risk.',
                    style: t.bodySmall,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              Icons.chevron_right_rounded,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }
}
