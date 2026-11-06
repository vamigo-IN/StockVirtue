import 'package:flutter/material.dart';

/// A curated reference of the terms that come up in this app — order types,
/// option greeks, F&O jargon, technical-indicator names. Entirely static
/// content; we maintain it inline because the list changes slowly and
/// shipping it client-side avoids a backend round trip for what is
/// fundamentally a help screen.
class GlossaryScreen extends StatefulWidget {
  const GlossaryScreen({super.key});

  @override
  State<GlossaryScreen> createState() => _GlossaryScreenState();
}

class _GlossaryScreenState extends State<GlossaryScreen> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final q = _query.trim().toLowerCase();
    final sections = q.isEmpty
        ? _sections
        : [
            for (final s in _sections)
              if (s.terms.any((t) => t.matches(q)))
                _GlossarySection(
                  title: s.title,
                  blurb: s.blurb,
                  terms: s.terms.where((t) => t.matches(q)).toList(),
                ),
          ];
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Glossary',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: TextField(
              onChanged: (v) => setState(() => _query = v),
              decoration: InputDecoration(
                hintText: 'Search terms…',
                prefixIcon: const Icon(Icons.search, size: 20),
                isDense: true,
                filled: true,
                fillColor:
                    scheme.surfaceContainerHighest.withValues(alpha: 0.4),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: sections.isEmpty
                ? Center(
                    child: Text(
                      'No matches for "$_query"',
                      style: TextStyle(
                        color: scheme.onSurface.withValues(alpha: 0.6),
                      ),
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
                    children: [
                      for (final section in sections) ...[
                        _SectionHeader(section: section),
                        const SizedBox(height: 8),
                        for (final term in section.terms) ...[
                          _TermCard(term: term),
                          const SizedBox(height: 8),
                        ],
                        const SizedBox(height: 18),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.section});
  final _GlossarySection section;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.2,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            section.blurb,
            style: TextStyle(
              fontSize: 11.5,
              color: scheme.onSurface.withValues(alpha: 0.55),
            ),
          ),
        ],
      ),
    );
  }
}

