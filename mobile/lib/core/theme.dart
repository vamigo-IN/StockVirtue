import 'package:animations/animations.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'design/tokens.dart';

/// StockVirtue's visual system: Inter with tabular figures (prices line up
/// in columns), a deep-ink dark palette with an emerald brand accent, soft
/// 1px-bordered surfaces instead of drop shadows, and Material-motion page
/// transitions. Every Material component is themed here so screens inherit
/// the look without per-widget styling.

const _fontFamily = 'Inter';
const _tabular = [FontFeature.tabularFigures()];

ThemeData buildDarkTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF34D399),
    onPrimary: Color(0xFF02281B),
    primaryContainer: Color(0xFF0D3B2B),
    onPrimaryContainer: Color(0xFFA7F3D0),
    secondary: Color(0xFF8EA2FF),
    onSecondary: Color(0xFF0B1338),
    secondaryContainer: Color(0xFF1B2450),
    onSecondaryContainer: Color(0xFFDDE3FF),
    tertiary: Color(0xFFF5B547),
    onTertiary: Color(0xFF2A1A00),
    tertiaryContainer: Color(0xFF3D2A07),
    onTertiaryContainer: Color(0xFFFFDDA6),
    error: Color(0xFFFF6B6B),
    onError: Color(0xFF2D0505),
    errorContainer: Color(0xFF3A1214),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: Color(0xFF0E131A),
    onSurface: Color(0xFFE8EDF4),
    onSurfaceVariant: Color(0xFF97A1B2),
    surfaceDim: Color(0xFF070A0F),
    surfaceBright: Color(0xFF242D3A),
    surfaceContainerLowest: Color(0xFF080B10),
    surfaceContainerLow: Color(0xFF0C1016),
    surfaceContainer: Color(0xFF121821),
    surfaceContainerHigh: Color(0xFF18202B),
    surfaceContainerHighest: Color(0xFF202A37),
    outline: Color(0xFF2E3948),
    outlineVariant: Color(0xFF1E2733),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFFE8EDF4),
    onInverseSurface: Color(0xFF121821),
    inversePrimary: Color(0xFF087A52),
    surfaceTint: Colors.transparent,
  );
  return _build(scheme, MarketColors.dark, const Color(0xFF070A0F));
}

ThemeData buildLightTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF079455),
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: Color(0xFFD1FADF),
    onPrimaryContainer: Color(0xFF054F31),
    secondary: Color(0xFF444CE7),
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: Color(0xFFE0EAFF),
    onSecondaryContainer: Color(0xFF2D31A6),
    tertiary: Color(0xFFB54708),
    onTertiary: Color(0xFFFFFFFF),
    tertiaryContainer: Color(0xFFFEF0C7),
    onTertiaryContainer: Color(0xFF7A2E0E),
    error: Color(0xFFD92D20),
    onError: Color(0xFFFFFFFF),
    errorContainer: Color(0xFFFEE4E2),
    onErrorContainer: Color(0xFF7A271A),
    surface: Color(0xFFFFFFFF),
    onSurface: Color(0xFF101828),
    onSurfaceVariant: Color(0xFF475467),
    surfaceDim: Color(0xFFEAECF0),
    surfaceBright: Color(0xFFFFFFFF),
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFF9FAFB),
    surfaceContainer: Color(0xFFF2F4F7),
    surfaceContainerHigh: Color(0xFFEAECF0),
    surfaceContainerHighest: Color(0xFFE4E7EC),
    outline: Color(0xFFD0D5DD),
    outlineVariant: Color(0xFFE4E7EC),
    shadow: Color(0xFF101828),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFF101828),
    onInverseSurface: Color(0xFFF2F4F7),
    inversePrimary: Color(0xFF6CE9A6),
    surfaceTint: Colors.transparent,
  );
  return _build(scheme, MarketColors.light, const Color(0xFFF5F7FA));
}

/// Back-compat alias for the old default theme name.
ThemeData buildStockVirtueTheme() => buildDarkTheme();

