import { MultiQuoteFetched } from '../smartapi/smartapi.types';
import { PublishedTick } from '../ticks/tick.types';
import { FeedStore } from './feed.store';
import { ResolvedFeedInstrument } from './feed.types';

const NIFTY: ResolvedFeedInstrument = {
  id: 'NIFTY50',
  name: 'Nifty 50',
  kind: 'index',
  exchange: 'NSE',
  lookup: 'NIFTY',
  token: '99926000',
  tradingSymbol: 'Nifty 50',
  expiry: null,
};

const GOLD: ResolvedFeedInstrument = {
  id: 'GOLD',
  name: 'Gold',
  kind: 'commodity',
  exchange: 'MCX',
  lookup: 'GOLD',
  unit: '10 g',
  token: '221594',
  tradingSymbol: 'GOLD05FEB26FUT',
  expiry: '05FEB2026',
};

function tick(over: Partial<PublishedTick> = {}): PublishedTick {
  return {
    exchange: 'NSE',
    exchangeType: 1,
    token: '99926000',
    ltp: 24500,
    ts: 1_700_000_000_000,
    open: 24400,
    high: 24550,
    low: 24380,
    close: 24000,
    volume: 0,
    ...over,
  };
}

describe('FeedStore', () => {
  let store: FeedStore;

  beforeEach(() => {
    store = new FeedStore();
    store.setInstruments([NIFTY, GOLD]);
  });

  it('seeds one slot per instrument, unpriced', () => {
    const snap = store.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap.every((q) => q.ltp === 0 && q.ts === 0)).toBe(true);
    expect(store.pricedCount()).toBe(0);
  });

  it('carries commodity metadata and leaves indices null', () => {
    const byId = new Map(store.snapshot().map((q) => [q.id, q]));
    expect(byId.get('GOLD')).toMatchObject({
      unit: '10 g',
      contract: 'GOLD05FEB26FUT',
      expiry: '05FEB2026',
    });
    expect(byId.get('NIFTY50')).toMatchObject({
      unit: null,
      contract: null,
      expiry: null,
    });
  });

  it('applies a tick and derives change from the previous close', () => {
    store.applyTick(tick());
    const [q] = store.drainDirty();
    expect(q.id).toBe('NIFTY50');
    expect(q.ltp).toBe(24500);
    expect(q.prevClose).toBe(24000);
    expect(q.change).toBe(500);
    expect(q.changePct).toBe(2.08);
    expect(q.ts).toBe(1_700_000_000_000);
  });

  it('drains the change set exactly once', () => {
    store.applyTick(tick());
    expect(store.drainDirty()).toHaveLength(1);
    expect(store.drainDirty()).toHaveLength(0);
  });

  it('does not re-flag an instrument whose numbers did not move', () => {
    store.applyTick(tick());
    store.drainDirty();
    store.applyTick(tick({ ts: 1_700_000_005_000 }));
    expect(store.drainDirty()).toHaveLength(0);
  });

  it('ignores zero-price packets rather than flashing a 0 tile', () => {
    store.applyTick(tick());
    store.drainDirty();
    store.applyTick(tick({ ltp: 0 }));
    expect(store.drainDirty()).toHaveLength(0);
    expect(store.snapshot().find((q) => q.id === 'NIFTY50')?.ltp).toBe(24500);
  });

  it('ignores ticks for tokens outside the universe', () => {
    store.applyTick(tick({ token: '3045' }));
    expect(store.drainDirty()).toHaveLength(0);
  });

  describe('REST snapshots', () => {
    const row = (over: Partial<MultiQuoteFetched> = {}): MultiQuoteFetched => ({
      exchange: 'NSE',
      tradingSymbol: 'Nifty 50',
      symbolToken: '99926000',
      ltp: 24100,
      open: 24000,
      high: 24200,
      low: 23950,
      close: 24000,
      ...over,
    });

    it('fills in an instrument that has never ticked', () => {
      store.applySnapshot([row()]);
      const [q] = store.drainDirty();
      expect(q.ltp).toBe(24100);
      expect(q.change).toBe(100);
    });

    it('never overwrites a price the live feed just delivered', () => {
      store.applyTick(tick());
      store.drainDirty();
      store.applySnapshot([row()]);
      expect(store.drainDirty()).toHaveLength(0);
      expect(store.snapshot().find((q) => q.id === 'NIFTY50')?.ltp).toBe(24500);
    });

    it('does not blank the day OHLC when the reseed reports zeros', () => {
      // Angel returns 0 for an index's open/high/low outside market hours; the
      // reseed a minute after the close must not wipe the day users can see.
      store.applyTick(tick());
      store.drainDirty();
      jest.useFakeTimers();
      try {
        jest.advanceTimersByTime(10_000);
        store.applySnapshot([row({ ltp: 24450, open: 0, high: 0, low: 0 })]);
      } finally {
        jest.useRealTimers();
      }
      const q = store.snapshot().find((x) => x.id === 'NIFTY50');
      expect(q).toMatchObject({
        ltp: 24450,
        open: 24400,
        high: 24550,
        low: 24380,
      });
    });

    it('takes over once the live tick has gone stale', () => {
      jest.useFakeTimers();
      try {
        store.applyTick(tick());
        store.drainDirty();
        jest.advanceTimersByTime(10_000);
        store.applySnapshot([row()]);
        expect(store.drainDirty()).toHaveLength(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('front-month roll', () => {
    it('keeps the price on screen and re-points the token', () => {
      store.applyTick(
        tick({ exchange: 'MCX', token: '221594', ltp: 78000, close: 77500 }),
      );
      store.drainDirty();

      const rolled: ResolvedFeedInstrument = {
        ...GOLD,
        token: '221999',
        tradingSymbol: 'GOLD05MAR26FUT',
        expiry: '05MAR2026',
      };
      store.setInstruments([NIFTY, rolled]);

      const gold = store.snapshot().find((q) => q.id === 'GOLD');
      expect(gold?.ltp).toBe(78000);
      expect(gold?.contract).toBe('GOLD05MAR26FUT');
      expect(store.tracks('MCX', '221999')).toBe(true);
      expect(store.tracks('MCX', '221594')).toBe(false);
    });
  });

  it('groups tokens by exchange for the batched REST call', () => {
    expect(store.tokenGroups()).toEqual({
      NSE: ['99926000'],
      MCX: ['221594'],
    });
  });

  it('drops instruments that disappear from the universe', () => {
    store.setInstruments([NIFTY]);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.size()).toBe(1);
  });
});
