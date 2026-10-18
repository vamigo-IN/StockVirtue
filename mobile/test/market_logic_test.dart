import 'package:flutter_test/flutter_test.dart';
import 'package:stockvirtue/core/company_names.dart';
import 'package:stockvirtue/core/fees.dart';
import 'package:stockvirtue/core/market_hours.dart';
import 'package:stockvirtue/core/money_format.dart';
import 'package:stockvirtue/data/models/portfolio.dart';
import 'package:stockvirtue/features/portfolio/portfolio_live.dart';
import 'package:stockvirtue/widgets/fno_badge.dart';

PortfolioPosition _pos({
  required int qty,
  required double avg,
  double? ltp,
  bool leveraged = false,
  double margin = 0,
  String exchange = 'NSE',
}) {
  final invested = leveraged ? margin : avg * qty.abs();
  return PortfolioPosition(
    symbol: 'X',
    tradingsymbol: 'X',
    symboltoken: '1',
    exchange: exchange,
    product: 'DELIVERY',
    lotSize: 1,
    quantity: qty,
    reservedQty: 0,
    availableQty: qty,
    avgPrice: avg,
    invested: invested,
    ltp: ltp,
    currentValue: invested,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    realizedPnL: 0,
    leveraged: leveraged,
    margin: margin,
  );
}

void main() {
  group('company names', () {
    setUpAll(() {
      TestWidgetsFlutterBinding.ensureInitialized();
      CompanyDirectory.instance.merge({'KOTAKBANK': 'Kotak Mahindra Bank'});
    });

    test('maps tickers (with or without series) to company names', () {
      expect(companyNameFor('KOTAKBANK'), 'Kotak Mahindra Bank');
      expect(companyNameFor('KOTAKBANK-EQ'), 'Kotak Mahindra Bank');
      expect(companyNameFor('NIFTY'), 'Nifty 50');
      expect(companyNameFor('UNKNOWNTICKER'), 'UNKNOWNTICKER');
    });

    test('matches on any word of the company name', () {
      expect(CompanyDirectory.instance.nameMatches('KOTAKBANK', 'kotak mah'), isTrue);
      expect(CompanyDirectory.instance.nameMatches('KOTAKBANK', 'infosys'), isFalse);
    });
  });

  group('contract labels', () {
    test('turns tradingsymbols into readable contracts', () {
      expect(prettyContract('GOLDM04DEC26FUT'), 'GOLDM 04 Dec FUT');
      expect(prettyContract('NIFTY30DEC2526000CE'), 'NIFTY 30 Dec 26000 CE');
      expect(prettyContract('M&M30DEC25FUT'), 'M&M 30 Dec FUT');
      expect(prettyContract('RELIANCE-EQ'), 'RELIANCE-EQ');
    });

    test('treats MCX as a derivatives exchange', () {
      expect(isFnoExchange('MCX'), isTrue);
      expect(isFnoExchange('NSE'), isFalse);
      expect(commodityLabelFor('GOLDM'), 'Gold Mini');
    });
  });

  group('fees', () {
    test('picks the segment from exchange + symbol', () {
      expect(feeSegmentFor('NSE', 'INFY-EQ'), FeeSegment.equity);
      expect(feeSegmentFor('MCX', 'GOLDM04DEC26FUT'), FeeSegment.commodityFutures);
      expect(feeSegmentFor('NFO', 'NIFTY30DEC2526000PE'), FeeSegment.options);
    });

    test('charges commodity CTT, not equity STT, on a lot of gold', () {
      final f = estimateFees(
        side: 'SELL',
        exchange: 'MCX',
        notional: 16350000,
        segment: FeeSegment.commodityFutures,
      );
      expect(f.stt, closeTo(1635, 0.01));
      expect(f.brokerage, 20);
    });
  });

  group('MCX session', () {
    test('closes at 23:55 during US daylight saving, else 23:30', () {
      expect(commodityCloseMinutes(DateTime(2026, 10, 18)), 23 * 60 + 55);
      expect(commodityCloseMinutes(DateTime(2026, 12, 15)), 23 * 60 + 30);
      expect(isUsDaylightSaving(DateTime(2026, 3, 9)), isTrue);
      expect(isUsDaylightSaving(DateTime(2026, 11, 2)), isFalse);
    });
  });

  group('live valuation', () {
    test('a margined futures long adds only its P&L to equity', () {
      final p = _pos(qty: 10, avg: 160000, leveraged: true, margin: 144000);
      final live = LivePosition.of(p, 161000);
      expect(live.unrealizedPnL, 10000);
      expect(live.equityContribution, 10000);
      expect(live.currentValue, 154000);
    });

    test('a cash long adds its market value', () {
      final live = LivePosition.of(_pos(qty: 10, avg: 100), 110);
      expect(live.equityContribution, 1100);
      expect(live.unrealizedPnL, 100);
    });
  });

  test('compact rupee formatting', () {
    expect(formatInrCompact(16350000), '₹1.64 Cr');
    expect(formatInrCompact(144000), '₹1.44 L');
    expect(formatInrCompact(48200), '₹48.2K');
  });
}
