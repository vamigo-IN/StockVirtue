import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design/tokens.dart';
import '../../../core/money_format.dart';
import '../../../widgets/ui/market_widgets.dart';
import '../news_format.dart';
import '../news_models.dart';
import '../widgets/news_tiles.dart';
import 'story_links.dart';
import 'story_market.dart';

/// Every widget type the newsroom's editor offers, with the newest config
/// version this app can draw. Anything else (a type added later, or a newer
/// version of one) shows a "View on stockvirtue.com" card instead.
const kStoryWidgetVersions = <String, int>{
  'stock_quote': 1,
  'index_quote': 1,
  'mini_chart': 1,
  'candle_chart': 1,
  'stock_compare': 1,
  'top_gainers': 1,
  'top_losers': 1,
  'most_active': 1,
  'sector_performance': 1,
  'heatmap': 1,
  'commodities': 1,
  'currency_rates': 1,
  'ipo': 1,
  'market_ticker': 1,
  'key_takeaways': 1,
  'related_stocks': 1,
  'related_news': 1,
  'educational': 1,
  'risk_disclaimer': 1,
  'promo_banner': 1,
};

bool storyWidgetSupported(String type, int version) =>
    version <= (kStoryWidgetVersions[type] ?? 0);

// ── Config readers (configs are checked on the server; stay lenient) ────

String _s(Map<String, dynamic> c, String k, [String fb = '']) =>
    c[k] is String ? c[k] as String : fb;
int _i(Map<String, dynamic> c, String k, int fb) =>
    c[k] is num ? (c[k] as num).toInt() : fb;
List<String> _list(Map<String, dynamic> c, String k) =>
    c[k] is List ? (c[k] as List).whereType<String>().toList() : const [];

/// Live widgets refresh no faster than this, whatever the story asks.
const _minRefresh = 15;

/// One widget block from a story.
class StoryWidget extends StatelessWidget {
  const StoryWidget({
    super.key,
    required this.type,
    required this.version,
    required this.config,
    required this.articleUrl,
    this.data,
  });

  final String type;
  final int version;
  final Map<String, dynamic> config;
  final Map<String, dynamic>? data;

  /// The story on the website, for anything the app can't draw.
  final String articleUrl;

  @override
  Widget build(BuildContext context) {
    if (!storyWidgetSupported(type, version)) {
      return StoryFallbackCard(url: articleUrl);
    }
    final c = config;
    final refresh = _i(c, 'refresh', 30);
    switch (type) {
      case 'stock_quote':
      case 'index_quote':
        return _SingleQuote(
          ref: _s(c, 'symbol'),
          refresh: refresh,
          linkStock: type == 'stock_quote',
        );
      case 'related_stocks':
        return _QuoteList(
          title: 'Stocks in this story',
          refs: _list(c, 'symbols'),
          refresh: refresh,
        );
      case 'commodities':
        return _KindList(
          title: 'Commodities (MCX futures)',
          kind: 'COMMODITY',
          refs: _list(c, 'symbols'),
          refresh: refresh,
        );
      case 'currency_rates':
        return _KindList(
          title: 'Rupee rates',
          kind: 'CURRENCY',
          refs: _list(c, 'symbols'),
          refresh: refresh,
        );
      case 'market_ticker':
        return _KindList(
          title: 'Markets',
          kind: null,
          refs: _list(c, 'symbols'),
          refresh: refresh,
        );
      case 'top_gainers':
      case 'top_losers':
      case 'most_active':
        return _Movers(
          type: type == 'top_gainers'
              ? 'gainers'
              : type == 'top_losers'
                  ? 'losers'
                  : 'active',
          segment: _s(c, 'segment', 'largecap'),
          limit: _i(c, 'limit', 5),
          refresh: refresh,
        );
      case 'sector_performance':
        return _Sectors(limit: _i(c, 'limit', 8), refresh: refresh);
      case 'heatmap':
        return _Heatmap(index: _s(c, 'index', 'NIFTY'), refresh: refresh);
      case 'mini_chart':
      case 'candle_chart':
        return _Chart(
          ref: _s(c, 'symbol'),
          range: _s(c, 'range', type == 'mini_chart' ? '1D' : '1M'),
          candles: type == 'candle_chart',
          refresh: refresh,
        );
      case 'stock_compare':
        return _Compare(refs: _list(c, 'symbols'), range: _s(c, 'range', '6M'));
      case 'ipo':
        return _Ipos(
          view: _s(c, 'view', 'open'),
          symbol: _s(c, 'symbol'),
          limit: _i(c, 'limit', 5),
        );
      case 'key_takeaways':
        return _Takeaways(
          title: _s(c, 'title', 'Key takeaways'),
          items: _list(c, 'items'),
        );
      case 'educational':
        return _Explainer(
          term: _s(c, 'term'),
          body: _s(c, 'body'),
          link: c['link'] is String ? c['link'] as String : null,
        );
      case 'risk_disclaimer':
        final text = data?['text'];
        return text is String && text.isNotEmpty
            ? InfoBanner(
                tone: BannerTone.warning,
                icon: Icons.shield_outlined,
                title: 'Please note',
                message: text,
              )
            : const SizedBox.shrink();
      case 'promo_banner':
        return _Promo(
          headline: _s(c, 'headline'),
          body: _s(c, 'body'),
          ctaLabel: _s(c, 'ctaLabel'),
          ctaUrl: _s(c, 'ctaUrl'),
          theme: _s(c, 'theme', 'dark'),
        );
      case 'related_news':
        final cards = NewsCard.listFrom(data?['cards']);
        return cards.isEmpty
            ? const SizedBox.shrink()
            : _RelatedNews(title: _s(c, 'title', 'Related news'), cards: cards);
      default:
        return StoryFallbackCard(url: articleUrl);
    }
  }
}

