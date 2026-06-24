class Watchlist {
  final String id;
  final String name;
  final int position;
  final DateTime? createdAt;
  final List<WatchlistItem> items;

  const Watchlist({
    required this.id,
    required this.name,
    required this.position,
    required this.createdAt,
    required this.items,
  });

  factory Watchlist.fromJson(Map<String, dynamic> json) => Watchlist(
        id: json['id'] as String,
        name: json['name'] as String,
        position: (json['position'] as num?)?.toInt() ?? 0,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? ''),
        items: ((json['items'] as List?) ?? const [])
            .map((e) => WatchlistItem.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class WatchlistItem {
  final String id;
  final String symbol;
  final String tradingsymbol;
  final String symboltoken;
  final String exchange;
  final int position;

  const WatchlistItem({
    required this.id,
    required this.symbol,
    required this.tradingsymbol,
    required this.symboltoken,
    required this.exchange,
    required this.position,
  });

  String get key => '$exchange:$symboltoken';

  factory WatchlistItem.fromJson(Map<String, dynamic> json) => WatchlistItem(
        id: json['id'] as String,
        symbol: json['symbol'] as String,
        tradingsymbol: json['tradingsymbol'] as String,
        symboltoken: json['symboltoken'] as String,
        exchange: json['exchange'] as String,
        position: (json['position'] as num?)?.toInt() ?? 0,
      );
}
