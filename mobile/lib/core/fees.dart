/// Mirrors the backend `computeFees` (segment-aware, Zerodha-style rates).
/// Used for the client-side preview in the trade sheet; the authoritative
/// number always comes from the server response.
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

enum FeeSegment { equity, futures, options, commodityFutures, commodityOptions }

/// Segment from exchange + contract symbol, exactly like the backend:
/// CE/PE-suffixed contracts are options, other derivatives are futures.
FeeSegment feeSegmentFor(String exchange, String tradingsymbol) {
  final sym = tradingsymbol.toUpperCase();
  final isOption = sym.endsWith('CE') || sym.endsWith('PE');
  if (exchange == 'MCX' || exchange == 'NCO') {
    return isOption ? FeeSegment.commodityOptions : FeeSegment.commodityFutures;
  }
  if (exchange == 'NFO' || exchange == 'BFO' || exchange == 'CDS') {
    return isOption ? FeeSegment.options : FeeSegment.futures;
  }
  return FeeSegment.equity;
}

FeeBreakdown estimateFees({
  required String side, // 'BUY' or 'SELL'
  required String exchange,
  required double notional,
  bool intraday = false,
  FeeSegment segment = FeeSegment.equity,
}) {
  final isBuy = side == 'BUY';
  final sebi = notional * 0.000001; // ₹10 / crore
  double brokerage;
  double stt;
  double exchangeCharge;
  double stampDuty;
  switch (segment) {
    case FeeSegment.futures:
      brokerage = (notional * 0.0003).clamp(0, 20).toDouble();
      stt = isBuy ? 0 : notional * 0.0005; // 0.05% (from 1 Apr 2026)
      exchangeCharge = exchange == 'BFO' ? 0 : notional * 0.0000173;
      stampDuty = isBuy ? notional * 0.00002 : 0;
    case FeeSegment.options:
      brokerage = notional.clamp(0, 20).toDouble();
      stt = isBuy ? 0 : notional * 0.0015; // 0.15% of premium
      exchangeCharge =
          exchange == 'BFO' ? notional * 0.000325 : notional * 0.0003503;
      stampDuty = isBuy ? notional * 0.00003 : 0;
    case FeeSegment.commodityFutures:
      brokerage = (notional * 0.0003).clamp(0, 20).toDouble();
      stt = isBuy ? 0 : notional * 0.0001; // CTT 0.01%
      exchangeCharge = notional * 0.000021;
      stampDuty = isBuy ? notional * 0.00002 : 0;
    case FeeSegment.commodityOptions:
      brokerage = notional.clamp(0, 20).toDouble();
      stt = isBuy ? 0 : notional * 0.0005; // CTT 0.05%
      exchangeCharge = notional * 0.000418;
      stampDuty = isBuy ? notional * 0.00003 : 0;
    case FeeSegment.equity:
      final exchangeRate = exchange == 'BSE' ? 0.0000375 : 0.0000297;
      exchangeCharge = notional * exchangeRate;
      if (intraday) {
        brokerage = (notional * 0.0003).clamp(0, 20).toDouble();
        stt = isBuy ? 0 : notional * 0.00025;
        stampDuty = isBuy ? notional * 0.00003 : 0;
      } else {
        brokerage = 0;
        stt = notional * 0.001;
        stampDuty = isBuy ? notional * 0.00015 : 0;
      }
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