/// For anything this version of the app can't draw.
class StoryFallbackCard extends StatelessWidget {
  const StoryFallbackCard({super.key, required this.url});
  final String url;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return AppCard(
      radius: AppRadius.md,
      padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
      onTap: () => openOnWebsite(context, url),
      child: Row(
        children: [
          Icon(Icons.public_rounded, size: 20, color: scheme.primary),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'View on stockvirtue.com',
                  style: t.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(
                  'This part of the story opens on the website.',
                  style: t.bodySmall,
                ),
              ],
            ),
          ),
          Icon(Icons.open_in_new_rounded, size: 18, color: scheme.primary),
          const SizedBox(width: 6),
        ],
      ),
    );
  }
}

// ── Frame, stamps and states ─────────────────────────────────────────────

class _Frame extends StatelessWidget {
  const _Frame({required this.title, required this.child, this.icon, this.footer});
  final String title;
  final IconData? icon;
  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return AppCard(
      radius: AppRadius.md,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (icon != null) ...[
                Icon(icon, size: 16, color: scheme.onSurfaceVariant),
                const SizedBox(width: 6),
              ],
              Expanded(
                child: Text(
                  title,
                  style: t.labelLarge?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          child,
          if (footer != null) ...[const SizedBox(height: 10), footer!],
        ],
      ),
    );
  }
}

/// "Live · 3:41 pm · NSE via Angel One": how a price is labelled, when it
/// is from, and whose data it is.
class _Stamp extends StatelessWidget {
  const _Stamp({this.label, this.asOf, this.attribution = '', this.delayMinutes});
  final String? label;
  final DateTime? asOf;
  final String attribution;
  final int? delayMinutes;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme.labelSmall;
    final m = context.market;
    final scheme = Theme.of(context).colorScheme;
    final (text, color) = switch (label) {
      'LIVE' => ('Live', m.up),
      'DELAYED' => (
          delayMinutes != null ? 'Delayed $delayMinutes min' : 'Delayed',
          m.warning
        ),
      'EOD' => ('End of day', scheme.onSurfaceVariant),
      _ => ('', scheme.onSurfaceVariant),
    };
    final at = asOf;
    final when = at == null
        ? ''
        : label == 'EOD'
            ? istDate(at)
            : istClock(at);
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 6,
      runSpacing: 2,
      children: [
        if (text.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(AppRadius.xs),
            ),
            child: Text(
              text,
              style: t?.copyWith(color: color, fontWeight: FontWeight.w700),
            ),
          ),
        Text(
          [
            if (when.isNotEmpty) 'as of $when',
            if (attribution.isNotEmpty) attribution,
          ].join(' · '),
          style: t?.copyWith(color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text(text, style: Theme.of(context).textTheme.bodySmall),
      );
}

class _Loading extends StatelessWidget {
  const _Loading({this.height = 56});
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: const Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
}

const _rightsNote = 'Market data isn’t available in the app right now.';
const _upstreamNote = 'Prices can’t be loaded right now.';

/// Re-asks for a widget's data every [seconds] while it is on screen: not
/// while another screen covers the story, nor with the app in the
/// background.
class _Refreshing extends ConsumerStatefulWidget {
  const _Refreshing({
    required this.seconds,
    required this.onTick,
    required this.child,
  });
  final int seconds;
  final void Function(WidgetRef ref) onTick;
  final Widget child;

