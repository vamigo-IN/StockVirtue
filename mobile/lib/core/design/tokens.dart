import 'package:flutter/material.dart';

/// StockVirtue design tokens — one source of truth for spacing, radii,
/// motion and the market (gain/loss) palette, so screens stop hard-coding
/// their own greens and paddings.

abstract final class AppRadius {
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 28;
  static const double pill = 999;
}

abstract final class AppSpace {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
}

abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 160);
  static const Duration medium = Duration(milliseconds: 280);
  static const Duration slow = Duration(milliseconds: 450);
  static const Curve emphasized = Curves.easeOutCubic;
}

/// Market semantics layered on top of the Material colour scheme: gains,
/// losses and the accent hues used for segments (F&O, commodities, IPOs).
@immutable
class MarketColors extends ThemeExtension<MarketColors> {
  const MarketColors({
    required this.up,
    required this.down,
    required this.upSoft,
    required this.downSoft,
    required this.warning,
    required this.info,
    required this.gold,
    required this.violet,
    required this.heroGradient,
    required this.cardBorder,
  });

  final Color up;
  final Color down;

  /// Tinted backgrounds for gain/loss pills.
  final Color upSoft;
  final Color downSoft;
  final Color warning;
  final Color info;
  final Color gold;
  final Color violet;

  /// Brand gradient for hero surfaces (portfolio card, IPO banner).
  final List<Color> heroGradient;
  final Color cardBorder;

  Color changeColor(num? value) =>
      (value ?? 0) >= 0 ? up : down;

  Color changeSoft(num? value) =>
      (value ?? 0) >= 0 ? upSoft : downSoft;

  static const dark = MarketColors(
    up: Color(0xFF2BD67B),
    down: Color(0xFFFF5C5C),
    upSoft: Color(0x1F2BD67B),
    downSoft: Color(0x1FFF5C5C),
    warning: Color(0xFFF5B547),
    info: Color(0xFF5EA8FF),
    gold: Color(0xFFE9B949),
    violet: Color(0xFF9B8CFF),
    heroGradient: [Color(0xFF0E3B2C), Color(0xFF0B1F2A), Color(0xFF101626)],
    cardBorder: Color(0xFF1E2733),
  );

  static const light = MarketColors(
    up: Color(0xFF079455),
    down: Color(0xFFD92D20),
    upSoft: Color(0x1A079455),
    downSoft: Color(0x1AD92D20),
    warning: Color(0xFFDC6803),
    info: Color(0xFF1570EF),
    gold: Color(0xFFB54708),
    violet: Color(0xFF6938EF),
    heroGradient: [Color(0xFF079455), Color(0xFF087443), Color(0xFF0B4D3B)],
    cardBorder: Color(0xFFE4E7EC),
  );

  @override
  MarketColors copyWith({
    Color? up,
    Color? down,
    Color? upSoft,
    Color? downSoft,
    Color? warning,
    Color? info,
    Color? gold,
    Color? violet,
    List<Color>? heroGradient,
    Color? cardBorder,
  }) {
    return MarketColors(
      up: up ?? this.up,
      down: down ?? this.down,
      upSoft: upSoft ?? this.upSoft,
      downSoft: downSoft ?? this.downSoft,
      warning: warning ?? this.warning,
      info: info ?? this.info,
      gold: gold ?? this.gold,
      violet: violet ?? this.violet,
      heroGradient: heroGradient ?? this.heroGradient,
      cardBorder: cardBorder ?? this.cardBorder,
    );
  }

  @override
  MarketColors lerp(ThemeExtension<MarketColors>? other, double t) {
    if (other is! MarketColors) return this;
    return MarketColors(
      up: Color.lerp(up, other.up, t)!,
      down: Color.lerp(down, other.down, t)!,
      upSoft: Color.lerp(upSoft, other.upSoft, t)!,
      downSoft: Color.lerp(downSoft, other.downSoft, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      info: Color.lerp(info, other.info, t)!,
      gold: Color.lerp(gold, other.gold, t)!,
      violet: Color.lerp(violet, other.violet, t)!,
      heroGradient: [
        for (var i = 0; i < heroGradient.length; i++)
          Color.lerp(
            heroGradient[i],
            other.heroGradient[i.clamp(0, other.heroGradient.length - 1)],
            t,
          )!,
      ],
      cardBorder: Color.lerp(cardBorder, other.cardBorder, t)!,
    );
  }
}

extension MarketColorsX on BuildContext {
  /// `context.market.up` — the theme-aware gain colour, etc.
  MarketColors get market =>
      Theme.of(this).extension<MarketColors>() ?? MarketColors.dark;
}
