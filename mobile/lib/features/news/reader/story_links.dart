import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config.dart';
import '../../market/market_repository.dart';
import '../../symbol/screens/symbol_detail_screen.dart';
import '../screens/news_reader_screen.dart';

final _articlePath = RegExp(r'^/news/([a-z0-9]+(?:-[a-z0-9]+)*)/?$');
final _site = Uri.parse(kWebsiteUrl);

/// Website pages under /news that aren't stories (the newsroom never gives a
/// story these addresses): they open on the website.
const _sectionPages = {
  'api', 'author', 'authors', 'bookmarks', 'breaking', 'categories',
  'category', 'commodities', 'education', 'featured', 'feed', 'home', 'ipo',
  'latest', 'markets', 'me', 'page', 'push', 'rss', 'search', 'sitemap',
  'stocks', 'tag', 'tags', 'trending',
};

/// Opens a page on the website in the in-app browser — never the native
/// reader (the "View on stockvirtue.com" card would otherwise reopen itself).
Future<void> openOnWebsite(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  final uri = Uri.tryParse(url);
  final ok = uri != null &&
      await launchUrl(uri, mode: LaunchMode.inAppBrowserView)
          .catchError((_) => false);
  if (!ok) {
    messenger.showSnackBar(
      const SnackBar(content: Text("Couldn't open stockvirtue.com.")),
    );
  }
}

/// Opens a link from a story: other StockVirtue stories in the native
/// reader, everything else in the browser (site-relative links resolved
/// against the website).
Future<void> openStoryLink(BuildContext context, String href) async {
  final nav = Navigator.of(context);
  final messenger = ScaffoldMessenger.of(context);
  final uri = href.startsWith('/')
      ? _site.resolve(href)
      : Uri.tryParse(href);
  if (uri == null) return;
  final sameSite = uri.host == _site.host || uri.host == 'www.${_site.host}';
  final match = sameSite ? _articlePath.firstMatch(uri.path) : null;
  final story =
      match != null && !_sectionPages.contains(match.group(1)) ? match : null;
  if (story != null) {
    nav.push(MaterialPageRoute(
      builder: (_) => NewsReaderScreen(slug: story.group(1)!),
    ));
    return;
  }
  final ok = await launchUrl(
    uri,
    mode: uri.scheme == 'mailto'
        ? LaunchMode.externalApplication
        : LaunchMode.inAppBrowserView,
  ).catchError((_) => false);
  if (!ok) {
    messenger.showSnackBar(
      const SnackBar(content: Text("Couldn't open that link.")),
    );
  }
}

/// Opens a listed company from a story on the app's own stock screen
/// (looked up by symbol, so a story only needs "NSE:INFY").
Future<void> openStoryStock(
  BuildContext context,
  WidgetRef ref,
  String exchange,
  String symbol,
) async {
  final nav = Navigator.of(context);
  final messenger = ScaffoldMessenger.of(context);
  try {
    final hits = await ref
        .read(marketRepositoryProvider)
        .search(symbol, exchange: exchange, limit: 10);
    final wanted = symbol.toUpperCase();
    final hit = hits.where((h) => !h.isIndex).firstWhere(
          (h) =>
              h.symbol.toUpperCase() == wanted ||
              h.tradingsymbol.toUpperCase() == '$wanted-EQ',
        );
    nav.push(MaterialPageRoute(
      builder: (_) => SymbolDetailScreen(
        symbol: hit.symbol,
        tradingsymbol: hit.tradingsymbol,
        symboltoken: hit.symboltoken,
        exchange: hit.exchange,
      ),
    ));
  } catch (_) {
    messenger.showSnackBar(
      SnackBar(content: Text("Couldn't open $symbol right now.")),
    );
  }
}