  @override
  ConsumerState<_Refreshing> createState() => _RefreshingState();
}

class _RefreshingState extends ConsumerState<_Refreshing> {
  Timer? _timer;

  /// False while a route covers this one (its tickers are muted).
  bool _visible = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TickerMode.valuesOf(context).enabled;
  }

  @override
  void initState() {
    super.initState();
    if (widget.seconds > 0) {
      _timer = Timer.periodic(
        Duration(seconds: math.max(widget.seconds, _minRefresh)),
        (_) {
          final foreground = WidgetsBinding.instance.lifecycleState ==
              AppLifecycleState.resumed;
          if (mounted && _visible && foreground) widget.onTick(ref);
        },
      );
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

String _price(double v, String kind) => kind == 'CURRENCY'
    ? v.toStringAsFixed(4)
    : formatInrPlain(v);

// ── Quotes ──────────────────────────────────────────────────────────────

class _SingleQuote extends ConsumerWidget {
  const _SingleQuote({
    required this.ref,
    required this.refresh,
    required this.linkStock,
  });
  final String ref;
  final int refresh;
  final bool linkStock;

  @override
  Widget build(BuildContext context, WidgetRef wref) {
    final provider = storyQuotesProvider(ref);
    final async = wref.watch(provider);
    final t = Theme.of(context).textTheme;
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(provider),
      child: async.when(
        loading: () => const _Frame(title: 'Quote', child: _Loading()),
        error: (_, _) =>
            const _Frame(title: 'Quote', child: _Note(_upstreamNote)),
        data: (res) {
          final q = res.quotes.isEmpty ? null : res.quotes.first;
          if (q == null) {
            return _Frame(
              title: ref.split(':').last,
              child: _Note(res.off ? _rightsNote : _upstreamNote),
            );
          }
          final canOpen = linkStock && q.isStock;
          return GestureDetector(
            onTap: canOpen
                ? () => openStoryStock(context, wref, q.exchange, q.symbol)
                : null,
            child: _Frame(
              title: q.name,
              icon: q.isStock ? Icons.show_chart_rounded : Icons.stacked_line_chart_rounded,
              footer: _Stamp(
                label: q.label,
                asOf: q.asOf,
                attribution: res.attribution,
                delayMinutes: res.delayMinutes,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      // Wraps the change under the price when space runs out.
                      Expanded(
                        child: Wrap(
                          spacing: 10,
                          runSpacing: 2,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            Text(
                              _price(q.ltp, q.kind),
                              style: t.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w800,
                                fontFeatures: const [
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                            DayChange(change: q.change, percent: q.changePct),
                          ],
                        ),
                      ),
                      if (canOpen)
                        Icon(
                          Icons.chevron_right_rounded,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                    ],
                  ),
                  Text(
                    q.isStock ? q.ref : (q.contract ?? q.ref),
                    style: t.bodySmall,
                  ),
                  if (q.low != null && q.high != null && q.high! > q.low!)
                    _DayRange(low: q.low!, high: q.high!, ltp: q.ltp, kind: q.kind),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _DayRange extends StatelessWidget {
  const _DayRange({
    required this.low,
    required this.high,
    required this.ltp,
    required this.kind,
  });
  final double low;
  final double high;
  final double ltp;
  final String kind;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme.labelSmall;
    final scheme = Theme.of(context).colorScheme;
    final pos = ((ltp - low) / (high - low)).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        children: [
          Row(
            children: [
              Text('Day low ${_price(low, kind)}', style: t),
              const Spacer(),
              Text('Day high ${_price(high, kind)}', style: t),
            ],
          ),
          const SizedBox(height: 6),
          LayoutBuilder(
            builder: (context, box) => SizedBox(
              height: 12,
              child: Stack(
                alignment: Alignment.centerLeft,
                children: [
                  Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Positioned(
                    left: (box.maxWidth - 10) * pos,
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: scheme.onSurface,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QuoteRow extends StatelessWidget {
  const _QuoteRow({required this.q, this.onTap});
  final StoryQuote q;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppRadius.xs),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    q.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  Text(
                    q.isStock ? q.symbol : (q.contract ?? q.symbol),
                    style: t.labelSmall,
                  ),
                ],
              ),
            ),
            Text(
              _price(q.ltp, q.kind),
              style: t.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 78,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: ChangePill(percent: q.changePct, compact: true),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The freshest label and time among quotes, for one stamp under a list.
({String? label, DateTime? asOf}) _stampOf(List<StoryQuote> qs) {
  if (qs.isEmpty) return (label: null, asOf: null);
  const order = ['EOD', 'DELAYED', 'LIVE'];
  var label = qs.first.label;
  DateTime? asOf;
  for (final q in qs) {
    if (order.indexOf(q.label ?? '') < order.indexOf(label ?? '')) {
      label = q.label;
    }
    if (q.asOf != null && (asOf == null || q.asOf!.isAfter(asOf))) {
      asOf = q.asOf;
    }
  }
  return (label: label, asOf: asOf);
}

class _QuoteList extends ConsumerWidget {
  const _QuoteList({
    required this.title,
    required this.refs,
    required this.refresh,
  });
  final String title;
  final List<String> refs;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (refs.isEmpty) return const SizedBox.shrink();
    final provider = storyQuotesProvider(refs.join(','));
    final async = ref.watch(provider);
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(provider),
      child: _Frame(
        title: title,
        icon: Icons.format_list_bulleted_rounded,
        footer: async.whenOrNull(data: (res) {
          final s = _stampOf(res.quotes);
          return res.quotes.isEmpty
              ? null
              : _Stamp(
                  label: s.label,
                  asOf: s.asOf,
                  attribution: res.attribution,
                  delayMinutes: res.delayMinutes,
                );
        }),
        child: async.when(
          loading: () => const _Loading(),
          error: (_, _) => const _Note(_upstreamNote),
          data: (res) => res.quotes.isEmpty
              ? _Note(res.off ? _rightsNote : _upstreamNote)
              : Column(
                  children: [
                    for (final q in res.quotes)
                      _QuoteRow(
                        q: q,
                        onTap: q.isStock
                            ? () => openStoryStock(context, ref, q.exchange, q.symbol)
                            : null,
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Curated instruments from the snapshot: one kind, chosen ones, or the
/// ticker's list (kind == null and nothing chosen).
class _KindList extends ConsumerWidget {
  const _KindList({
    required this.title,
    required this.kind,
    required this.refs,
    required this.refresh,
  });
  final String title;
  final String? kind;
  final List<String> refs;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(storySnapshotProvider);
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(storySnapshotProvider),
      child: async.when(
        loading: () => _Frame(title: title, child: const _Loading()),
        error: (_, _) => _Frame(title: title, child: const _Note(_upstreamNote)),
        data: (snap) {
          final all = kind == null
              ? snap.quotes
              : snap.quotes.where((q) => q.kind == kind).toList();
          final picked = refs.isNotEmpty
              ? [
                  for (final r in refs)
                    ...all.where((q) => q.ref == r).take(1),
                ]
              : kind == null
                  ? all.where((q) => q.inTicker).toList()
                  : all;
          final s = _stampOf(picked);
          return _Frame(
            title: title,
            icon: Icons.candlestick_chart_outlined,
            footer: picked.isEmpty
                ? null
                : _Stamp(
                    label: s.label,
                    asOf: s.asOf,
                    attribution: snap.attribution,
                    delayMinutes: snap.delayMinutes,
                  ),
            child: picked.isEmpty
                ? _Note(snap.off ? _rightsNote : 'Nothing to show right now.')
                : Column(
                    children: [
                      for (final q in picked)
                        _QuoteRow(
                          q: q,
                          onTap: q.isStock
                              ? () => openStoryStock(context, ref, q.exchange, q.symbol)
                              : null,
                        ),
                    ],
                  ),
          );
        },
      ),
    );
  }
}

// ── Lists: movers, sectors, heatmap ─────────────────────────────────────

class _ListRowTile extends StatelessWidget {
  const _ListRowTile({required this.row, this.onTap});
  final StoryListRow row;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    row.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  Text(row.symbol, style: t.labelSmall),
                ],
              ),
            ),
            Text(
              formatInrPlain(row.ltp),
              style: t.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
            const SizedBox(width: 10),
            SizedBox(
              width: 78,
              child: FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerRight,
                child: ChangePill(percent: row.changePct, compact: true),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Widget _listState(StoryList res, Widget Function() body) {
  if (!res.available) {
    return _Note(res.reason == 'rights' ? _rightsNote : _upstreamNote);
  }
  return res.rows.isEmpty ? const _Note('Nothing to show right now.') : body();
}

Widget? _listStamp(AsyncValue<StoryList> async) => async.whenOrNull(
      data: (res) => res.available
          ? _Stamp(label: res.label, asOf: res.asOf, attribution: res.attribution)
          : null,
    );

class _Movers extends ConsumerWidget {
  const _Movers({
    required this.type,
    required this.segment,
    required this.limit,
    required this.refresh,
  });
  final String type;
  final String segment;
  final int limit;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider =
        storyMoversProvider((type: type, segment: segment, limit: limit));
    final async = ref.watch(provider);
    final cap = switch (segment) {
      'midcap' => 'mid-cap',
      'smallcap' => 'small-cap',
      _ => 'large-cap',
    };
    final title = switch (type) {
      'gainers' => 'Top gainers ($cap)',
      'losers' => 'Top losers ($cap)',
      _ => 'Most active stocks',
    };
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(provider),
      child: _Frame(
        title: title,
        icon: type == 'losers'
            ? Icons.trending_down_rounded
            : type == 'gainers'
                ? Icons.trending_up_rounded
                : Icons.local_fire_department_outlined,
        footer: _listStamp(async),
        child: async.when(
          loading: () => const _Loading(height: 120),
          error: (_, _) => const _Note(_upstreamNote),
          data: (res) => _listState(
            res,
            () => Column(
              children: [
                for (final r in res.rows)
                  _ListRowTile(
                    row: r,
                    onTap: () => openStoryStock(
                      context,
                      ref,
                      r.ref.split(':').first,
                      r.symbol,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Sectors extends ConsumerWidget {
  const _Sectors({required this.limit, required this.refresh});
  final int limit;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(storySectorsProvider);
    final m = context.market;
    final t = Theme.of(context).textTheme;
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(storySectorsProvider),
      child: _Frame(
        title: 'Sector performance',
        icon: Icons.bar_chart_rounded,
        footer: _listStamp(async),
        child: async.when(
          loading: () => const _Loading(height: 120),
          error: (_, _) => const _Note(_upstreamNote),
          data: (res) => _listState(res, () {
            final rows = res.rows.where((r) => r.changePct != null).toList()
              ..sort((a, b) => b.changePct!.compareTo(a.changePct!));
            final shown = rows.take(limit).toList();
            final top = shown.fold<double>(
              0.5,
              (mx, r) => math.max(mx, r.changePct!.abs()),
            );
            return Column(
              children: [
                for (final r in shown)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 5),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 112,
                          child: Text(
                            r.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: t.bodySmall?.copyWith(fontWeight: FontWeight.w600),
                          ),
                        ),
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerLeft,
                            child: FractionallySizedBox(
                              widthFactor: (r.changePct!.abs() / top).clamp(0.04, 1.0),
                              child: Container(
                                height: 8,
                                decoration: BoxDecoration(
                                  color: m.changeColor(r.changePct),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 56,
                          child: Text(
                            '${r.changePct! >= 0 ? '+' : ''}${r.changePct!.toStringAsFixed(2)}%',
                            textAlign: TextAlign.right,
                            style: t.labelMedium?.copyWith(
                              color: m.changeColor(r.changePct),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          }),
        ),
      ),
    );
  }
}

class _Heatmap extends ConsumerWidget {
  const _Heatmap({required this.index, required this.refresh});
  final String index;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final provider = storyHeatmapProvider(index);
    final async = ref.watch(provider);
    final m = context.market;
    final name = switch (index) {
      'BANKNIFTY' => 'Nifty Bank',
      'SENSEX' => 'Sensex',
      _ => 'Nifty 50',
    };
    return _Refreshing(
      seconds: refresh,
      onTick: (r) => r.invalidate(provider),
      child: _Frame(
        title: '$name heatmap',
        icon: Icons.grid_view_rounded,
        footer: _listStamp(async),
        child: async.when(
          loading: () => const _Loading(height: 160),
          error: (_, _) => const _Note(_upstreamNote),
          data: (res) => _listState(res, () {
            return LayoutBuilder(builder: (context, box) {
              const cols = 4;
              const gap = 4.0;
              final w = (box.maxWidth - gap * (cols - 1)) / cols;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (final r in res.rows)
                    GestureDetector(
                      onTap: () => openStoryStock(
                        context,
                        ref,
                        r.ref.split(':').first,
                        r.symbol,
                      ),
                      child: Container(
                        width: w,
                        height: 48,
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          color: (r.changePct ?? 0) >= 0
                              ? m.up.withValues(
                                  alpha: (0.18 + (r.changePct ?? 0).abs() / 4).clamp(0.18, 0.9))
                              : m.down.withValues(
                                  alpha: (0.18 + (r.changePct ?? 0).abs() / 4).clamp(0.18, 0.9)),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(
                              r.symbol,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              r.changePct == null
                                  ? '—'
                                  : '${r.changePct! >= 0 ? '+' : ''}${r.changePct!.toStringAsFixed(2)}%',
                              style: const TextStyle(fontSize: 10),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            });
          }),
        ),
      ),
    );
  }
}

// ── Charts ──────────────────────────────────────────────────────────────

String _chartNote(StoryChart c) =>
    c.reason == 'rights' ? _rightsNote : 'The chart can’t be loaded right now.';

class _Chart extends ConsumerWidget {
  const _Chart({
    required this.ref,
    required this.range,
    required this.candles,
    required this.refresh,
  });
  final String ref;
  final String range;
  final bool candles;
  final int refresh;

  @override
  Widget build(BuildContext context, WidgetRef wref) {
    final provider = storyChartProvider((ref: ref, range: range));
    final async = wref.watch(provider);
    final t = Theme.of(context).textTheme;
    final symbol = ref.split(':').last;
    return _Refreshing(
      seconds: range == '1D' ? refresh : 0,
      onTick: (r) => r.invalidate(provider),
      child: _Frame(
        title: '$symbol · $range',
        icon: candles ? Icons.candlestick_chart_rounded : Icons.show_chart_rounded,
        footer: async.whenOrNull(
          data: (c) => c.available
              ? _Stamp(label: c.label, asOf: c.asOf, attribution: c.attribution)
              : null,
        ),
        child: async.when(
          loading: () => const _Loading(height: 140),
          error: (_, _) => const _Note('The chart can’t be loaded right now.'),
          data: (c) {
            if (!c.available) return _Note(_chartNote(c));
            final first = c.closes.first;
            final last = c.closes.last;
            final pct = first > 0 ? (last - first) / first * 100 : null;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      formatInrPlain(last),
                      style: t.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                    const SizedBox(width: 8),
                    ChangePill(percent: pct, compact: true),
                    const SizedBox(width: 6),
                    Text('over $range', style: t.labelSmall),
                  ],
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: candles ? 170 : 120,
                  width: double.infinity,
                  child: candles
                      ? CustomPaint(
                          painter: _CandlesPainter(
                            c.candles,
                            up: context.market.up,
                            down: context.market.down,
                          ),
                        )
                      : Sparkline(values: c.closes),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CandlesPainter extends CustomPainter {
  _CandlesPainter(this.candles, {required this.up, required this.down});
  final List<({double o, double h, double l, double c})> candles;
  final Color up;
  final Color down;

  @override
  void paint(Canvas canvas, Size size) {
    if (candles.isEmpty || size.isEmpty) return;
    final shown = candles.length > 90 ? candles.sublist(candles.length - 90) : candles;
    final lo = shown.map((c) => c.l).reduce(math.min);
    final hi = shown.map((c) => c.h).reduce(math.max);
    final span = (hi - lo).abs() < 1e-9 ? 1.0 : hi - lo;
    double y(double v) => size.height - (v - lo) / span * size.height;
    final step = size.width / shown.length;
    final body = math.max(1.5, step * 0.6);
    for (var i = 0; i < shown.length; i++) {
      final c = shown[i];
      final x = step * i + step / 2;
      final paint = Paint()..color = c.c >= c.o ? up : down;
      canvas.drawLine(Offset(x, y(c.h)), Offset(x, y(c.l)), paint..strokeWidth = 1);
      final top = y(math.max(c.o, c.c));
      final bottom = y(math.min(c.o, c.c));
      canvas.drawRect(
        Rect.fromLTRB(x - body / 2, top, x + body / 2, math.max(bottom, top + 1)),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_CandlesPainter old) => old.candles != candles;
}

const _comparePalette = [
  Color(0xFF5EA8FF),
  Color(0xFFF5B547),
  Color(0xFFB57BFF),
  Color(0xFF2BD67B),
];

class _Compare extends ConsumerWidget {
  const _Compare({required this.refs, required this.range});
  final List<String> refs;
  final String range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shown = refs.take(4).toList();
    final charts = [
      for (final r in shown) ref.watch(storyChartProvider((ref: r, range: range))),
    ];
    final t = Theme.of(context).textTheme;
    final loading = charts.any((c) => c.isLoading && !c.hasValue);
    final ready = <(String, List<double>)>[];
    StoryChart? any;
    for (var i = 0; i < shown.length; i++) {
      final c = charts[i].value;
      if (c != null) any ??= c;
      if (c != null && c.available && c.closes.first > 0) {
        final base = c.closes.first;
        ready.add((shown[i], [for (final v in c.closes) (v / base - 1) * 100]));
      }
    }
    return _Frame(
      title: 'Comparison · $range',
      icon: Icons.stacked_line_chart_rounded,
      footer: any != null && ready.isNotEmpty
          ? _Stamp(label: any.label, asOf: any.asOf, attribution: any.attribution)
          : null,
      child: loading
          ? const _Loading(height: 140)
          : ready.length < 2
              ? _Note(any != null ? _chartNote(any) : 'The comparison can’t be loaded right now.')
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 150,
                      width: double.infinity,
                      child: CustomPaint(
                        painter: _ComparePainter([for (final r in ready) r.$2]),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 14,
                      runSpacing: 6,
                      children: [
                        for (var i = 0; i < ready.length; i++)
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 10,
                                height: 10,
                                decoration: BoxDecoration(
                                  color: _comparePalette[i],
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 5),
                              Text(
                                '${ready[i].$1.split(':').last} '
                                '${ready[i].$2.last >= 0 ? '+' : ''}${ready[i].$2.last.toStringAsFixed(1)}%',
                                style: t.labelMedium,
                              ),
                            ],
                          ),
                      ],
                    ),
                  ],
                ),
    );
  }
}

class _ComparePainter extends CustomPainter {
  _ComparePainter(this.series);
  final List<List<double>> series;

  @override
  void paint(Canvas canvas, Size size) {
    final all = series.expand((s) => s).toList();
    if (all.isEmpty || size.isEmpty) return;
    final lo = math.min(0.0, all.reduce(math.min));
    final hi = math.max(0.0, all.reduce(math.max));
    final span = (hi - lo).abs() < 1e-9 ? 1.0 : hi - lo;
    double y(double v) => size.height - (v - lo) / span * size.height;
    canvas.drawLine(
      Offset(0, y(0)),
      Offset(size.width, y(0)),
      Paint()
        ..color = const Color(0x55888888)
        ..strokeWidth = 1,
    );
    for (var i = 0; i < series.length; i++) {
      final s = series[i];
      if (s.length < 2) continue;
      final dx = size.width / (s.length - 1);
      final path = Path()..moveTo(0, y(s.first));
      for (var j = 1; j < s.length; j++) {
        path.lineTo(dx * j, y(s[j]));
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = _comparePalette[i % _comparePalette.length]
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.8
          ..strokeJoin = StrokeJoin.round,
      );
    }
  }

  @override
  bool shouldRepaint(_ComparePainter old) => old.series != series;
}

// ── IPOs ────────────────────────────────────────────────────────────────

class _Ipos extends ConsumerWidget {
  const _Ipos({required this.view, required this.symbol, required this.limit});
  final String view;
  final String symbol;
  final int limit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(storyIposProvider);
    final t = Theme.of(context).textTheme;
    final m = context.market;
    final title = switch (view) {
      'upcoming' => 'Upcoming IPOs',
      'listed' => 'Recently listed IPOs',
      'issue' => 'IPO',
      _ => 'IPOs open now',
    };
    return _Frame(
      title: title,
      icon: Icons.rocket_launch_outlined,
      footer: async.whenOrNull(
        data: (b) => b.attribution.isEmpty
            ? null
            : Text(b.attribution, style: t.labelSmall),
      ),
      child: async.when(
        loading: () => const _Loading(height: 100),
        error: (_, _) => const _Note('IPO details can’t be loaded right now.'),
        data: (b) {
          if (!b.available) {
            return const _Note('IPO details can’t be loaded right now.');
          }
          final List<StoryIpo> rows;
          if (view == 'listed') {
            rows = b.listed.take(limit).toList();
          } else if (view == 'issue') {
            rows = [...b.open, ...b.listingSoon, ...b.upcoming]
                .where((i) => i.symbol == symbol.toUpperCase())
                .take(1)
                .toList();
          } else {
            rows = (view == 'open' ? b.open : b.upcoming).take(limit).toList();
          }
          if (rows.isEmpty) {
            return _Note(view == 'listed'
                ? 'No recent listings.'
                : view == 'issue'
                    ? 'That issue isn’t on the board right now.'
                    : view == 'open'
                        ? 'No IPOs are open right now.'
                        : 'No IPOs announced yet.');
          }
          return Column(
            children: [
              for (final i in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              i.name,
                              style: t.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                            ),
                            Text(
                              view == 'listed'
                                  ? [
                                      if (i.listingDate != null) 'Listed ${i.listingDate}',
                                      if (i.issuePrice != null)
                                        'issue ₹${formatInrPlain(i.issuePrice!)}',
                                    ].join(' · ')
                                  : [
                                      ?i.priceRange,
                                      if (i.openDate != null || i.closeDate != null)
                                        '${i.openDate ?? '?'} to ${i.closeDate ?? '?'}',
                                    ].join(' · '),
                              style: t.labelSmall,
                            ),
                          ],
                        ),
                      ),
                      if (view == 'listed' && i.gainPct != null)
                        ChangePill(percent: i.gainPct, compact: true)
                      else if (i.subscription != null)
                        Text(
                          '${i.subscription!.toStringAsFixed(2)}x',
                          style: t.labelMedium?.copyWith(
                            color: m.info,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                    ],
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

// ── Editorial widgets ───────────────────────────────────────────────────

class _Takeaways extends StatelessWidget {
  const _Takeaways({required this.title, required this.items});
  final String title;
  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.primary.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: scheme.primary.withValues(alpha: 0.25)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final item in items)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Icon(Icons.check_circle_rounded, size: 16, color: scheme.primary),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(item, style: t.bodyMedium?.copyWith(height: 1.45)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Explainer extends StatelessWidget {
  const _Explainer({required this.term, required this.body, this.link});
  final String term;
  final String body;
  final String? link;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final m = context.market;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: m.info.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: m.info.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'EXPLAINER',
            style: t.labelSmall?.copyWith(
              color: m.info,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
            ),
          ),
          const SizedBox(height: 4),
          Text(term, style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          for (final p in body.split(RegExp(r'\n+')).where((p) => p.trim().isNotEmpty))
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Text(p.trim(), style: t.bodyMedium?.copyWith(height: 1.5)),
            ),
          if (link != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => openStoryLink(context, link!),
                child: const Text('Learn more'),
              ),
            ),
        ],
      ),
    );
  }
}

class _Promo extends StatelessWidget {
  const _Promo({
    required this.headline,
    required this.body,
    required this.ctaLabel,
    required this.ctaUrl,
    required this.theme,
  });
  final String headline;
  final String body;
  final String ctaLabel;
  final String ctaUrl;
  final String theme;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final light = theme == 'light';
    final gradient = switch (theme) {
      'brand' => const LinearGradient(colors: [Color(0xFF0E7C5A), Color(0xFF22D38A)]),
      'light' => null,
      _ => const LinearGradient(colors: [Color(0xFF0B1220), Color(0xFF16263A)]),
    };
    final fg = light ? scheme.onSurface : Colors.white;
    return AppCard(
      radius: AppRadius.md,
      gradient: gradient,
      color: light ? scheme.surfaceContainerHighest : null,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            headline,
            style: TextStyle(color: fg, fontSize: 17, fontWeight: FontWeight.w800),
          ),
          if (body.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(body, style: TextStyle(color: fg.withValues(alpha: 0.85), height: 1.4)),
          ],
          const SizedBox(height: 12),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: light ? scheme.primary : Colors.white,
              foregroundColor: light ? scheme.onPrimary : const Color(0xFF0B1220),
            ),
            onPressed: () => openStoryLink(context, ctaUrl),
            child: Text(ctaLabel),
          ),
        ],
      ),
    );
  }
}

class _RelatedNews extends StatelessWidget {
  const _RelatedNews({required this.title, required this.cards});
  final String title;
  final List<NewsCard> cards;

  @override
  Widget build(BuildContext context) {
    return _Frame(
      title: title,
      icon: Icons.article_outlined,
      child: Column(
        children: [
          for (final c in cards) NewsListTile(card: c, dense: true),
        ],
      ),
    );
  }
}
