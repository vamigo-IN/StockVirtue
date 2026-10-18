import {
  cleanCompanyName,
  parseNseDate,
  parseNseEquityList,
} from './company-directory.parse';

describe('company directory parsing', () => {
  it('turns NSE legal names into display names', () => {
    expect(cleanCompanyName('Kotak Mahindra Bank Limited')).toBe(
      'Kotak Mahindra Bank',
    );
    expect(cleanCompanyName('ETERNAL LIMITED')).toBe('Eternal');
    expect(cleanCompanyName('The Federal Bank  Limited')).toBe(
      'The Federal Bank',
    );
    expect(cleanCompanyName('Thomas Cook  (India)  Limited')).toBe(
      'Thomas Cook (India)',
    );
    expect(cleanCompanyName('Mahindra & Mahindra Limited')).toBe(
      'Mahindra & Mahindra',
    );
    expect(
      cleanCompanyName('ADANI PORTS AND SPECIAL ECONOMIC ZONE LIMITED'),
    ).toBe('Adani Ports and Special Economic Zone');
  });

  it('parses both mainboard and SME date formats', () => {
    expect(parseNseDate('20-DEC-1995')).toBe('1995-12-20');
    expect(parseNseDate('12-Oct-26')).toBe('2026-10-12');
    expect(parseNseDate('-')).toBeNull();
  });

  it('parses the EQUITY_L.csv layout, including quoted commas', () => {
    const csv = [
      'SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE',
      'KOTAKBANK,Kotak Mahindra Bank Limited,EQ,20-DEC-1995,5,1,INE237A01028,5',
      '"ACME","Acme, Widgets Limited",EQ,05-OCT-2026,10,1,INE000000000,10',
    ].join('\n');
    const rows = parseNseEquityList(csv, false);
    expect(rows).toEqual([
      {
        symbol: 'KOTAKBANK',
        name: 'Kotak Mahindra Bank',
        listedOn: '1995-12-20',
        sme: false,
      },
      {
        symbol: 'ACME',
        name: 'Acme, Widgets',
        listedOn: '2026-10-05',
        sme: false,
      },
    ]);
  });

  it('parses the SME_EQUITY_L.csv layout', () => {
    const csv = [
      'SYMBOL,NAME_OF_COMPANY,SERIES,DATE_OF_LISTING,PAID_UP_VALUE,ISIN_NUMBER,FACE_VALUE,',
      'RKFAL,R.K. Fashion Accessories Limited,ST,12-Oct-26,10,INE2O2Y01016,10,',
    ].join('\n');
    expect(parseNseEquityList(csv, true)).toEqual([
      {
        symbol: 'RKFAL',
        name: 'R.K. Fashion Accessories',
        listedOn: '2026-10-12',
        sme: true,
      },
    ]);
  });
});
