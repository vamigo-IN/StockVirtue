import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/company_names.dart';
import '../../core/design/tokens.dart';
import '../../features/home/indices_universe.dart';
import '../fno_badge.dart';
import 'symbol_avatar.dart';

/// A stock's real company logo, with the [SymbolAvatar] monogram as the
/// placeholder and fallback.
///
/// Logos come from the CDN template the backend advertises (see
/// [CompanyDirectory.logoUrlFor]) and sit on a white rounded badge — most are
/// transparent marks drawn for light backgrounds and would vanish on the dark
/// theme otherwise. Indices, commodities, anything the CDN doesn't have
/// (fresh listings), favicon-sized images too small to look sharp and
/// banner-shaped wordmarks that would shrink to a sliver keep the monogram;
/// misses are remembered for the session so scrolling a list never
/// re-requests them.
class StockLogo extends StatelessWidget {
  const StockLogo({
    super.key,
    required this.symbol,
    this.exchange = 'NSE',
    this.size = 40,
  });

  /// Ticker or F&O underlying, e.g. "KOTAKBANK", "RELIANCE".
  final String symbol;
  final String exchange;
  final double size;

  static final Set<String> _missing = <String>{};

  double get _radius => size * 0.3;

  /// Stock options/futures (NFO/BFO) show their underlying's logo; indices,
  /// commodities and currency contracts have none.
  String? get _url {
    if (isCommodityExchange(exchange) || exchange == 'CDS') return null;
    if (isIndexSymbol(symbol)) return null;
    final url = CompanyDirectory.instance.logoUrlFor(symbol);
    if (url == null || _missing.contains(url)) return null;
    return url;
  }

  @override
  Widget build(BuildContext context) {
    final fallback = SymbolAvatar(symbol: symbol, size: size, radius: _radius);
    final url = _url;
    if (url == null) return fallback;
    // Decode at display size — a list of logos stays a few KB each.
    final targetPx = (size * MediaQuery.devicePixelRatioOf(context)).round();
    return SizedBox.square(
      dimension: size,
      child: Image.network(
        url,
        cacheWidth: targetPx,
        filterQuality: FilterQuality.medium,
        // The company name sits next to every logo; and with semantics off
        // the frame builder's child is the bare RawImage we inspect below.
        excludeFromSemantics: true,
        frameBuilder: (context, child, frame, sync) {
          final loaded = sync || frame != null;
          if (loaded && _unsuitable(child, targetPx)) {
            _missing.add(url);
            return fallback;
          }
          final shown = loaded
              ? KeyedSubtree(
                  key: const ValueKey('logo'),
                  child: _badge(context, child),
                )
              : KeyedSubtree(key: const ValueKey('mono'), child: fallback);
          if (sync) return shown;
          return AnimatedSwitcher(duration: AppMotion.fast, child: shown);
        },
        errorBuilder: (_, _, _) {
          _missing.add(url);
          return fallback;
        },
      ),
    );
  }

  /// Images a square badge can't show well: ones needing more than 2×
  /// upscaling (the CDN serves 16 px favicons for some small caps) and
  /// wide wordmarks (HDFC Bank's is 6:1) that would be unreadably thin.
  static bool _unsuitable(Widget child, int targetPx) {
    final image = child is RawImage ? child.image : null;
    if (image == null) return false;
    final long = math.max(image.width, image.height);
    final short = math.max(1, math.min(image.width, image.height));
    return long * 2 < targetPx || long / short > 2.5;
  }

  Widget _badge(BuildContext context, Widget image) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.1),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(_radius),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.12)
              : context.market.cardBorder,
        ),
      ),
      child: FittedBox(fit: BoxFit.contain, child: image),
    );
  }
}
