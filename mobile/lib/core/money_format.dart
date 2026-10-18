/// Indian rupee formatting — `₹12,34,567.89` Indian grouping (last 3 digits,
/// then pairs). Honest and exact at every scale.
library;

String formatInr(
  double v, {
  int decimals = 2,
  bool sign = false,
}) {
  return _full(v, decimals: decimals, sign: sign);
}

/// Compact Indian notation for big figures on cards: ₹1.64 Cr, ₹16.35 L,
/// ₹48.2K. Small values fall back to the exact [formatInr].
String formatInrCompact(double v, {bool sign = false}) {
  final neg = v < 0;
  final a = v.abs();
  final prefix = neg ? '-' : (sign ? '+' : '');
  String trim(double n, int d) {
    var s = n.toStringAsFixed(d);
    if (s.contains('.')) {
      s = s.replaceFirst(RegExp(r'0+$'), '').replaceFirst(RegExp(r'\.$'), '');
    }
    return s;
  }
  if (a >= 1e7) return '$prefix₹${trim(a / 1e7, 2)} Cr';
  if (a >= 1e5) return '$prefix₹${trim(a / 1e5, 2)} L';
  if (a >= 1e4) return '$prefix₹${trim(a / 1e3, 1)}K';
  return formatInr(v, sign: sign, decimals: a >= 1000 ? 0 : 2);
}

/// Like [formatInr] but without the rupee glyph — for compact tables.
String formatInrPlain(double v, {int decimals = 2}) {
  final s = formatInr(v, decimals: decimals);
  return s.replaceFirst('₹', '');
}

String _full(double v, {required int decimals, required bool sign}) {
  final neg = v < 0;
  final fixed = v.abs().toStringAsFixed(decimals);
  final dot = fixed.indexOf('.');
  final intStr = dot >= 0 ? fixed.substring(0, dot) : fixed;
  final fracStr = dot >= 0 ? fixed.substring(dot) : '';

  String grouped;
  if (intStr.length <= 3) {
    grouped = intStr;
  } else {
    final last3 = intStr.substring(intStr.length - 3);
    var rest = intStr.substring(0, intStr.length - 3);
    final groups = <String>[last3];
    while (rest.length > 2) {
      groups.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) groups.insert(0, rest);
    grouped = groups.join(',');
  }

  final prefix = neg ? '-' : (sign ? '+' : '');
  return '$prefix₹$grouped$fracStr';
}
