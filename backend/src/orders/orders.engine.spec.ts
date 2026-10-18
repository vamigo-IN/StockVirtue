/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
// ^ The in-memory Prisma stand-in below is deliberately loosely typed (rows
//   are plain records) and its async methods mirror Prisma's promise API
//   without awaiting anything.
import { OrderSide, OrderStatus, OrderType } from '@prisma/client';
import { computeFees } from '../common/fees';
import { WalletService } from '../wallet/wallet.service';
import { OrdersService } from './orders.service';

// The engine's collaborators are injected as fakes below; stub their modules
// so Jest doesn't load firebase-admin (ESM-only deps) through them.
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../achievements/achievements.service', () => ({
  AchievementsService: class {},
}));

/// End-to-end tests of the order engine's money paths against a small
/// in-memory stand-in for Prisma (transactions roll back on throw, just like
/// the real thing). Exercises the futures-on-margin model, MCX contract
/// values, exact reservations and the per-exchange session gate.

const R = 100n; // paise per rupee
const START_P = 1_000_000n * R; // ₹10 lakh

type Row = Record<string, any>;

class FakePrisma {
  wallets: Row[] = [];
  positions: Row[] = [];
  orders: Row[] = [];
  private seq = 0;

  private id(prefix: string) {
    this.seq += 1;
    return `${prefix}${this.seq}`;
  }

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({
      w: this.wallets,
      p: this.positions,
      o: this.orders,
    });
    try {
      return await fn(this);
    } catch (err) {
      this.wallets = snapshot.w;
      this.positions = snapshot.p;
      this.orders = snapshot.o;
      throw err;
    }
  }

  async $queryRaw(_strings: TemplateStringsArray, userId: string) {
    return this.wallets.filter((w) => w.userId === userId);
  }

  private posKey(where: Row) {
    if (where.id) return (p: Row) => p.id === where.id;
    const k = where.userId_symboltoken_exchange_product;
    return (p: Row) =>
      p.userId === k.userId &&
      p.symboltoken === k.symboltoken &&
      p.exchange === k.exchange &&
      p.product === k.product;
  }

  wallet = {
    upsert: async ({ where, create }: Row) => {
      let w = this.wallets.find((x) => x.userId === where.userId);
      if (!w) {
        w = {
          id: this.id('w'),
          reservedP: 0n,
          marginReservedP: 0n,
          ...create,
        };
        this.wallets.push(w);
      }
      return w;
    },
    findUnique: async ({ where }: Row) =>
      this.wallets.find((x) => x.userId === where.userId) ?? null,
    update: async ({ where, data }: Row) => {
      const w = this.wallets.find((x) => x.userId === where.userId)!;
      Object.assign(w, data);
      for (const k of ['balanceP', 'reservedP', 'marginReservedP']) {
        if (w[k] < 0n) throw new Error(`CHECK violation: ${k} < 0`);
      }
      return w;
    },
  };

  position = {
    findUnique: async ({ where }: Row) =>
      this.positions.find(this.posKey(where)) ?? null,
    update: async ({ where, data }: Row) => {
      const p = this.positions.find(this.posKey(where))!;
      Object.assign(p, data);
      if (p.reservedQty < 0 || p.marginP < 0n) {
        throw new Error('CHECK violation on position');
      }
      return p;
    },
    create: async ({ data }: Row) => {
      const p = {
        id: this.id('p'),
        reservedQty: 0,
        marginP: 0n,
        leveraged: false,
        realizedPnLP: 0n,
        openedAt: new Date(),
        ...data,
      };
      this.positions.push(p);
      return p;
    },
  };

  order = {
    create: async ({ data }: Row) => {
      const o = {
        id: this.id('o'),
        type: OrderType.MARKET,
        product: 'DELIVERY',
        origin: 'USER',
        limitPriceP: null,
        triggerPriceP: null,
        trailAmountP: null,
        fillPriceP: null,
        feesP: 0n,
        shortIntent: false,
        reservedMarginP: 0n,
        leveraged: false,
        cashReservedP: 0n,
        status: OrderStatus.PENDING,
        rejectReason: null,
        createdAt: new Date(),
        filledAt: null,
        ...data,
      };
      this.orders.push(o);
      return o;
    },
    findUnique: async ({ where }: Row) =>
      this.orders.find((o) => o.id === where.id) ?? null,
    update: async ({ where, data }: Row) => {
      const o = this.orders.find((x) => x.id === where.id)!;
      Object.assign(o, data);
      return o;
    },
  };
}