TextTheme _textTheme(ColorScheme scheme) {
  TextStyle s(
    double size,
    FontWeight weight, {
    double spacing = 0,
    double? height,
    Color? color,
  }) =>
      TextStyle(
        fontFamily: _fontFamily,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: spacing,
        height: height,
        color: color ?? scheme.onSurface,
        fontFeatures: _tabular,
      );
  return TextTheme(
    displayLarge: s(44, FontWeight.w800, spacing: -1.4),
    displayMedium: s(38, FontWeight.w800, spacing: -1.2),
    displaySmall: s(32, FontWeight.w800, spacing: -0.9),
    headlineLarge: s(28, FontWeight.w800, spacing: -0.7),
    headlineMedium: s(24, FontWeight.w800, spacing: -0.5),
    headlineSmall: s(20, FontWeight.w700, spacing: -0.35),
    titleLarge: s(18, FontWeight.w700, spacing: -0.2),
    titleMedium: s(15.5, FontWeight.w600, spacing: -0.1),
    titleSmall: s(14, FontWeight.w600),
    bodyLarge: s(15.5, FontWeight.w400, height: 1.45),
    bodyMedium: s(14, FontWeight.w400, height: 1.45),
    bodySmall: s(12.5, FontWeight.w400, height: 1.4, color: scheme.onSurfaceVariant),
    labelLarge: s(14, FontWeight.w600, spacing: 0.1),
    labelMedium: s(12.5, FontWeight.w600, spacing: 0.15),
    labelSmall: s(11, FontWeight.w600, spacing: 0.4),
  );
}

