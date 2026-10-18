import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;

/// Full company names for every NSE-listed equity, so the app shows
/// "Kotak Mahindra Bank" instead of the bare ticker "KOTAKBANK".
///
/// Angel One's scrip master only ships tickers. Names come from NSE's
/// official listed-company files, in two layers:
///   1. a bundled snapshot (`assets/data/company_names.json`, ~3.2k names)
///      loaded before the first frame — works offline, no flicker;
///   2. the backend's `/market/company-names`, synced once per launch to pick
///      up stocks listed since the app was built (fresh IPOs).
/// A small curated map on top keeps indices and a few household brands
/// reading the way traders say them.
class CompanyDirectory {
  CompanyDirectory._();
  static final CompanyDirectory instance = CompanyDirectory._();

  final Map<String, String> _names = {};

  /// `updatedAt#count` of the last server sync — sent back as `since` so an
  /// unchanged directory isn't re-downloaded.
  String? serverStamp;

  int get size => _names.length;

  /// Loads the bundled snapshot. Call once before `runApp`.
  Future<void> loadBundled() async {
    try {
      final raw = await rootBundle.loadString('assets/data/company_names.json');
      final json = jsonDecode(raw) as Map<String, dynamic>;
      merge((json['names'] as Map).cast<String, dynamic>());
    } catch (e) {
      debugPrint('CompanyDirectory: bundled names unavailable ($e)');
    }
  }

  /// Folds in names from the server (new listings win over the snapshot).
  void merge(Map<String, dynamic> names) {
    names.forEach((symbol, name) {
      if (name is String && name.isNotEmpty) {
        _names[symbol.toUpperCase()] = name;
      }
    });
  }

  String? lookup(String symbol) => _names[_stem(symbol)];

  /// Tickers whose company name contains every word of [query] — lets
  /// on-device filters (watchlists, holdings) match "kotak mah" too.
  bool nameMatches(String symbol, String query) {
    final name = companyNameFor(symbol).toLowerCase();
    final words = query.toLowerCase().split(RegExp(r'\s+'));
    return words.every((w) => w.isEmpty || name.contains(w));
  }
}

/// "KOTAKBANK-EQ" → "KOTAKBANK". Only strips NSE series suffixes, so
/// hyphenated tickers like "BAJAJ-AUTO" survive.
String _stem(String symbol) {
  final upper = symbol.trim().toUpperCase();
  final m = RegExp(r'^(.*)-(EQ|BE|BZ|SM|ST|SZ|IV|RR|GB|MF)$').firstMatch(upper);
  return m != null ? m.group(1)! : upper;
}

/// Indices and a few brand names that read better than NSE's legal form.
const Map<String, String> _curated = {
  // Major indices
  'NIFTY': 'Nifty 50',
  'BANKNIFTY': 'Nifty Bank',
  'FINNIFTY': 'Nifty Financial Services',
  'MIDCPNIFTY': 'Nifty Midcap Select',
  'NIFTYNXT50': 'Nifty Next 50',
  'SENSEX': 'BSE Sensex',
  'BANKEX': 'BSE Bankex',
  'SENSEX50': 'BSE Sensex 50',
  'INDIA VIX': 'India VIX',
  // Brands traders know by a shorter name
  'LICI': 'LIC of India',
  'ONGC': 'ONGC',
  'NTPC': 'NTPC',
  'NESTLEIND': 'Nestlé India',
  'DMART': 'DMart (Avenue Supermarts)',
  'PAYTM': 'Paytm (One 97 Communications)',
  'NYKAA': 'Nykaa (FSN E-Commerce)',
  'ETERNAL': 'Eternal (Zomato)',
};

/// The friendly company name for [symbol] if known, otherwise the ticker.
String companyNameFor(String symbol) {
  final stem = _stem(symbol);
  return _curated[stem] ?? CompanyDirectory.instance.lookup(stem) ?? symbol;
}

/// True when we have a real name that differs from the ticker — screens use
/// it to decide whether to show the ticker as a secondary line.
bool hasCompanyName(String symbol) =>
    companyNameFor(symbol).toUpperCase() != _stem(symbol);
