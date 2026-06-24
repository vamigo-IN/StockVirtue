import 'package:flutter/material.dart';

/// Wraps a price [Text] (or any inline LTP widget) and tints its background
/// briefly whenever [price] changes — green when up, red when down. This is
/// the Groww-style "live ticking" cue used across home cards, the option
/// chain, and any other place where a number updates from a websocket feed.
///
/// The flash auto-decays over [duration]. We don't animate the value itself
/// — only the background colour — so this composes cleanly with whatever
/// styled text the caller already has.
class PriceFlash extends StatefulWidget {
  const PriceFlash({
    super.key,
    required this.price,
    required this.child,
    this.duration = const Duration(milliseconds: 600),
    this.borderRadius = const BorderRadius.all(Radius.circular(4)),
    this.padding = const EdgeInsets.symmetric(horizontal: 3, vertical: 1),
  });

  /// Current price. The first non-null value seeds the comparison baseline
  /// and does *not* flash. Subsequent changes flash up (green) or down (red).
  final double? price;
  final Widget child;
  final Duration duration;
  final BorderRadius borderRadius;
  final EdgeInsets padding;

  @override
  State<PriceFlash> createState() => _PriceFlashState();
}

class _PriceFlashState extends State<PriceFlash>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl =
      AnimationController(vsync: this, duration: widget.duration);
  double? _last;
  Color? _flashColor;

  @override
  void initState() {
    super.initState();
    _last = widget.price;
  }

  @override
  void didUpdateWidget(covariant PriceFlash old) {
    super.didUpdateWidget(old);
    final next = widget.price;
    if (next == null) {
      _last = null;
      return;
    }
    if (_last == null) {
      _last = next;
      return;
    }
    if (next == _last) return;
    _flashColor = next > _last!
        ? const Color(0xFF22C55E)
        : const Color(0xFFEF4444);
    _last = next;
    _ctrl.forward(from: 0);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, child) {
        // Quick rise (40 ms), slow fade. Peak alpha 0.28, decays to 0.
        final t = _ctrl.value;
        final alpha = t < 0.07 ? (t / 0.07) * 0.28 : (1 - t) * 0.28;
        final color = _flashColor;
        return Container(
          padding: widget.padding,
          decoration: BoxDecoration(
            color: color == null || alpha <= 0
                ? Colors.transparent
                : color.withValues(alpha: alpha),
            borderRadius: widget.borderRadius,
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}
