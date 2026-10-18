import { isContractSupported, normalizedLotSize } from './contract-specs';
import { computeFees, feeSegmentFor } from './fees';
import { futuresMarginP } from './margin';
import {
  commodityCloseMinutes,
  isMarketOpen,
  isUsDaylightSaving,
} from './market-hours';
import { valuePosition } from './valuation';

const RUPEE = 100n; // paise

describe('MCX contract normalisation', () => {
  it('re-expresses lots in quotation units so price × qty is the contract value', () => {
    // GOLD: 1 kg lot quoted per 10 g → 100 units per lot.
    expect(normalizedLotSize('MCX', 'GOLD', 1)).toBe(100);
    // GOLDM: 100 g lot quoted per 10 g → 10 (the raw "100" was 10× too big).
    expect(normalizedLotSize('MCX', 'GOLDM', 100)).toBe(10);
    // Base metals trade in tonnes but quote per kg.
    expect(normalizedLotSize('MCX', 'ZINC', 5)).toBe(5000);
    expect(normalizedLotSize('MCX', 'ALUMINI', 1)).toBe(1000);
  });

  it('leaves contracts whose lot is already in quote units unchanged', () => {
    expect(normalizedLotSize('MCX', 'CRUDEOIL', 100)).toBe(100);
    expect(normalizedLotSize('MCX', 'SILVER', 30)).toBe(30);
    expect(normalizedLotSize('MCX', 'SOMENEWCOMMODITY', 7)).toBe(7);
    expect(normalizedLotSize('NFO', 'NIFTY', 75)).toBe(75);
  });

  it('values one lot of GOLD at the real 1 kg contract value', () => {
    const pricePer10g = 163_500; // ₹ per 10 g
    const lot = normalizedLotSize('MCX', 'GOLD', 1);
    expect(pricePer10g * lot).toBe(16_350_000); // ₹1.635 crore
  });

  it('blocks contracts it cannot value in whole units', () => {
    expect(isContractSupported('MCX', 'SILVER100')).toBe(false);
    expect(isContractSupported('MCX', 'GOLD')).toBe(true);
    expect(isContractSupported('NSE', 'RELIANCE')).toBe(true);
  });
});

describe('futures margin', () => {
  it('blocks a fraction of contract value, by segment', () => {
    const notional = 1_000_000n * RUPEE; // ₹10 lakh
    expect(futuresMarginP(notional, 'NFO', 'NIFTY')).toBe(120_000n * RUPEE); // 12%
    expect(futuresMarginP(notional, 'NFO', 'RELIANCE')).toBe(200_000n * RUPEE); // 20%
    expect(futuresMarginP(notional, 'MCX', 'GOLDM')).toBe(90_000n * RUPEE); // 9%
    expect(futuresMarginP(notional, 'MCX', 'NATURALGAS')).toBe(
      250_000n * RUPEE,
    ); // 25%
  });
});

describe('segment fees', () => {
  it('derives the segment from exchange + tradingsymbol', () => {
    expect(feeSegmentFor('NSE', 'RELIANCE-EQ')).toBe('EQUITY');
    expect(feeSegmentFor('NFO', 'NIFTY25DEC26FUT')).toBe('FUTURES');
    expect(feeSegmentFor('NFO', 'NIFTY25DEC2626000CE')).toBe('OPTIONS');
    expect(feeSegmentFor('MCX', 'GOLDM04DEC26FUT')).toBe('COMMODITY_FUTURES');
    expect(feeSegmentFor('MCX', 'GOLD31AUG26163500PE')).toBe(
      'COMMODITY_OPTIONS',
    );
  });

  it('keeps equity delivery charges exactly as before', () => {
    const f = computeFees({
      side: 'BUY',
      exchange: 'NSE',
      notionalP: 100_000n * RUPEE,
    });
    expect(f.brokerage).toBe(0n);
    expect(f.stt).toBe(100n * RUPEE); // 0.1%
    expect(f.stampDuty).toBe(15n * RUPEE); // 0.015%
  });

  it('charges futures STT only on the sell side at 0.05%', () => {
    const notionalP = 1_000_000n * RUPEE;
    const buy = computeFees({
      side: 'BUY',
      exchange: 'NFO',
      notionalP,
      segment: 'FUTURES',
    });
    const sell = computeFees({
      side: 'SELL',
      exchange: 'NFO',
      notionalP,
      segment: 'FUTURES',
    });
    expect(buy.stt).toBe(0n);
    expect(sell.stt).toBe(500n * RUPEE);
    expect(buy.brokerage).toBe(20n * RUPEE); // capped at ₹20
  });

  it('charges commodity CTT at 0.01% — not equity STT on a crore of gold', () => {
    const notionalP = 16_350_000n * RUPEE; // one GOLD lot
    const sell = computeFees({
      side: 'SELL',
      exchange: 'MCX',
      notionalP,
      segment: 'COMMODITY_FUTURES',
    });
    expect(sell.stt).toBe(1_635n * RUPEE);
    const asEquity = computeFees({ side: 'SELL', exchange: 'MCX', notionalP });
    expect(sell.total < asEquity.total / 5n).toBe(true);
  });
});

