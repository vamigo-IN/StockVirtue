/// Client-side cap-segment classifier. Mirrors the backend's
/// `cap-segments.ts` so the Portfolio screen can group positions by
/// market-cap bucket without an extra round trip. Symbols not in any
/// bucket fall under [CapSegment.other] so the donut still adds to 100%.
library;

enum CapSegment { largecap, midcap, smallcap, other }

extension CapSegmentX on CapSegment {
  String get label => switch (this) {
        CapSegment.largecap => 'Large cap',
        CapSegment.midcap => 'Mid cap',
        CapSegment.smallcap => 'Small cap',
        CapSegment.other => 'Other',
      };
}

CapSegment capSegmentFor(String symbol) {
  final s = symbol.toUpperCase();
  if (_largecap.contains(s)) return CapSegment.largecap;
  if (_midcap.contains(s)) return CapSegment.midcap;
  if (_smallcap.contains(s)) return CapSegment.smallcap;
  return CapSegment.other;
}

const _largecap = <String>{
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK',
  'HINDUNILVR', 'ITC', 'SBIN', 'BHARTIARTL', 'KOTAKBANK',
  'LT', 'AXISBANK', 'BAJFINANCE', 'ASIANPAINT', 'MARUTI',
  'HCLTECH', 'WIPRO', 'TITAN', 'ULTRACEMCO', 'NESTLEIND',
  'TATAMOTORS', 'SUNPHARMA', 'POWERGRID', 'NTPC', 'M&M',
  'ADANIENT', 'ADANIPORTS', 'BAJAJFINSV', 'JSWSTEEL', 'TATASTEEL',
  'COALINDIA', 'ONGC', 'HINDALCO', 'GRASIM', 'BRITANNIA',
  'TECHM', 'INDUSINDBK', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO',
  'DIVISLAB', 'APOLLOHOSP', 'HDFCLIFE', 'SBILIFE', 'CIPLA',
  'DRREDDY', 'DMART', 'LICI',
};

const _midcap = <String>{
  'TVSMOTOR', 'ASHOKLEY', 'BHARATFORG', 'MOTHERSON', 'MFSL',
  'GODREJPROP', 'OBEROIRLTY', 'PRESTIGE', 'PHOENIXLTD', 'DLF',
  'AUBANK', 'BANDHANBNK', 'FEDERALBNK', 'IDFCFIRSTB', 'INDIANB',
  'PERSISTENT', 'MPHASIS', 'COFORGE', 'LTIM', 'OFSS',
  'LUPIN', 'AUROPHARMA', 'TORNTPHARM', 'GLENMARK', 'BIOCON',
  'BALKRISIND', 'MRF', 'ABCAPITAL', 'CHOLAFIN', 'MUTHOOTFIN',
  'PETRONET', 'GAIL', 'IOC', 'BPCL', 'HINDPETRO',
  'PIIND', 'UPL', 'TATAPOWER', 'JUBLFOOD', 'TRENT',
  'CONCOR', 'INDIAMART', 'IDEA', 'YESBANK', 'PNB',
  'BANKBARODA', 'CANBK',
};

const _smallcap = <String>{
  'SHRIRAMFIN', 'IRFC', 'RECLTD', 'PFC', 'NHPC',
  'NMDC', 'SAIL', 'NATIONALUM', 'JINDALSTEL', 'RAILTEL',
  'IRCON', 'RVNL', 'BEL', 'BEML', 'HAL',
  'BHEL', 'CESC', 'CASTROLIND', 'EXIDEIND',
  'CROMPTON', 'POLYCAB', 'HAVELLS', 'VOLTAS', 'BLUESTARCO',
  'WHIRLPOOL', 'AMBER', 'DIXON', 'KAJARIACER', 'CENTURYTEX',
  'INDHOTEL', 'CHALET', 'EIHOTEL', 'JUBLPHARMA', 'GRANULES',
  'LAURUSLABS', 'ALKEM', 'AJANTPHARM', 'IPCALAB', 'NATCOPHARM',
};