class _TermCard extends StatelessWidget {
  const _TermCard({required this.term});
  final _GlossaryTerm term;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Flexible(
                child: Text(
                  term.term,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13.5,
                  ),
                ),
              ),
              if (term.acronym != null) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 5,
                    vertical: 1,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    term.acronym!,
                    style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.4,
                      color: scheme.primary,
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 4),
          Text(
            term.definition,
            style: TextStyle(
              fontSize: 12,
              color: scheme.onSurface.withValues(alpha: 0.78),
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _GlossaryTerm {
  final String term;
  final String? acronym;
  final String definition;
  const _GlossaryTerm(this.term, this.definition, {this.acronym});

  bool matches(String q) {
    if (term.toLowerCase().contains(q)) return true;
    if (acronym != null && acronym!.toLowerCase().contains(q)) return true;
    if (definition.toLowerCase().contains(q)) return true;
    return false;
  }
}

class _GlossarySection {
  final String title;
  final String blurb;
  final List<_GlossaryTerm> terms;
  const _GlossarySection({
    required this.title,
    required this.blurb,
    required this.terms,
  });
}

const _sections = <_GlossarySection>[
  _GlossarySection(
    title: 'Order basics',
    blurb: 'The five order shapes you can place from the trade sheet.',
    terms: [
      _GlossaryTerm(
        'Market order',
        'Buys or sells immediately at the best available price. Fast '
            'execution, no price guarantee.',
      ),
      _GlossaryTerm(
        'Limit order',
        'Sits pending until the market reaches your specified price, then '
            'executes at that price or better.',
      ),
      _GlossaryTerm(
        'Stop loss',
        'A trigger price that fires a MARKET exit when crossed. Designed '
            'to cap downside; the actual fill can slip from the trigger.',
        acronym: 'SL-M',
      ),
      _GlossaryTerm(
        'Stop loss limit',
        'Like SL-M but the trigger converts to a LIMIT order instead, so '
            'the fill is bounded — at the cost of possibly not filling at all.',
        acronym: 'SL-L',
      ),
      _GlossaryTerm(
        'Trailing stop',
        'A stop whose trigger ratchets with the market (up for longs, '
            'down for shorts) so you lock in gains as the trend continues.',
      ),
      _GlossaryTerm(
        'CNC — Cash & Carry',
        'Delivery product. Buys are held until you sell; no auto-square. '
            'Full STT both legs. Brokerage is ₹0 in this simulator.',
        acronym: 'CNC',
      ),
      _GlossaryTerm(
        'MIS — Margin Intraday Squareoff',
        'Intraday product. Positions are auto-squared at 15:20 IST. Lower '
            'STT, brokerage applies. Cannot be held overnight.',
        acronym: 'MIS',
      ),
      _GlossaryTerm(
        'GTC — Good Till Cancelled',
        'A pending LIMIT / SL / SL-L / TRAIL order on the DELIVERY product '
            'that survives the daily close — it lives until it triggers or '
            'you cancel.',
        acronym: 'GTC',
      ),
    ],
  ),
  _GlossarySection(
    title: 'F&O',
    blurb: 'Futures and options jargon used across the chain and strategy builder.',
    terms: [
      _GlossaryTerm(
        'Strike price',
        'The price at which an option holder can buy (call) or sell (put) '
            'the underlying. Listed strikes go in fixed steps around spot.',
      ),
      _GlossaryTerm(
        'ATM — At The Money',
        'The strike closest to the current spot. We highlight this row '
            'and auto-scroll to it when the option chain loads.',
        acronym: 'ATM',
      ),
      _GlossaryTerm(
        'ITM — In The Money',
        'Calls below spot or puts above spot — already worth something '
            'if exercised today. Tinted with the leg colour on the chain.',
        acronym: 'ITM',
      ),
      _GlossaryTerm(
        'OTM — Out of The Money',
        'Calls above spot or puts below spot — worthless if exercised '
            'today; the premium is entirely time + volatility value.',
        acronym: 'OTM',
      ),
      _GlossaryTerm(
        'Open Interest',
        'Total open contracts for that strike. Rising OI on a falling '
            'price = short build-up; rising OI on a rising price = long '
            'build-up.',
        acronym: 'OI',
      ),
      _GlossaryTerm(
        'Implied volatility',
        'The volatility the market is pricing into the option. Solved by '
            'inverting Black-Scholes against the live LTP. Higher IV → '
            'fatter premiums.',
        acronym: 'IV',
      ),
      _GlossaryTerm(
        'Put-Call Ratio',
        'Total put OI ÷ total call OI for an underlying. PCR > 1 leans '
            'bearish (more puts open); PCR < 1 leans bullish.',
        acronym: 'PCR',
      ),
      _GlossaryTerm(
        'Lot size',
        'Minimum tradeable quantity on F&O. NIFTY = 50, BANKNIFTY = 30 '
            '(varies). Your order quantity must be a multiple of lot size.',
      ),
      _GlossaryTerm(
        'Margin (SPAN + exposure)',
        'Collateral the broker locks for an open short. We approximate it '
            'at 15% (indices) / 22% (single-stock); the trade sheet can fetch '
            'the broker preview for the authoritative number.',
      ),
    ],
  ),
  _GlossarySection(
    title: 'Greeks',
    blurb: 'Black-Scholes sensitivities — long-press any option strike to see these.',
    terms: [
      _GlossaryTerm(
        'Delta',
        '∂Price/∂Spot — how many ₹ the option moves per ₹1 of underlying. '
            'Calls: 0 → 1. Puts: −1 → 0.',
        acronym: 'Δ',
      ),
      _GlossaryTerm(
        'Gamma',
        '∂Delta/∂Spot — how fast delta itself changes. Spikes for ATM '
            'options near expiry; near zero for deep ITM/OTM.',
        acronym: 'Γ',
      ),
      _GlossaryTerm(
        'Theta',
        'Time decay per calendar day. Almost always negative for option '
            'buyers — premium bleeds away as expiry approaches.',
        acronym: 'Θ',
      ),
      _GlossaryTerm(
        'Vega',
        '₹ change in option price per 1% move in implied volatility. '
            'Always positive for buyers, negative for sellers.',
        acronym: 'V',
      ),
      _GlossaryTerm(
        'Rho',
        '₹ change in option price per 1% move in interest rates. Tiny '
            'effect for short-dated Indian options.',
        acronym: 'ρ',
      ),
    ],
  ),
  _GlossarySection(
    title: 'Chart indicators',
    blurb: 'Studies that overlay on the price chart on the symbol-detail screen.',
    terms: [
      _GlossaryTerm(
        'SMA — Simple Moving Average',
        'Arithmetic mean of the last N closes. Slow to react, smooth '
            'baseline of trend direction. Default: 20-period.',
        acronym: 'SMA',
      ),
      _GlossaryTerm(
        'EMA — Exponential Moving Average',
        'Weighted average that gives more importance to recent prices. '
            'Reacts faster than SMA on the same period.',
        acronym: 'EMA',
      ),
      _GlossaryTerm(
        'Bollinger Bands',
        'Mid line = SMA(20). Upper / lower bands sit ±2σ away. Wide '
            'bands → high volatility; squeeze → consolidation often '
            'before a breakout.',
      ),
    ],
  ),
  _GlossarySection(
    title: 'Money & corporate',
    blurb: 'Indian rupee shortcuts and tax abbreviations.',
    terms: [
      _GlossaryTerm(
        'Lakh',
        '1,00,000 (Indian grouping: 1 followed by 5 zeros). Displayed as '
            '"₹X.XX L" in abbreviated currency mode.',
        acronym: 'L',
      ),
      _GlossaryTerm(
        'Crore',
        '1,00,00,000 (= 100 lakhs = 10 million). Displayed as "₹X.XX Cr" '
            'in abbreviated currency mode.',
        acronym: 'Cr',
      ),
      _GlossaryTerm(
        'P/E — Price to Earnings',
        'Share price divided by trailing earnings per share. High P/E = '
            'market expects high growth; low P/E = mature / undervalued / '
            'declining business.',
        acronym: 'P/E',
      ),
      _GlossaryTerm(
        'EPS — Earnings Per Share',
        'Trailing net profit divided by share count. The denominator in '
            'P/E.',
        acronym: 'EPS',
      ),
      _GlossaryTerm(
        'STT — Securities Transaction Tax',
        'Charged on both legs of a delivery trade and the sell leg of an '
            'intraday trade. Built into our fee model.',
        acronym: 'STT',
      ),
      _GlossaryTerm(
        'GST — Goods & Services Tax',
        '18% on brokerage + exchange transaction charges + SEBI charges. '
            'Built into our fee model.',
        acronym: 'GST',
      ),
    ],
  ),
];