describe('MCX session hours', () => {
  it('closes at 23:55 IST while the US is on daylight saving, else 23:30', () => {
    expect(isUsDaylightSaving(new Date('2026-10-18T12:00:00Z'))).toBe(true);
    expect(commodityCloseMinutes(new Date('2026-10-18T12:00:00Z'))).toBe(
      23 * 60 + 55,
    );
    expect(isUsDaylightSaving(new Date('2026-12-15T12:00:00Z'))).toBe(false);
    expect(commodityCloseMinutes(new Date('2026-12-15T12:00:00Z'))).toBe(
      23 * 60 + 30,
    );
  });

  it('switches on the second Sunday of March and the first Sunday of November', () => {
    // 2026: DST runs Sun 8 Mar → Sun 1 Nov.
    expect(isUsDaylightSaving(new Date('2026-03-07T12:00:00Z'))).toBe(false);
    expect(isUsDaylightSaving(new Date('2026-03-09T12:00:00Z'))).toBe(true);
    expect(isUsDaylightSaving(new Date('2026-10-31T12:00:00Z'))).toBe(true);
    expect(isUsDaylightSaving(new Date('2026-11-02T12:00:00Z'))).toBe(false);
  });

  it('keeps MCX open in the evening while equities are shut', () => {
    // Tue 20 Oct 2026, 21:00 IST = 15:30 UTC.
    const evening = new Date('2026-10-20T15:30:00Z');
    expect(isMarketOpen(evening, new Set(), 'MCX')).toBe(true);
    expect(isMarketOpen(evening, new Set(), 'NSE')).toBe(false);
    // 23:45 IST is still inside the DST session (closes 23:55).
    expect(
      isMarketOpen(new Date('2026-10-20T18:15:00Z'), new Set(), 'MCX'),
    ).toBe(true);
  });
});

describe('position valuation', () => {
  it('values a cash long at market value', () => {
    const v = valuePosition(
      { quantity: 10, avgPriceP: 100n * RUPEE, marginP: 0n, leveraged: false },
      110n * RUPEE,
    );
    expect(v.equityP).toBe(1_100n * RUPEE);
    expect(v.unrealizedP).toBe(100n * RUPEE);
  });

  it('adds only mark-to-market P&L for a margined futures long', () => {
    // 10 GOLDM units (1 lot) bought at ₹1,60,000 / 10 g; margin ₹1.44 lakh.
    const v = valuePosition(
      {
        quantity: 10,
        avgPriceP: 160_000n * RUPEE,
        marginP: 144_000n * RUPEE,
        leveraged: true,
      },
      161_000n * RUPEE,
    );
    expect(v.unrealizedP).toBe(10_000n * RUPEE);
    expect(v.equityP).toBe(10_000n * RUPEE); // margin never left the balance
    expect(v.investedP).toBe(144_000n * RUPEE);
    expect(v.exposureP).toBe(1_610_000n * RUPEE);
  });

  it('treats a short as a liability of its market value', () => {
    const v = valuePosition(
      { quantity: -5, avgPriceP: 200n * RUPEE, marginP: 0n, leveraged: false },
      180n * RUPEE,
    );
    expect(v.equityP).toBe(-900n * RUPEE);
    expect(v.unrealizedP).toBe(100n * RUPEE);
  });

  it('marks at cost when there is no quote', () => {
    const v = valuePosition(
      { quantity: 3, avgPriceP: 50n * RUPEE, marginP: 0n, leveraged: false },
      null,
    );
    expect(v.unrealizedP).toBe(0n);
    expect(v.equityP).toBe(150n * RUPEE);
  });
});
