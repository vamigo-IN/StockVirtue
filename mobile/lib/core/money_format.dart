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
