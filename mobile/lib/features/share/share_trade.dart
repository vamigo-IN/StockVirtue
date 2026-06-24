import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:share_plus/share_plus.dart';

import '../../core/company_names.dart';
import '../../core/money_format.dart';
import '../../data/models/portfolio.dart';

/// What we share — either a closed trade brag-card or an open-position
/// performance card. We pass a small DTO so the caller doesn't need to
/// know about the OrderRecord / PortfolioPosition shape.
class ShareTradePayload {
  final String symbol;
  final String? exchange;
  final String headline; // e.g. "Bought 25 RELIANCE"
  final double? entryPrice;
  final double? exitPrice;
  final int quantity;
  final double pnl;
  final double pnlPct;
  final String? note;

  const ShareTradePayload({
    required this.symbol,
    required this.exchange,
    required this.headline,
    required this.entryPrice,
    required this.exitPrice,
    required this.quantity,
    required this.pnl,
    required this.pnlPct,
    this.note,
  });

  factory ShareTradePayload.fromPosition(PortfolioPosition p, {String? note}) {
    return ShareTradePayload(
      symbol: p.symbol,
      exchange: p.exchange,
      headline: '${p.quantity >= 0 ? 'Long' : 'Short'} '
          '${p.quantity.abs()} ${p.symbol}',
      entryPrice: p.avgPrice,
      exitPrice: p.ltp,
      quantity: p.quantity.abs(),
      pnl: p.unrealizedPnL,
      pnlPct: p.unrealizedPnLPct,
      note: note,
    );
  }
}

/// Renders the share-card off-screen, snapshots it with RepaintBoundary,
/// then hands the PNG bytes to the system share sheet via share_plus. The
/// card never appears in-app — it lives only long enough to paint once and
/// dispose. No native screenshot APIs required; this works on every
/// platform Flutter supports.
Future<void> shareTrade(
  BuildContext context, {
  required ShareTradePayload payload,
}) async {
  final key = GlobalKey();
  final overlay = Overlay.of(context, rootOverlay: true);

  // Off-screen render: we insert the card into an Overlay positioned
  // outside the visible window, wait one frame for paint, snapshot, then
  // remove. This dodges the "you can only snapshot mounted widgets" rule
  // without ever flashing the card on screen.
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => Positioned(
      left: -10000,
      top: -10000,
      child: RepaintBoundary(
        key: key,
        child: _ShareCard(payload: payload),
      ),
    ),
  );
  overlay.insert(entry);
  try {
    // Two frames — first to lay out, second to paint reliably.
    await WidgetsBinding.instance.endOfFrame;
    await WidgetsBinding.instance.endOfFrame;
    final boundary = key.currentContext!.findRenderObject()!
        as RenderRepaintBoundary;
    final image =
        await boundary.toImage(pixelRatio: 3); // crisp on retina
    final byteData =
        await image.toByteData(format: ui.ImageByteFormat.png);
    if (byteData == null) {
      throw StateError('Empty share image');
    }
    final bytes = byteData.buffer.asUint8List();
    final file = XFile.fromData(
      bytes,
      name:
          'stockvirtue-${payload.symbol.toLowerCase()}-${DateTime.now().millisecondsSinceEpoch}.png',
      mimeType: 'image/png',
    );
    await SharePlus.instance.share(
      ShareParams(
        files: [file],
        subject: 'My ${payload.symbol} trade on StockVirtue',
        text:
            '${payload.symbol} · ${payload.pnl >= 0 ? '+' : ''}'
            '${payload.pnlPct.toStringAsFixed(2)}% on StockVirtue',
      ),
    );
  } finally {
    entry.remove();
  }
}

class _ShareCard extends StatelessWidget {
  const _ShareCard({required this.payload});
  final ShareTradePayload payload;

  @override
  Widget build(BuildContext context) {
    // We deliberately *don't* read Theme.of — the card is shipped to other
    // apps so it should look the same regardless of the user's theme mode.
    return Material(
      color: Colors.transparent,
      child: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(1.0)),
        child: Directionality(
          textDirection: TextDirection.ltr,
          child: _ShareCardBody(payload: payload),
        ),
      ),
    );
  }
}

class _ShareCardBody extends StatelessWidget {
  const _ShareCardBody({required this.payload});
  final ShareTradePayload payload;

  @override
  Widget build(BuildContext context) {
    const upColor = Color(0xFF22C55E);
    const downColor = Color(0xFFEF4444);
    final isUp = payload.pnl >= 0;
    final color = isUp ? upColor : downColor;
    final name = companyNameFor(payload.symbol);
    return SizedBox(
      width: 540,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                const Color(0xFF0B0F14),
                color.withValues(alpha: 0.32),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF22C55E), Color(0xFF06B6D4)],
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'N',
                      style: TextStyle(
                        color: Colors.black,
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'StockVirtue',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      payload.exchange ?? '',
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 36),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 30,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                payload.headline,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 28),
              Text(
                '${isUp ? '+' : ''}${payload.pnlPct.toStringAsFixed(2)}%',
                style: TextStyle(
                  color: color,
                  fontSize: 56,
                  fontWeight: FontWeight.w900,
                  height: 1,
                  letterSpacing: -1,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '${isUp ? '+' : ''}${formatInr(payload.pnl)}',
                style: TextStyle(
                  color: color,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 14,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Row(
                  children: [
                    _MetaCol(
                      label: 'Entry',
                      value: payload.entryPrice != null
                          ? formatInr(payload.entryPrice!)
                          : '—',
                    ),
                    const SizedBox(width: 24),
                    _MetaCol(
                      label: 'Mark',
                      value: payload.exitPrice != null
                          ? formatInr(payload.exitPrice!)
                          : '—',
                    ),
                    const SizedBox(width: 24),
                    _MetaCol(
                      label: 'Qty',
                      value: '${payload.quantity}',
                    ),
                  ],
                ),
              ),
              if (payload.note != null && payload.note!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  '"${payload.note}"',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 12.5,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
              const SizedBox(height: 22),
              const Text(
                'Trade with virtual ₹10,00,000 on StockVirtue',
                style: TextStyle(
                  color: Colors.white54,
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaCol extends StatelessWidget {
  const _MetaCol({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: Colors.white54,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 14.5,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

