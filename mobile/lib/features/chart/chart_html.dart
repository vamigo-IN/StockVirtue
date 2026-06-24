/// Builds the public TradingView chart URL for a given (symbol, exchange).
///
/// We deliberately don't use the embed widget (`embed-widget-advanced-chart.js`
/// or the older `tv.js`) anymore: both gate most Indian instruments behind
/// TradingView's own apps with a "Symbol only available on TradingView"
/// message. Loading the public chart page directly works for everything
/// TradingView indexes, since the chart itself is free to view.
String tradingViewChartUrl({
  required String tvSymbol,
}) {
  // The query-string form (`?symbol=...`) lets us pass any "EXCHANGE:TICKER"
  // pair without URL-encoding tricks.
  return 'https://www.tradingview.com/chart/?symbol=$tvSymbol';
}

/// Maps our (symbol, exchange) pair to TradingView's symbol format. Indices
/// have specific tickers on TradingView, so we translate the common ones.
/// Equities map cleanly: e.g. ("RELIANCE", "NSE") → "NSE:RELIANCE".
String tvSymbolFor(String symbol, String exchange) {
  final s = symbol.toUpperCase();
  final ex = exchange.toUpperCase();

  // F&O / commodity exchanges aren't directly supported by the embed widget
  // for individual contract symbols; fall back to the underlying on NSE.
  if (ex == 'NFO' || ex == 'BFO' || ex == 'MCX' || ex == 'CDS') {
    return 'NSE:$s';
  }

  const indexAliases = <String, String>{
    // NSE
    'NIFTY': 'NSE:NIFTY',
    'NIFTY 50': 'NSE:NIFTY',
    'NIFTY50': 'NSE:NIFTY',
    'BANKNIFTY': 'NSE:BANKNIFTY',
    'NIFTY BANK': 'NSE:BANKNIFTY',
    'FINNIFTY': 'NSE:CNXFINANCE',
    'NIFTY FIN SERVICE': 'NSE:CNXFINANCE',
    'MIDCPNIFTY': 'NSE:NIFTY_MID_SELECT',
    'NIFTY MID SELECT': 'NSE:NIFTY_MID_SELECT',
    'NIFTYNXT50': 'NSE:NIFTYJR',
    'NIFTY NEXT 50': 'NSE:NIFTYJR',
    // BSE — the friendly `name` field from Angel One scrip master ships as
    // "S&P BSE …", which TradingView won't recognise verbatim. Map both the
    // short form (what users see in our app) and the long form (what we
    // sometimes pass through from the quote feed) to TradingView's tickers.
    'SENSEX': 'BSE:SENSEX',
    'BANKEX': 'BSE:BANKEX',
    'SENSEX50': 'BSE:SNSX50',
    'SNSX50': 'BSE:SNSX50',
    'S&P BSE SENSEX 50': 'BSE:SNSX50',
    'BSE100': 'BSE:BSE100',
    'S&P BSE 100': 'BSE:BSE100',
    'BSE500': 'BSE:BSE500',
    'S&P BSE 500': 'BSE:BSE500',
    'BSEMIDCAP': 'BSE:BSEMIDCAP',
    'S&P BSE MIDCAP': 'BSE:BSEMIDCAP',
    'BSESMLCAP': 'BSE:BSESMLCAP',
    'S&P BSE SMALLCAP': 'BSE:BSESMLCAP',
  };
  final aliased = indexAliases[s];
  if (aliased != null) return aliased;

  return '$ex:$s';
}
