import 'package:flutter/material.dart';

import '../../core/company_names.dart';

/// Round monogram "logo" for a stock, index or contract — the same symbol
/// always gets the same hue, so lists read like a real broker's (Groww /
/// Kite style) without shipping thousands of logo images.
class SymbolAvatar extends StatelessWidget {
  const SymbolAvatar({
    super.key,
    required this.symbol,
    this.size = 40,
    this.label,
    this.radius,
  });

  /// Ticker or underlying, e.g. "KOTAKBANK", "NIFTY", "GOLDM".
  final String symbol;
  final double size;

  /// Overrides the derived initials (e.g. "₹" for cash, "IPO").
  final String? label;

  /// Corner radius for a rounded square; null draws a circle. [StockLogo]
  /// passes its badge radius so the fallback matches a real logo's shape.
  final double? radius;

  static const _hues = <double>[
    152, 199, 221, 262, 291, 330, 12, 28, 43, 168, 186, 238,
  ];

  /// Up to two initials from the company name ("Kotak Mahindra Bank" → "KM").
  static String initialsFor(String symbol) {
    final name = companyNameFor(symbol);
    final words = name
        .replaceAll(RegExp(r'[^A-Za-z0-9 &]'), ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && w != '&' && w.toLowerCase() != 'the')
        .toList();
    if (words.isEmpty) return symbol.isEmpty ? '?' : symbol[0];
    if (words.length == 1) {
      final w = words.first;
      return w.length >= 2 ? w.substring(0, 2).toUpperCase() : w.toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    var hash = 0;
    for (final c in symbol.codeUnits) {
      hash = (hash * 31 + c) & 0x7fffffff;
    }
    final hue = _hues[hash % _hues.length];
    final base = HSLColor.fromAHSL(1, hue, 0.62, isDark ? 0.36 : 0.46);
    final top = base.withLightness((base.lightness + 0.10).clamp(0, 1));
    final text = label ?? initialsFor(symbol);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: radius == null ? BoxShape.circle : BoxShape.rectangle,
        borderRadius: radius == null ? null : BorderRadius.circular(radius!),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [top.toColor(), base.toColor()],
        ),
        border: Border.all(
          color: Colors.white.withValues(alpha: isDark ? 0.08 : 0.25),
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        text,
        maxLines: 1,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w800,
          fontSize: size * (text.length > 2 ? 0.28 : 0.36),
          letterSpacing: -0.3,
          height: 1,
        ),
      ),
    );
  }
}
