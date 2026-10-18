import 'package:flutter/material.dart';

const _callColor = Color(0xFF22C55E);
const _putColor = Color(0xFFEF4444);
const _futColor = Color(0xFF8B5CF6);

/// True for the derivatives exchanges — equity F&O (NFO/BFO), commodities
/// (MCX/NCO) and currency (CDS). Positions/orders there are CONTRACTS, so
/// they're named by their tradingsymbol rather than a company name.
bool isFnoExchange(String exchange) =>
    exchange == 'NFO' ||
    exchange == 'BFO' ||
    exchange == 'MCX' ||
    exchange == 'NCO' ||
    exchange == 'CDS';

bool isCommodityExchange(String exchange) =>
    exchange == 'MCX' || exchange == 'NCO';

const _commodityLabels = {
  'GOLD': 'Gold', 'GOLDM': 'Gold Mini', 'GOLDTEN': 'Gold Ten',
  'GOLDGUINEA': 'Gold Guinea', 'GOLDPETAL': 'Gold Petal',
  'SILVER': 'Silver', 'SILVERM': 'Silver Mini', 'SILVERMIC': 'Silver Micro',
  'CRUDEOIL': 'Crude Oil', 'CRUDEOILM': 'Crude Oil Mini',
  'NATURALGAS': 'Natural Gas', 'NATGASMINI': 'Natural Gas Mini',
  'COPPER': 'Copper', 'ZINC': 'Zinc', 'ZINCMINI': 'Zinc Mini',
  'ALUMINIUM': 'Aluminium', 'ALUMINI': 'Aluminium Mini', 'LEAD': 'Lead',
  'LEADMINI': 'Lead Mini', 'NICKEL': 'Nickel', 'MENTHAOIL': 'Mentha Oil',
  'COTTON': 'Cotton', 'CARDAMOM': 'Cardamom',
};

/// "GOLDM" → "Gold Mini" for MCX underlyings; null when unknown.
String? commodityLabelFor(String underlying) =>
    _commodityLabels[underlying.toUpperCase()];

const _monthNames = {
  'JAN': 'Jan', 'FEB': 'Feb', 'MAR': 'Mar', 'APR': 'Apr', 'MAY': 'May',
  'JUN': 'Jun', 'JUL': 'Jul', 'AUG': 'Aug', 'SEP': 'Sep', 'OCT': 'Oct',
  'NOV': 'Nov', 'DEC': 'Dec',
};

/// Human contract name: "GOLDM04DEC26FUT" → "GOLDM 04 Dec FUT",
/// "NIFTY30DEC2526000CE" → "NIFTY 30 Dec 26000 CE". Anything it can't parse
/// (weekly-coded symbols, cash scrips) comes back unchanged.
String prettyContract(String tradingsymbol) {
  final s = tradingsymbol.toUpperCase();
  final fut = RegExp(r'^([A-Z&\-]+?)(\d{2})([A-Z]{3})(\d{2})FUT$').firstMatch(s);
  if (fut != null && _monthNames.containsKey(fut.group(3))) {
    return '${fut.group(1)} ${fut.group(2)} ${_monthNames[fut.group(3)]} FUT';
  }
  final opt = RegExp(r'^([A-Z&\-]+?)(\d{2})([A-Z]{3})(\d{2})(\d+(?:\.\d+)?)(CE|PE)$')
      .firstMatch(s);
  if (opt != null && _monthNames.containsKey(opt.group(3))) {
    return '${opt.group(1)} ${opt.group(2)} ${_monthNames[opt.group(3)]} '
        '${opt.group(5)} ${opt.group(6)}';
  }
  return tradingsymbol;
}

/// Option/future kind parsed from an F&O tradingsymbol suffix, with the
/// colour to render its badge in. Null for anything that isn't an option or
/// future (e.g. cash equity or a malformed symbol).
({String label, Color color})? fnoKind(String tradingsymbol) {
  final s = tradingsymbol.toUpperCase();
  if (s.endsWith('CE')) return (label: 'CALL', color: _callColor);
  if (s.endsWith('PE')) return (label: 'PUT', color: _putColor);
  if (s.endsWith('FUT')) return (label: 'FUT', color: _futColor);
  return null;
}

/// Small colour-coded CALL / PUT / FUT pill shown beside an F&O contract so a
/// holding or order reads clearly at a glance.
class FnoBadge extends StatelessWidget {
  const FnoBadge({super.key, required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 9.5,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
