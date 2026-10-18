import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../core/money_format.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../../../widgets/ui/skeletons.dart';
import '../../../widgets/ui/symbol_avatar.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../ipo_repository.dart';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

String ipoDate(DateTime? d) => d == null ? '—' : '${d.day} ${_months[d.month - 1]}';

/// "Closes today" / "Closes in 3 days" / "Opens tomorrow".
String _relative(String verb, DateTime? d) {
  if (d == null) return '';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final days = DateTime(d.year, d.month, d.day).difference(today).inDays;
  if (days == 0) return '$verb today';
  if (days == 1) return '$verb tomorrow';
  if (days > 1) return '$verb in $days days';
  return '$verb ${ipoDate(d)}';
}

/// IPO centre: live subscription for open issues, the upcoming calendar,
/// issues awaiting listing, and how recent listings have done since — all
/// from NSE. Recently listed stocks are tradeable like any other share.
class IpoScreen extends ConsumerWidget {
  const IpoScreen({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(ipoBoardProvider);
    final board = async.value;
    String count(int n) => n > 0 ? ' ($n)' : '';
    return DefaultTabController(
      length: 3,
      initialIndex: initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('IPOs'),
          bottom: TabBar(
            tabs: [
              Tab(text: 'Open${count(board?.open.length ?? 0)}'),
              Tab(
                text:
                    'Upcoming${count((board?.upcoming.length ?? 0) + (board?.listingSoon.length ?? 0))}',
              ),
              Tab(text: 'Listed${count(board?.recentlyListed.length ?? 0)}'),
            ],
          ),
        ),
        body: async.when(
          loading: () => const SkeletonList(),
          error: (e, _) => ErrorRetryView(
            error: e,
            errorContext: 'ipo',
            onRetry: () => ref.invalidate(ipoBoardProvider),
          ),
          data: (b) {
            if (!b.available) {
              return const EmptyState(
                icon: Icons.cloud_off_rounded,
                title: 'IPO data is unavailable right now',
                subtitle:
                    'We couldn’t reach the exchange’s IPO feed. Please check '
                    'back in a little while.',
              );
            }
            Future<void> refresh() async {
              ref.invalidate(ipoBoardProvider);
              await ref.read(ipoBoardProvider.future);
            }

            return TabBarView(
              children: [
                RefreshIndicator(
                  onRefresh: refresh,
                  child: _IssueList(
                    issues: b.open,
                    empty: 'No IPOs are open for bidding right now.',
                    header: const InfoBanner(
                      icon: Icons.school_outlined,
                      message:
                          'Subscription shows how many times the shares on '
                          'offer have been bid for. IPO bidding isn’t simulated '
                          '— follow the demand here, then trade the stock from '
                          'its first day of listing.',
                    ),
                  ),
                ),
                RefreshIndicator(
                  onRefresh: refresh,
                  child: _IssueList(
                    issues: b.upcoming,
                    soon: b.listingSoon,
                    empty: 'No upcoming IPOs announced yet.',
                  ),
                ),
                RefreshIndicator(
                  onRefresh: refresh,
                  child: _ListedList(listed: b.recentlyListed),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _IssueList extends StatelessWidget {
  const _IssueList({
    required this.issues,
    required this.empty,
    this.soon = const [],
    this.header,
  });

  final List<IpoIssue> issues;
  final List<IpoIssue> soon;
  final String empty;
  final Widget? header;

  @override
  Widget build(BuildContext context) {
    if (issues.isEmpty && soon.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 60),
          EmptyState(icon: Icons.event_available_rounded, title: empty),
        ],
      );
    }
    var i = 0;
    Widget animated(Widget w) => w
        .animate()
        .fadeIn(duration: 240.ms, delay: (30 * i++).ms)
        .slideY(begin: 0.06, end: 0);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
      children: [
        if (header != null) ...[header!, const SizedBox(height: 14)],
        for (final issue in issues)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: animated(IpoIssueCard(issue: issue)),
          ),
        if (soon.isNotEmpty) ...[
          const SectionHeader(
            title: 'Listing soon',
            subtitle: 'Bidding closed · allotment & listing in progress',
            padding: EdgeInsets.fromLTRB(4, 8, 4, 10),
          ),
          for (final issue in soon)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: animated(IpoIssueCard(issue: issue, closed: true)),
            ),
        ],
      ],
    );
  }
}

/// Card for an open / upcoming / closed IPO issue.
class IpoIssueCard extends StatelessWidget {
  const IpoIssueCard({
    super.key,
    required this.issue,
    this.closed = false,
    this.compact = false,
  });

  final IpoIssue issue;
  final bool closed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final scheme = Theme.of(context).colorScheme;
    final now = DateTime.now();
    final isOpen = !closed &&
        issue.openDate != null &&
        !issue.openDate!.isAfter(now) &&
        issue.subscription != null;
    final status = closed
        ? 'Closed ${ipoDate(issue.closeDate)}'
        : isOpen
            ? _relative('Closes', issue.closeDate)
            : _relative('Opens', issue.openDate);
    final statusColor = closed ? scheme.onSurfaceVariant : (isOpen ? m.up : m.info);
    final sub = issue.subscription;
    return AppCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SymbolAvatar(symbol: issue.symbol, size: 40),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      issue.companyName,
                      maxLines: compact ? 1 : 2,
                      overflow: TextOverflow.ellipsis,
                      style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        _SegmentTag(isSme: issue.isSme),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            status,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.labelMedium?.copyWith(color: statusColor),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: StatTile(
                  label: 'Price band',
                  value: issue.priceRange ?? '—',
                ),
              ),
              Expanded(
                child: StatTile(
                  label: closed ? 'Closed on' : (isOpen ? 'Closes' : 'Opens'),
                  value: ipoDate(closed || isOpen ? issue.closeDate : issue.openDate),
                ),
              ),
              Expanded(
                child: StatTile(
                  label: 'Issue size',
                  value: issue.issueValue != null
                      ? formatInrCompact(issue.issueValue!)
                      : '—',
                  crossAxisAlignment: CrossAxisAlignment.end,
                ),
              ),
            ],
          ),
          if (isOpen && sub != null) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Subscribed', style: t.bodySmall),
                const Spacer(),
                Text(
                  '${sub.toStringAsFixed(2)}x',
                  style: t.labelLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: sub >= 1 ? m.up : m.warning,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadius.pill),
              child: LinearProgressIndicator(
                // Fill against a 10x scale — anything past 10x is a hot issue.
                value: (sub / 10).clamp(0.02, 1.0),
                minHeight: 7,
                color: sub >= 1 ? m.up : m.warning,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SegmentTag extends StatelessWidget {
  const _SegmentTag({required this.isSme});
  final bool isSme;

  @override
  Widget build(BuildContext context) {
    final m = context.market;
    final color = isSme ? m.violet : m.info;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        isSme ? 'SME' : 'MAINBOARD',
        style: TextStyle(
          color: color,
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}

class _ListedList extends StatelessWidget {
  const _ListedList({required this.listed});
  final List<ListedIpo> listed;

  @override
  Widget build(BuildContext context) {
    if (listed.isEmpty) {
      return ListView(
        children: const [
          SizedBox(height: 60),
          EmptyState(
            icon: Icons.storefront_outlined,
            title: 'No recent listings',
            subtitle: 'Stocks listed in the last 60 days will show up here.',
          ),
        ],
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: listed.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) => ListedIpoTile(ipo: listed[i])
          .animate()
          .fadeIn(duration: 220.ms, delay: (20 * i).ms),
    );
  }
}

/// A recent listing: issue price → live price, gain since IPO, tap to trade.
class ListedIpoTile extends StatelessWidget {
  const ListedIpoTile({super.key, required this.ipo});
  final ListedIpo ipo;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final canOpen = ipo.tradeable &&
        ipo.symboltoken != null &&
        ipo.tradingsymbol != null;
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      onTap: canOpen
          ? () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => SymbolDetailScreen(
                    symbol: ipo.symbol,
                    tradingsymbol: ipo.tradingsymbol!,
                    symboltoken: ipo.symboltoken!,
                    exchange: ipo.exchange,
                  ),
                ),
              )
          : null,
      child: Row(
        children: [
          SymbolAvatar(symbol: ipo.symbol, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  ipo.companyName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 3),
                Text(
                  'Listed ${ipoDate(ipo.listingDate)}'
                  '${ipo.issuePrice != null ? ' · Issue ${formatInr(ipo.issuePrice!, decimals: 0)}' : ''}'
                  '${ipo.isSme ? ' · SME' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: t.bodySmall,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                ipo.ltp != null ? formatInr(ipo.ltp!) : '—',
                style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              if (ipo.gainPct != null)
                ChangePill(percent: ipo.gainPct, compact: true)
              else
                Text(
                  canOpen ? 'Trade' : 'Not yet tradeable',
                  style: t.labelSmall,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
