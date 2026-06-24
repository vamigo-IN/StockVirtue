/// Mirrors the backend `computeFees`. Used for the client-side preview in the
/// trade sheet; the authoritative number always comes from the server response.
class FeeBreakdown {
  final double brokerage;
  final double stt;
  final double exchange;
  final double sebi;
  final double stampDuty;
  final double gst;
  final double total;

  const FeeBreakdown({
    required this.brokerage,
    required this.stt,
    required this.exchange,
    required this.sebi,
    required this.stampDuty,
    required this.gst,
    required this.total,
  });
}

FeeBreakdown estimateFees({
  required String side, // 'BUY' or 'SELL'
  required String exchange,
  required double notional,
  bool intraday = false,
}) {
  final exchangeRate = exchange == 'BSE' ? 0.0000375 : 0.0000297;
  final exchangeCharge = notional * exchangeRate;
  final sebi = notional * 0.000001;

  double brokerage;
  double stt;
  double stampDuty;
  if (intraday) {
    brokerage = (notional * 0.0003).clamp(0, 20).toDouble();
    stt = side == 'SELL' ? notional * 0.00025 : 0;
    stampDuty = side == 'BUY' ? notional * 0.00003 : 0;
  } else {
    brokerage = 0;
    stt = notional * 0.001;
    stampDuty = side == 'BUY' ? notional * 0.00015 : 0;
  }
  final gstBase = brokerage + exchangeCharge + sebi;
  final gst = gstBase * 0.18;
  final total = brokerage + stt + exchangeCharge + sebi + stampDuty + gst;
  return FeeBreakdown(
    brokerage: brokerage,
    stt: stt,
    exchange: exchangeCharge,
    sebi: sebi,
    stampDuty: stampDuty,
    gst: gst,
    total: total,
  );
}
