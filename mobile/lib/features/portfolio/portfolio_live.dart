import '../../data/models/portfolio.dart';
import '../../data/models/tick.dart';
import '../../widgets/fno_badge.dart';
import '../ticks/ticks_service.dart';

/// Tick-map key for a position (`${exchange}:${symboltoken}` — matches
/// [Tick.key]). Token-based, so it's correct for both cash and F&O.
String tickKeyForPosition(PortfolioPosition p) =>
    '${p.exchange}:${p.symboltoken}';

/// Live-feed subscription for a holding. Derivative contracts (NFO/BFO, and
/// MCX/CDS commodities & currency) must be addressed by their
/// `tradingsymbol` — the underlying name ("NIFTY", "GOLD") doesn't resolve
/// to a contract. Cash equity uses its plain symbol. Either way the streamed
/// tick is keyed by exchange:token, so it matches [tickKeyForPosition].
TickSubscription subForPosition(PortfolioPosition p) {
  return TickSubscription(
    symbol: isFnoExchange(p.exchange) ? p.tradingsymbol : p.symbol,
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

  /// Signed amount this position adds to total equity beyond the wallet:
  /// market value for cash longs, −market value for shorts, and only the
  /// P&L for margined futures (their margin never left the balance).
  final double equityContribution;

  const LivePosition(
    this.ltp,
    this.currentValue,
    this.unrealizedPnL,
    this.unrealizedPnLPct,
    this.equityContribution,
  );

  factory LivePosition.of(PortfolioPosition p, double? liveLtp) {
    final ltp = liveLtp ?? p.ltp;
    final absQty = p.quantity.abs();
    final isShort = p.quantity < 0;
    if (ltp == null) {
      final equity = p.leveraged && !isShort
          ? p.unrealizedPnL
          : (isShort ? -p.currentValue : p.currentValue);
      return LivePosition(
        null,
        p.currentValue,
        p.unrealizedPnL,
        p.unrealizedPnLPct,
        equity,
      );
    }
    if (p.leveraged && !isShort) {
      final pnl = (ltp - p.avgPrice) * absQty;
      final pct = p.margin > 0 ? (pnl / p.margin) * 100 : 0.0;
      return LivePosition(ltp, p.margin + pnl, pnl, pct, pnl);
    }
    final invested = p.invested;
    final currentAbs = ltp * absQty;
    final pnl = isShort ? invested - currentAbs : currentAbs - invested;
    final pct = invested > 0 ? (pnl / invested) * 100 : 0.0;
    return LivePosition(
      ltp,
      currentAbs,
      pnl,
      pct,
      isShort ? -currentAbs : currentAbs,
    );
  }
}

/// Live-overlaid totals for the equity hero / home strip. Cost basis
/// (invested) doesn't move; equity = cash + each position's contribution.
typedef LiveSummary = ({
  double totalEquity,
  double unrealizedPnL,
  double invested,
});

LiveSummary liveSummaryOf(PortfolioSnapshot snap, Map<String, Tick> ticks) {
  double equity = snap.wallet.balance;
  double unrealized = 0;
  for (final p in snap.positions) {
    final live = LivePosition.of(p, ticks[tickKeyForPosition(p)]?.ltp);
    equity += live.equityContribution;
    unrealized += live.unrealizedPnL;
  }
  return (
    totalEquity: equity,
    unrealizedPnL: unrealized,
    invested: snap.summary.invested,
  );
}