const INSTRUMENTS: Row[] = [
  {
    token: '2885',
    symbol: 'RELIANCE-EQ',
    name: 'RELIANCE',
    exchange: 'NSE',
    instrumentType: '',
    lotSize: 1,
    rawLotSize: 1,
    isEquity: true,
    expiry: null,
  },
  {
    token: '575011',
    symbol: 'GOLDM04DEC26FUT',
    name: 'GOLDM',
    exchange: 'MCX',
    instrumentType: 'FUTCOM',
    lotSize: 10,
    rawLotSize: 100,
    isEquity: false,
    expiry: '04DEC2026',
  },
  {
    token: '495213',
    symbol: 'GOLD04DEC26FUT',
    name: 'GOLD',
    exchange: 'MCX',
    instrumentType: 'FUTCOM',
    lotSize: 100,
    rawLotSize: 1,
    isEquity: false,
    expiry: '04DEC2026',
  },
  {
    token: '600100',
    symbol: 'SILVER10006NOV26FUT',
    name: 'SILVER100',
    exchange: 'MCX',
    instrumentType: 'FUTCOM',
    lotSize: 100,
    rawLotSize: 100,
    isEquity: false,
    expiry: '06NOV2026',
  },
  {
    token: '35001',
    symbol: 'NIFTY29DEC26FUT',
    name: 'NIFTY',
    exchange: 'NFO',
    instrumentType: 'FUTIDX',
    lotSize: 75,
    rawLotSize: 75,
    isEquity: false,
    expiry: '29DEC2026',
  },
];

function setup() {
  const prisma = new FakePrisma();
  const prices: Record<string, number> = {
    '2885': 1_300,
    '575011': 160_000,
    '495213': 163_500,
    '600100': 285_000,
    '35001': 25_000,
  };
  const scripMaster = {
    getInstrument: (symbol: string, exchange: string) =>
      INSTRUMENTS.find(
        (i) =>
          i.exchange === exchange && (i.symbol === symbol || i.name === symbol),
      ) ?? null,
  };
  const smartapi = {
    getMultiQuote: async (tokens: Record<string, string[]>) =>
      Object.entries(tokens).flatMap(([exchange, list]) =>
        list.map((t) => ({ exchange, symbolToken: t, ltp: prices[t] })),
      ),
    getLtp: async (req: { symboltoken: string }) => ({
      ltp: prices[req.symboltoken],
    }),
  };
  const ok = async () => undefined;
  const service = new OrdersService(
    prisma as any,
    scripMaster as any,
    smartapi as any,
    new WalletService(prisma as any),
    { notifyOrderFilled: ok } as any,
    { tradingHalted: () => false } as any,
    { evaluate: ok } as any,
    { getCachedHolidayDates: () => new Set<string>() } as any,
  );
  return { prisma, service, prices };
}

const wallet = (prisma: FakePrisma) =>
  prisma.wallets.find((w) => w.userId === 'u1')!;
const position = (prisma: FakePrisma, token: string) =>
  prisma.positions.find((p) => p.userId === 'u1' && p.symboltoken === token);

function fees(
  side: 'BUY' | 'SELL',
  exchange: string,
  notionalP: bigint,
  segment: any,
) {
  return computeFees({ side, exchange, notionalP, segment }).total;
}

