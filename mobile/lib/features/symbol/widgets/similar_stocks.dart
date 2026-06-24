import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/company_info.dart';
import '../../../core/company_names.dart';
import '../../market/market_repository.dart';
import '../screens/symbol_detail_screen.dart';

const _upColor = Color(0xFF22C55E);
const _downColor = Color(0xFFEF4444);

/// "Similar stocks" section — peers in the same sector. Hidden when no peer
/// data is available. Fetches batched quotes once so each card can show the
/// current LTP + day %.
class SimilarStocks extends ConsumerWidget {
  const SimilarStocks({super.key, required this.symbol});
  final String symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final info = companyInfoFor(symbol);
    if (info == null) return const SizedBox.shrink();
    final peers = similarStocksFor(symbol).take(8).toList();
    if (peers.isEmpty) return const SizedBox.shrink();

    final quotesAsync = ref.watch(_similarStocksProvider(_PeersArgs(peers)));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
          child: Row(
            children: [
              const Text(
                'Similar stocks',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Theme.of(context)
                      .colorScheme
                      .surfaceContainerHighest
                      .withValues(alpha: 0.5),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  info.sector,
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.6),
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 122,
          child: quotesAsync.when(
            loading: () => _SkeletonRow(count: peers.length),
            error: (_, _) => _PeerRow(
              quotes: peers
                  .map(
                    (p) => FeedQuote(
                      symbol: p,
                      tradingsymbol: '$p-EQ',
                      symboltoken: '',
                      exchange: 'NSE',
                      lotSize: 1,
                      tickSize: 0.05,
                      ltp: null,
                      open: null,
                      high: null,
                      low: null,
                      close: null,
                    ),
                  )
                  .toList(),
            ),
            data: (quotes) {
              if (quotes.isEmpty) {
                return Center(
                  child: Text(
                    'Peer data unavailable',
                    style: TextStyle(
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withValues(alpha: 0.5),
                    ),
                  ),
                );
              }
              return _PeerRow(quotes: quotes);
            },
          ),
        ),
      ],
    );
  }
}

class _PeerRow extends StatelessWidget {
  const _PeerRow({required this.quotes});
  final List<FeedQuote> quotes;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: quotes.length,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (_, i) => _PeerCard(quote: quotes[i]),
    );
  }
}

class _PeerCard extends StatelessWidget {
  const _PeerCard({required this.quote});
  final FeedQuote quote;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final ltp = quote.ltp;
    final close = quote.close;
    double? change;
    double? pct;
    if (ltp != null && close != null && close > 0) {
      change = ltp - close;
      pct = (change / close) * 100;
    }
    final isUp = (change ?? 0) >= 0;
    final color = isUp ? _upColor : _downColor;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        if (quote.symboltoken.isEmpty) return;
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => SymbolDetailScreen(
              symbol: quote.symbol,
              tradingsymbol: quote.tradingsymbol,
              symboltoken: quote.symboltoken,
              exchange: quote.exchange,
            ),
          ),
        );
      },
      child: Ink(
        width: 162,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: scheme.outlineVariant.withValues(alpha: 0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              companyNameFor(quote.symbol),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              quote.symbol,
              style: TextStyle(
                fontSize: 10.5,
                color: scheme.onSurface.withValues(alpha: 0.55),
                fontWeight: FontWeight.w600,
                letterSpacing: 0.3,
              ),
            ),
            Text(
              ltp != null ? '₹${ltp.toStringAsFixed(2)}' : '—',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (pct != null)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(5),
                ),
                child: Text(
                  '${isUp ? '+' : ''}${pct.toStringAsFixed(2)}%',
                  style: TextStyle(
                    color: color,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SkeletonRow extends StatelessWidget {
  const _SkeletonRow({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: count,
      separatorBuilder: (_, _) => const SizedBox(width: 10),
      itemBuilder: (_, _) => Container(
        width: 162,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(14),
        ),
      ),
    );
  }
}

/// Family key for the peer-set quote lookup. Backed by a single canonical
/// `signature` string so two distinct `List<String>` instances with the same
/// peers hash and compare equal — without this, Riverpod treats every rebuild
/// as a new family key and the FutureProvider never resolves.
class _PeersArgs {
  final String signature;
  final List<String> symbols;
  _PeersArgs(List<String> raw)
      : symbols = List.unmodifiable(raw),
        signature = (List<String>.of(raw)..sort()).join(',');

  @override
  bool operator ==(Object other) =>
      other is _PeersArgs && other.signature == signature;

  @override
  int get hashCode => signature.hashCode;
}

final _similarStocksProvider =
    FutureProvider.family.autoDispose<List<FeedQuote>, _PeersArgs>(
  (ref, args) async {
    if (args.symbols.isEmpty) return const [];
    return ref
        .watch(marketRepositoryProvider)
        .getQuotes(args.symbols, exchange: 'NSE');
  },
);
