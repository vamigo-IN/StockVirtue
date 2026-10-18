import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/design/tokens.dart';
import '../../core/money_format.dart';

/// ▲ 1.24% / ▼ 0.82% pill in the theme's gain/loss colours.
class ChangePill extends StatelessWidget {
  const ChangePill({
    super.key,
    required this.percent,
    this.absolute,
    this.compact = false,
    this.solid = false,
  });

  final double? percent;

  /// Optional ₹ change shown before the percentage ("+12.40 (+0.82%)").
  final double? absolute;
  final bool compact;

  /// Solid fill (white text) for use on photos / gradients.
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final m = context.market;
    final p = percent;
    if (p == null || p.isNaN) {
      return Text('—', style: TextStyle(color: Theme.of(context).hintColor));
    }
    final up = p >= 0;
    final color = up ? m.up : m.down;
    final abs = absolute;
    final sign = up ? '+' : '-';
    final text = abs != null
        ? '$sign${formatInrPlain(abs.abs())} ($sign${p.abs().toStringAsFixed(2)}%)'
        : '${p.abs().toStringAsFixed(2)}%';
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 6 : 8,
        vertical: compact ? 2 : 4,
      ),
      decoration: BoxDecoration(
        color: solid ? color : (up ? m.upSoft : m.downSoft),
        borderRadius: BorderRadius.circular(AppRadius.xs),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            up ? Icons.arrow_drop_up_rounded : Icons.arrow_drop_down_rounded,
            size: compact ? 16 : 18,
            color: solid ? Colors.white : color,
          ),
          Text(
            text,
            style: TextStyle(
              color: solid ? Colors.white : color,
              fontWeight: FontWeight.w700,
              fontSize: compact ? 11.5 : 12.5,
              height: 1.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// The day's move the way brokers print it — "+12.40 (+0.96%)": points
/// first, percentage beside, in the theme's gain/loss colour (neutral when
/// unchanged). Renders "—" until both numbers are known.
class DayChange extends StatelessWidget {
  const DayChange({
    super.key,
    required this.change,
    required this.percent,
    this.style,
  });

  final double? change;
  final double? percent;

  /// Base style; colour and weight are applied on top.
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final base = style ?? theme.textTheme.labelMedium ?? const TextStyle();
    final c = change;
    final p = percent;
    if (c == null || p == null || c.isNaN || p.isNaN) {
      return Text('—', style: base.copyWith(color: theme.hintColor));
    }
    final m = context.market;
    final color = c == 0
        ? theme.colorScheme.onSurfaceVariant
        : (c > 0 ? m.up : m.down);
    final sign = c > 0 ? '+' : (c < 0 ? '-' : '');
    return Text(
      '$sign${formatInrPlain(c.abs())} ($sign${p.abs().toStringAsFixed(2)}%)',
      maxLines: 1,
      softWrap: false,
      style: base.copyWith(
        color: color,
        fontWeight: FontWeight.w700,
        fontFeatures: const [FontFeature.tabularFigures()],
      ),
    );
  }
}

/// Section title with an optional trailing action ("See all").
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.leading,
    this.padding = const EdgeInsets.fromLTRB(16, 20, 8, 10),
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? leading;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 10)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: t.titleLarge),
                if (subtitle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(subtitle!, style: t.bodySmall),
                  ),
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            TextButton(
              onPressed: onAction,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(actionLabel!),
                  const SizedBox(width: 2),
                  const Icon(Icons.chevron_right_rounded, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Bordered surface card — the basic building block of every screen.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpace.md),
    this.onTap,
    this.color,
    this.gradient,
    this.radius = AppRadius.lg,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Gradient? gradient;
  final double radius;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: BorderSide(color: borderColor ?? context.market.cardBorder),
    );
    return Material(
      color: gradient == null ? (color ?? scheme.surface) : Colors.transparent,
      shape: shape,
      clipBehavior: Clip.antiAlias,
      child: Ink(
        decoration: gradient == null ? null : BoxDecoration(gradient: gradient),
        child: InkWell(
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

enum BannerTone { info, success, warning, danger }

/// Small tinted explainer ("Returns exclude referral bonuses", margin notes).
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.message,
    this.title,
    this.icon,
    this.tone = BannerTone.info,
  });

  final String message;
  final String? title;
  final IconData? icon;
  final BannerTone tone;

  @override
  Widget build(BuildContext context) {
    final m = context.market;
    final color = switch (tone) {
      BannerTone.info => m.info,
      BannerTone.success => m.up,
      BannerTone.warning => m.warning,
      BannerTone.danger => m.down,
    };
    final t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon ?? Icons.info_outline_rounded, size: 18, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2),
                    child: Text(
                      title!,
                      style: t.labelLarge?.copyWith(color: color),
                    ),
                  ),
                Text(message, style: t.bodySmall?.copyWith(height: 1.45)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact label/value pair used in stat grids ("Margin / ₹1.44L").
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.crossAxisAlignment = CrossAxisAlignment.start,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: crossAxisAlignment,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label, style: t.bodySmall),
        const SizedBox(height: 3),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: t.titleSmall?.copyWith(
            fontWeight: FontWeight.w700,
            color: valueColor,
          ),
        ),
      ],
    );
  }
}

/// Tiny trend line for cards (index tiles, portfolio hero). Paints nothing
/// for fewer than two points.
class Sparkline extends StatelessWidget {
  const Sparkline({
    super.key,
    required this.values,
    this.color,
    this.strokeWidth = 1.6,
    this.fill = true,
  });

  final List<double> values;
  final Color? color;
  final double strokeWidth;
  final bool fill;

  @override
  Widget build(BuildContext context) {
    final c = color ??
        context.market.changeColor(
          values.length >= 2 ? values.last - values.first : 0,
        );
    return CustomPaint(
      painter: _SparkPainter(values, c, strokeWidth, fill),
      size: Size.infinite,
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(this.values, this.color, this.strokeWidth, this.fill);
  final List<double> values;
  final Color color;
  final double strokeWidth;
  final bool fill;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2 || size.isEmpty) return;
    final lo = values.reduce(math.min);
    final hi = values.reduce(math.max);
    final span = (hi - lo).abs() < 1e-9 ? 1.0 : hi - lo;
    final dx = size.width / (values.length - 1);
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = i * dx;
      final y = size.height - ((values[i] - lo) / span) * size.height;
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }
    if (fill) {
      final area = Path.from(path)
        ..lineTo(size.width, size.height)
        ..lineTo(0, size.height)
        ..close();
      canvas.drawPath(
        area,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.28), color.withValues(alpha: 0)],
          ).createShader(Offset.zero & size),
      );
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeJoin = StrokeJoin.round
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter old) =>
      old.values != values || old.color != color;
}