ThemeData _build(ColorScheme scheme, MarketColors market, Color background) {
  final text = _textTheme(scheme);
  final isDark = scheme.brightness == Brightness.dark;
  final roundedMd = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(AppRadius.md),
  );
  final buttonShape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(14),
  );
  final buttonText = text.labelLarge!.copyWith(
    fontSize: 15,
    fontWeight: FontWeight.w700,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: scheme.brightness,
    colorScheme: scheme,
    fontFamily: _fontFamily,
    textTheme: text,
    primaryTextTheme: text,
    scaffoldBackgroundColor: background,
    canvasColor: background,
    splashFactory: InkSparkle.splashFactory,
    visualDensity: VisualDensity.standard,
    extensions: [market],
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: SharedAxisPageTransitionsBuilder(
          transitionType: SharedAxisTransitionType.horizontal,
        ),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
        TargetPlatform.windows: SharedAxisPageTransitionsBuilder(
          transitionType: SharedAxisTransitionType.horizontal,
        ),
        TargetPlatform.linux: SharedAxisPageTransitionsBuilder(
          transitionType: SharedAxisTransitionType.horizontal,
        ),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: background,
      foregroundColor: scheme.onSurface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleSpacing: 16,
      titleTextStyle: text.titleLarge,
      systemOverlayStyle: isDark
          ? SystemUiOverlayStyle.light.copyWith(
              statusBarColor: Colors.transparent,
            )
          : SystemUiOverlayStyle.dark.copyWith(
              statusBarColor: Colors.transparent,
            ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: BorderSide(color: market.cardBorder),
      ),
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      iconColor: scheme.onSurfaceVariant,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      titleTextStyle: text.titleSmall,
      subtitleTextStyle: text.bodySmall,
      shape: roundedMd,
    ),
    navigationBarTheme: NavigationBarThemeData(
      height: 68,
      elevation: 0,
      backgroundColor: isDark ? const Color(0xFF0B0F15) : scheme.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: scheme.primaryContainer,
      indicatorShape: const StadiumBorder(),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => text.labelMedium!.copyWith(
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w700
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? scheme.onSurface
              : scheme.onSurfaceVariant,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected)
              ? scheme.onPrimaryContainer
              : scheme.onSurfaceVariant,
        ),
      ),
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: scheme.onSurface,
      unselectedLabelColor: scheme.onSurfaceVariant,
      labelStyle: text.labelLarge!.copyWith(fontWeight: FontWeight.w700),
      unselectedLabelStyle: text.labelLarge,
      indicatorSize: TabBarIndicatorSize.label,
      dividerColor: scheme.outlineVariant,
      indicator: UnderlineTabIndicator(
        borderRadius: BorderRadius.circular(3),
        borderSide: BorderSide(color: scheme.primary, width: 3),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainer,
      selectedColor: scheme.primaryContainer,
      disabledColor: scheme.surfaceContainerLow,
      side: BorderSide(color: scheme.outlineVariant),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      labelStyle: text.labelLarge!.copyWith(fontSize: 13),
      secondaryLabelStyle: text.labelLarge!.copyWith(
        fontSize: 13,
        color: scheme.onPrimaryContainer,
      ),
      checkmarkColor: scheme.onPrimaryContainer,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      showCheckmark: false,
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
          ),
        ),
        textStyle: WidgetStatePropertyAll(text.labelLarge),
        side: WidgetStatePropertyAll(BorderSide(color: scheme.outlineVariant)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainer,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: text.bodyMedium!.copyWith(color: scheme.onSurfaceVariant),
      labelStyle: text.bodyMedium!.copyWith(color: scheme.onSurfaceVariant),
      floatingLabelStyle: text.labelMedium!.copyWith(color: scheme.primary),
      prefixIconColor: scheme.onSurfaceVariant,
      suffixIconColor: scheme.onSurfaceVariant,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error, width: 1.6),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(64, 52),
        shape: buttonShape,
        textStyle: buttonText,
        elevation: 0,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: buttonShape,
        textStyle: buttonText,
        elevation: 0,
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(64, 52),
        shape: buttonShape,
        textStyle: buttonText,
        side: BorderSide(color: scheme.outline),
        foregroundColor: scheme.onSurface,
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        textStyle: text.labelLarge!.copyWith(fontWeight: FontWeight.w700),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      elevation: 0,
      focusElevation: 0,
      hoverElevation: 0,
      highlightElevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
      ),
      extendedTextStyle: buttonText,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: scheme.surface,
      modalBackgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      modalElevation: 0,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
      dragHandleColor: scheme.outline,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.xl),
      ),
      titleTextStyle: text.titleLarge,
      contentTextStyle: text.bodyMedium!.copyWith(
        color: scheme.onSurfaceVariant,
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      elevation: 0,
      backgroundColor: scheme.inverseSurface,
      contentTextStyle: text.labelLarge!.copyWith(
        color: scheme.onInverseSurface,
      ),
      actionTextColor: scheme.inversePrimary,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: scheme.surfaceContainerHigh,
      surfaceTintColor: Colors.transparent,
      elevation: 6,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      textStyle: text.bodyMedium,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: scheme.inverseSurface,
        borderRadius: BorderRadius.circular(AppRadius.xs),
      ),
      textStyle: text.labelMedium!.copyWith(color: scheme.onInverseSurface),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected)
            ? scheme.onPrimary
            : scheme.onSurfaceVariant,
      ),
      trackColor: WidgetStateProperty.resolveWith(
        (s) => s.contains(WidgetState.selected)
            ? scheme.primary
            : scheme.surfaceContainerHighest,
      ),
      trackOutlineColor: const WidgetStatePropertyAll(Colors.transparent),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: scheme.primary,
      linearTrackColor: scheme.surfaceContainerHighest,
      circularTrackColor: Colors.transparent,
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: scheme.primary,
      inactiveTrackColor: scheme.surfaceContainerHighest,
      thumbColor: scheme.primary,
    ),
    badgeTheme: BadgeThemeData(
      backgroundColor: scheme.error,
      textColor: scheme.onError,
    ),
    drawerTheme: DrawerThemeData(
      backgroundColor: scheme.surface,
      surfaceTintColor: Colors.transparent,
    ),
    expansionTileTheme: ExpansionTileThemeData(
      shape: roundedMd,
      collapsedShape: roundedMd,
      iconColor: scheme.onSurfaceVariant,
      collapsedIconColor: scheme.onSurfaceVariant,
    ),
  );
}
