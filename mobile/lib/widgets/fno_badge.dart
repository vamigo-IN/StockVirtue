import 'package:flutter/material.dart';

const _callColor = Color(0xFF22C55E);
const _putColor = Color(0xFFEF4444);
const _futColor = Color(0xFF8B5CF6);

/// True for the derivatives exchanges (options + futures).
bool isFnoExchange(String exchange) => exchange == 'NFO' || exchange == 'BFO';

/// Option/future kind parsed from an F&O tradingsymbol suffix, with the
/// colour to render its badge in. Null for anything that isn't an option or
/// future (e.g. cash equity or a malformed symbol).
({String label, Color color})? fnoKind(String tradingsymbol) {
  final s = tradingsymbol.toUpperCase();
  if (s.endsWith('CE')) return (label: 'CALL', color: _callColor);
  if (s.endsWith('PE')) return (label: 'PUT', color: _putColor);
  if (s.endsWith('FUT')) return (label: 'FUT', color: _futColor);
  return null;
}

/// Small colour-coded CALL / PUT / FUT pill shown beside an F&O contract so a
/// holding or order reads clearly at a glance.
class FnoBadge extends StatelessWidget {
  const FnoBadge({super.key, required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
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
