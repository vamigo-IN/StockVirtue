/// Curated catalogue of Indian indices grouped by category. The home strip
/// shows the top of [broad]; the IndicesScreen renders every group as its
/// own section. Symbols are the short names that resolve via the scrip-
/// master `name`-key fallback we set up for index lookups.
library;

class IndexEntry {
  final String symbol;
  final String exchange;
  final String fullName;
  const IndexEntry({
    required this.symbol,
    required this.exchange,
    required this.fullName,
  });
}

class IndexGroup {
  final String label;
  final String description;
  final List<IndexEntry> indices;
  const IndexGroup({
    required this.label,
    required this.description,
    required this.indices,
  });
}

const broadIndices = <IndexEntry>[
  IndexEntry(symbol: 'NIFTY', exchange: 'NSE', fullName: 'Nifty 50'),
  IndexEntry(symbol: 'BANKNIFTY', exchange: 'NSE', fullName: 'Nifty Bank'),
  IndexEntry(symbol: 'SENSEX', exchange: 'BSE', fullName: 'BSE Sensex'),
  IndexEntry(symbol: 'FINNIFTY', exchange: 'NSE', fullName: 'Nifty Financial'),
  IndexEntry(symbol: 'NIFTYNXT50', exchange: 'NSE', fullName: 'Nifty Next 50'),
  IndexEntry(symbol: 'MIDCPNIFTY', exchange: 'NSE',
      fullName: 'Nifty Midcap Select'),
  IndexEntry(symbol: 'NIFTY100', exchange: 'NSE', fullName: 'Nifty 100'),
  IndexEntry(symbol: 'NIFTY200', exchange: 'NSE', fullName: 'Nifty 200'),
  IndexEntry(symbol: 'NIFTY500', exchange: 'NSE', fullName: 'Nifty 500'),
  IndexEntry(symbol: 'NIFTYMIDCAP100', exchange: 'NSE',
      fullName: 'Nifty Midcap 100'),
  IndexEntry(symbol: 'NIFTYMIDCAP150', exchange: 'NSE',
      fullName: 'Nifty Midcap 150'),
  IndexEntry(symbol: 'NIFTYSMLCAP100', exchange: 'NSE',
      fullName: 'Nifty Smallcap 100'),
  IndexEntry(symbol: 'NIFTYSMLCAP250', exchange: 'NSE',
      fullName: 'Nifty Smallcap 250'),
  IndexEntry(symbol: 'BSE100', exchange: 'BSE', fullName: 'BSE 100'),
  IndexEntry(symbol: 'BSE500', exchange: 'BSE', fullName: 'BSE 500'),
  IndexEntry(symbol: 'BSEMIDCAP', exchange: 'BSE', fullName: 'BSE Midcap'),
  IndexEntry(symbol: 'BSESMLCAP', exchange: 'BSE', fullName: 'BSE Smallcap'),
];

const sectoralIndices = <IndexEntry>[
  IndexEntry(symbol: 'NIFTYAUTO', exchange: 'NSE', fullName: 'Nifty Auto'),
  IndexEntry(symbol: 'NIFTYIT', exchange: 'NSE', fullName: 'Nifty IT'),
  IndexEntry(symbol: 'NIFTYPHARMA', exchange: 'NSE', fullName: 'Nifty Pharma'),
  IndexEntry(symbol: 'NIFTYFMCG', exchange: 'NSE', fullName: 'Nifty FMCG'),
  IndexEntry(symbol: 'NIFTYMETAL', exchange: 'NSE', fullName: 'Nifty Metal'),
  IndexEntry(symbol: 'NIFTYREALTY', exchange: 'NSE',
      fullName: 'Nifty Realty'),
  IndexEntry(symbol: 'NIFTYENERGY', exchange: 'NSE',
      fullName: 'Nifty Energy'),
  IndexEntry(symbol: 'NIFTYMEDIA', exchange: 'NSE', fullName: 'Nifty Media'),
  IndexEntry(symbol: 'NIFTYPSUBANK', exchange: 'NSE',
      fullName: 'Nifty PSU Bank'),
  IndexEntry(symbol: 'NIFTYPVTBANK', exchange: 'NSE',
      fullName: 'Nifty Private Bank'),
  IndexEntry(symbol: 'NIFTYHEALTHCARE', exchange: 'NSE',
      fullName: 'Nifty Healthcare'),
  IndexEntry(symbol: 'NIFTYCONSUMERDURABLES', exchange: 'NSE',
      fullName: 'Nifty Consumer Durables'),
  IndexEntry(symbol: 'NIFTYOILGAS', exchange: 'NSE',
      fullName: 'Nifty Oil & Gas'),
  IndexEntry(symbol: 'BANKEX', exchange: 'BSE', fullName: 'BSE Bankex'),
];

const strategyIndices = <IndexEntry>[
  IndexEntry(symbol: 'NIFTYCPSE', exchange: 'NSE', fullName: 'Nifty CPSE'),
  IndexEntry(symbol: 'NIFTYPSE', exchange: 'NSE', fullName: 'Nifty PSE'),
  IndexEntry(symbol: 'NIFTYMNC', exchange: 'NSE', fullName: 'Nifty MNC'),
  IndexEntry(symbol: 'NIFTYCOMMODITIES', exchange: 'NSE',
      fullName: 'Nifty Commodities'),
  IndexEntry(symbol: 'NIFTYINFRA', exchange: 'NSE',
      fullName: 'Nifty Infrastructure'),
  IndexEntry(symbol: 'NIFTYSERVSECTOR', exchange: 'NSE',
      fullName: 'Nifty Services'),
  IndexEntry(symbol: 'SENSEX50', exchange: 'BSE', fullName: 'BSE Sensex 50'),
];

const indexGroups = <IndexGroup>[
  IndexGroup(
    label: 'Broad market',
    description: 'Benchmark and breadth indices across NSE & BSE',
    indices: broadIndices,
  ),
  IndexGroup(
    label: 'Sectoral',
    description: 'Industry-specific cuts of the Nifty / BSE universe',
    indices: sectoralIndices,
  ),
  IndexGroup(
    label: 'Strategy',
    description: 'Thematic and strategy indices',
    indices: strategyIndices,
  ),
];

/// Symbols requested by the home strip's batch quote call — the top of the
/// broad-market list kept small enough to fit in one row without truncation.
List<String> homeStripIndexSymbols() =>
    broadIndices.take(6).map((e) => e.symbol).toList();

/// All known index entries, used for tick subscription on the IndicesScreen.
List<IndexEntry> get allIndices => [
      for (final g in indexGroups) ...g.indices,
    ];

/// Every index ticker the app knows, plus a few that only appear as F&O
/// underlyings — lets avatars skip company-logo lookups for indices.
final Set<String> _indexSymbols = {
  for (final e in allIndices) e.symbol.toUpperCase(),
  'SENSEX50',
  'BANKEX',
  'INDIA VIX',
};

bool isIndexSymbol(String symbol) =>
    _indexSymbols.contains(symbol.trim().toUpperCase());