describe('order engine — futures on margin & MCX contract values', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    // Tue 20 Oct 2026, 11:00 IST — equities and MCX both open.
    jest.setSystemTime(new Date('2026-10-20T05:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('buys one GOLDM lot by blocking margin, not the ₹16 lakh contract value', async () => {
    const { prisma, service } = setup();
    const order = await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.MARKET,
    });
    expect(order.status).toBe(OrderStatus.FILLED);
    expect(order.leveraged).toBe(true);

    const notionalP = 160_000n * R * 10n; // ₹16,00,000
    const marginP = (notionalP * 900n) / 10_000n; // 9% = ₹1,44,000
    const buyFeesP = fees('BUY', 'MCX', notionalP, 'COMMODITY_FUTURES');
    expect(wallet(prisma).balanceP).toBe(START_P - buyFeesP);
    expect(wallet(prisma).marginReservedP).toBe(marginP);
    expect(position(prisma, '575011')).toMatchObject({
      quantity: 10,
      leveraged: true,
      marginP,
      avgPriceP: 160_000n * R,
    });
  });

  it('settles only the P&L and unblocks margin when the futures long is sold', async () => {
    const { prisma, service, prices } = setup();
    await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.MARKET,
    });
    const afterBuy = wallet(prisma).balanceP;
    prices['575011'] = 161_000; // gold up ₹1,000 per 10 g
    await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.SELL,
      quantity: 10,
      type: OrderType.MARKET,
    });
    const pnlP = 1_000n * R * 10n; // ₹10,000 on one 100 g lot
    const sellFeesP = fees(
      'SELL',
      'MCX',
      161_000n * R * 10n,
      'COMMODITY_FUTURES',
    );
    expect(wallet(prisma).balanceP).toBe(afterBuy + pnlP - sellFeesP);
    expect(wallet(prisma).marginReservedP).toBe(0n);
    expect(position(prisma, '575011')).toMatchObject({
      quantity: 0,
      marginP: 0n,
      realizedPnLP: pnlP - sellFeesP,
    });
  });

  it('rejects a GOLD lot (₹1.6 crore) whose margin exceeds the account', async () => {
    const { prisma, service } = setup();
    await expect(
      service.place({
        userId: 'u1',
        symbol: 'GOLD04DEC26FUT',
        exchange: 'MCX',
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
      }),
    ).rejects.toThrow('INSUFFICIENT_MARGIN');
    // The whole transaction rolled back — nothing was debited or blocked.
    const w = prisma.wallets.find((x) => x.userId === 'u1');
    expect(w?.balanceP ?? START_P).toBe(START_P);
    expect(w?.marginReservedP ?? 0n).toBe(0n);
    expect(prisma.positions).toHaveLength(0);
  });

  it('enforces the normalised lot (GOLD trades in 100-unit lots)', async () => {
    const { service } = setup();
    await expect(
      service.place({
        userId: 'u1',
        symbol: 'GOLD04DEC26FUT',
        exchange: 'MCX',
        side: OrderSide.BUY,
        quantity: 1,
        type: OrderType.MARKET,
      }),
    ).rejects.toThrow('multiple of lot size (100)');
  });

  it("won't open a contract it can't value", async () => {
    const { service } = setup();
    await expect(
      service.place({
        userId: 'u1',
        symbol: 'SILVER10006NOV26FUT',
        exchange: 'MCX',
        side: OrderSide.BUY,
        quantity: 100,
        type: OrderType.MARKET,
      }),
    ).rejects.toThrow("can't be traded in the simulator");
  });

  it('makes NIFTY futures affordable on ₹10 lakh (12% margin)', async () => {
    const { prisma, service } = setup();
    await service.place({
      userId: 'u1',
      symbol: 'NIFTY29DEC26FUT',
      exchange: 'NFO',
      side: OrderSide.BUY,
      quantity: 75,
      type: OrderType.MARKET,
    });
    const notionalP = 25_000n * R * 75n; // ₹18.75 lakh
    expect(wallet(prisma).marginReservedP).toBe((notionalP * 1200n) / 10_000n);
  });

  it('keeps cash equity on full value with unchanged delivery charges', async () => {
    const { prisma, service } = setup();
    const order = await service.place({
      userId: 'u1',
      symbol: 'RELIANCE',
      exchange: 'NSE',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.MARKET,
    });
    expect(order.leveraged).toBe(false);
    const notionalP = 1_300n * R * 10n;
    expect(wallet(prisma).balanceP).toBe(
      START_P - notionalP - fees('BUY', 'NSE', notionalP, 'EQUITY'),
    );
    expect(wallet(prisma).marginReservedP).toBe(0n);
  });

  it('reserves margin + fees for a futures LIMIT and releases exactly that on cancel', async () => {
    const { prisma, service } = setup();
    const order = await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.LIMIT,
      limitPrice: 159_000,
    });
    expect(order.status).toBe(OrderStatus.PENDING);
    const notionalP = 159_000n * R * 10n;
    const expected =
      (notionalP * 900n) / 10_000n +
      fees('BUY', 'MCX', notionalP, 'COMMODITY_FUTURES');
    expect(order.cashReservedP).toBe(expected);
    expect(wallet(prisma).reservedP).toBe(expected);
    await service.cancel('u1', order.id);
    expect(wallet(prisma).reservedP).toBe(0n);
  });

  it('fills a futures LIMIT on margin at the fill price and frees the hold', async () => {
    const { prisma, service } = setup();
    const order = await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.LIMIT,
      limitPrice: 159_000,
    });
    const filled = await service.fillLimit(order.id, 158_500);
    expect(filled?.status).toBe(OrderStatus.FILLED);
    const notionalP = 158_500n * R * 10n;
    expect(wallet(prisma).reservedP).toBe(0n);
    expect(wallet(prisma).marginReservedP).toBe((notionalP * 900n) / 10_000n);
    expect(wallet(prisma).balanceP).toBe(
      START_P - fees('BUY', 'MCX', notionalP, 'COMMODITY_FUTURES'),
    );
  });

  it('still releases a legacy pending BUY by threshold × quantity', async () => {
    const { prisma, service } = setup();
    await prisma.wallet.upsert({
      where: { userId: 'u1' },
      create: { userId: 'u1', balanceP: START_P },
    });
    wallet(prisma).reservedP = 13_000n * R;
    const legacy = await prisma.order.create({
      data: {
        userId: 'u1',
        symbol: 'RELIANCE',
        tradingsymbol: 'RELIANCE-EQ',
        symboltoken: '2885',
        exchange: 'NSE',
        side: OrderSide.BUY,
        type: OrderType.LIMIT,
        quantity: 10,
        limitPriceP: 1_300n * R,
      },
    });
    await service.cancel('u1', legacy.id);
    expect(wallet(prisma).reservedP).toBe(0n);
  });

  it('fills MCX orders in the evening session but holds equity orders until 09:15', async () => {
    const { prisma, service } = setup();
    const mcx = await service.place({
      userId: 'u1',
      symbol: 'GOLDM04DEC26FUT',
      exchange: 'MCX',
      side: OrderSide.BUY,
      quantity: 10,
      type: OrderType.LIMIT,
      limitPrice: 159_000,
    });
    const eq = await service.place({
      userId: 'u1',
      symbol: 'RELIANCE',
      exchange: 'NSE',
      side: OrderSide.BUY,
      quantity: 1,
      type: OrderType.LIMIT,
      limitPrice: 1_290,
    });
    jest.setSystemTime(new Date('2026-10-20T15:30:00Z')); // 21:00 IST
    expect((await service.fillLimit(mcx.id, 158_900))?.status).toBe(
      OrderStatus.FILLED,
    );
    expect(await service.fillLimit(eq.id, 1_280)).toBeNull();
    expect(prisma.orders.find((o) => o.id === eq.id)?.status).toBe(
      OrderStatus.PENDING,
    );
  });

  it('absorbs a loss larger than the whole balance instead of wedging the position', async () => {
    const { prisma, service, prices } = setup();
    await service.place({
      userId: 'u1',
      symbol: 'NIFTY29DEC26FUT',
      exchange: 'NFO',
      side: OrderSide.BUY,
      quantity: 75 * 4,
      type: OrderType.MARKET, // ₹75L exposure, ₹9L margin
    });
    prices['35001'] = 20_000; // a 20% crash: −₹15 lakh on ₹10 lakh capital
    const exit = await service.place({
      userId: 'u1',
      symbol: 'NIFTY29DEC26FUT',
      exchange: 'NFO',
      side: OrderSide.SELL,
      quantity: 75 * 4,
      type: OrderType.MARKET,
    });
    expect(exit.status).toBe(OrderStatus.FILLED);
    expect(wallet(prisma).balanceP).toBe(0n);
    expect(wallet(prisma).marginReservedP).toBe(0n);
    expect(position(prisma, '35001')?.quantity).toBe(0);
  });
});
