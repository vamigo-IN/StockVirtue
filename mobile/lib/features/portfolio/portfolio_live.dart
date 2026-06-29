import '../../data/models/portfolio.dart';
import '../../data/models/tick.dart';
import '../ticks/ticks_service.dart';

/// Tick-map key for a position (`${exchange}:${symboltoken}` — matches
/// [Tick.key]). Token-based, so it's correct for both cash and F&O.
String tickKeyForPosition(PortfolioPosition p) =>
    '${p.exchange}:${p.symboltoken}';

/// Live-feed subscription for a holding. F&O contracts must be addressed by
/// their `tradingsymbol` — the underlying name (e.g. "NIFTY") doesn't resolve
/// on NFO/BFO, only the individual contract does. Cash equity uses its plain
/// symbol. Either way the streamed tick is keyed by exchange:token, so it
/// matches [tickKeyForPosition].
TickSubscription subForPosition(PortfolioPosition p) {
  final isFno = p.exchange == 'NFO' || p.exchange == 'BFO';
  return TickSubscription(
    symbol: isFno ? p.tradingsymbol : p.symbol,
    exchange: p.exchange,
  );
}

/// A position's values overlaid with the latest live LTP (when present);
/// current value and unrealised P&L are recomputed so the holding moves
/// continuously while the market is open, without re-hitting the API.
class LivePosition {
  final double? ltp;
  final double currentValue;
  final double unrealizedPnL;
  final double unrealizedPnLPct;
  const LivePosition(
    this.ltp,
    this.currentValue,
    this.unrealizedPnL,
    this.unrealizedPnLPct,
  );

  factory LivePosition.of(PortfolioPosition p, double? liveLtp) {
    final ltp = liveLtp ?? p.ltp;
    if (ltp == null) {
      return LivePosition(
        null,
        p.currentValue,
        p.unrealizedPnL,
        p.unrealizedPnLPct,
      );
    }
    final absQty = p.quantity.abs();
    final invested = p.invested;
    final currentAbs = ltp * absQty;
    final isShort = p.quantity < 0;
    final pnl = isShort ? invested - currentAbs : currentAbs - invested;
    final pct = invested > 0 ? (pnl / invested) * 100 : 0.0;
    return LivePosition(ltp, currentAbs, pnl, pct);
  }
}

/// Live-overlaid totals for the equity hero / home strip. Cost basis
/// (invested) doesn't move; equity = cash + signed current value across all
/// positions.
typedef LiveSummary = ({
  double totalEquity,
  double unrealizedPnL,
  double invested,
});

LiveSummary liveSummaryOf(PortfolioSnapshot snap, Map<String, Tick> ticks) {
  double currentSigned = 0;
  double unrealized = 0;
  for (final p in snap.positions) {
    final live = LivePosition.of(p, ticks[tickKeyForPosition(p)]?.ltp);
    currentSigned += p.quantity < 0 ? -live.currentValue : live.currentValue;
    unrealized += live.unrealizedPnL;
  }
  return (
    totalEquity: snap.wallet.balance + currentSigned,
    unrealizedPnL: unrealized,
    invested: snap.summary.invested,
  );
}
