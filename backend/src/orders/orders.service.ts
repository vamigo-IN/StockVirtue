import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Order,
  OrderOrigin,
  OrderProduct,
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import { Exchange } from '../common/exchange';
import { computeFees, feeSegmentFor } from '../common/fees';
import { isMarketOpen } from '../common/market-hours';
import { HolidaysService } from '../market/holidays.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import {
  futuresMarginP,
  isFnoInstrumentType,
  isMarginTraded,
  requiredMarginP,
} from '../common/margin';
import { rupeesToPaise } from '../common/money';
import { ScripMasterService } from '../market/scrip-master.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AchievementsService } from '../achievements/achievements.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';
import { WalletService } from '../wallet/wallet.service';

interface PlaceOrderInput {
  userId: string;
  symbol: string;
  exchange: Exchange;
  side: OrderSide;
  quantity: number;
  type?: OrderType;
  product?: OrderProduct;
  /** rupees, required when type === LIMIT */
  limitPrice?: number;
  /** rupees, required when type === STOP_LOSS */
  triggerPrice?: number;
  /** rupees, required when type === TRAILING_STOP */
  trailAmount?: number;
  /** Who created this order. Defaults to USER; system square-off /
   *  settlement jobs pass AUTO_SQUARE / EXPIRY. */
  origin?: OrderOrigin;
  /** System square-off / settlement: fill a MARKET order immediately at the
   *  last price even when the market is closed, instead of queueing it as a
   *  pending after-market order. */
  forceFill?: boolean;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    private readonly smartapi: SmartApiService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
    private readonly featureFlags: FeatureFlagsService,
    private readonly achievements: AchievementsService,
    private readonly holidays: HolidaysService,
  ) {}

  /// Market-hours check that honours the trading-holiday calendar. A bare
  /// isMarketOpen() only knows weekends + time-of-day, so it treats a weekday
  /// holiday (e.g. Muharram) as open — which would let orders fill on a day
  /// the exchange is shut. Always route market-hours decisions through here.
  private isTradingOpen(exchange?: string): boolean {
    return isMarketOpen(
      new Date(),
      this.holidays.getCachedHolidayDates(),
      exchange,
    );
  }

  // ─── money helpers ────────────────────────────────────────────────────

  /// Cash free to commit: balance minus pending-order holds and blocked margin.
  private available(wallet: {
    balanceP: bigint;
    reservedP: bigint;
    marginReservedP: bigint;
  }): bigint {
    return wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
  }

  private feesFor(
    side: OrderSide,
    exchange: string,
    tradingsymbol: string,
    notionalP: bigint,
    product: OrderProduct,
  ): bigint {
    return computeFees({
      side,
      exchange,
      notionalP,
      intraday: product === OrderProduct.INTRADAY,
      segment: feeSegmentFor(exchange, tradingsymbol),
    }).total;
  }

  /// Cash a BUY at `priceP` must be able to cover: the initial margin for a
  /// leveraged futures BUY, otherwise the full notional — plus buy-side fees,
  /// so a resting order can never fill into a negative balance.
  private buyCommitP(args: {
    exchange: string;
    tradingsymbol: string;
    underlying: string;
    priceP: bigint;
    quantity: number;
    product: OrderProduct;
    leveraged: boolean;
  }): bigint {
    const notionalP = args.priceP * BigInt(args.quantity);
    const base = args.leveraged
      ? futuresMarginP(notionalP, args.exchange, args.underlying)
      : notionalP;
    return (
      base +
      this.feesFor(
        OrderSide.BUY,
        args.exchange,
        args.tradingsymbol,
        notionalP,
        args.product,
      )
    );
  }

  /// Whether a new BUY on this contract trades on margin. An open long keeps
  /// the mode it was opened in (legacy full-value futures stay full-value
  /// until closed); a fresh position is leveraged iff it's an equity F&O
  /// future — commodities trade by the unit at full value.
  private buyIsLeveraged(
    inst: Instrument,
    position: { quantity: number; leveraged: boolean } | null,
  ): boolean {
    if (position && position.quantity > 0) return position.leveraged;
    if (position && position.quantity < 0) return false; // covering a short
    return isMarginTraded(inst.instrumentType, inst.exchange);
  }

  /// The price a pending order's reservation was sized against.
  private thresholdOf(order: Order): bigint | null {
    switch (order.type) {
      case OrderType.LIMIT:
      case OrderType.MARKET:
      case OrderType.STOP_LOSS_LIMIT:
        return order.limitPriceP;
      case OrderType.STOP_LOSS:
      case OrderType.TRAILING_STOP:
        return order.triggerPriceP;
      default:
        return null;
    }
  }

  /// Cash a pending BUY holds in wallet.reservedP. Orders placed before the
  /// exact amount was stored fall back to the old threshold × quantity rule.
  private buyReservationOf(order: Order): bigint {
    if (order.cashReservedP > 0n) return order.cashReservedP;
    const thresholdP = this.thresholdOf(order);
    return thresholdP === null ? 0n : thresholdP * BigInt(order.quantity);
  }

  /// Settles closing `qty` of a leveraged (margined) long at `fillPriceP`:
  /// the wallet receives only the mark-to-market P&L (the contract value
  /// never left it) and the proportional margin is unblocked.
  private leveragedClose(
    position: { quantity: number; avgPriceP: bigint; marginP: bigint },
    qty: number,
    fillPriceP: bigint,
    feesP: bigint,
  ) {
    const pnlP = (fillPriceP - position.avgPriceP) * BigInt(qty);
    const marginReleaseP =
      qty >= position.quantity
        ? position.marginP
        : (position.marginP * BigInt(qty)) / BigInt(position.quantity);
    return {
      balanceDeltaP: pnlP - feesP,
      marginReleaseP,
      realizedP: pnlP - feesP,
    };
  }

  /// Applies a leveraged close to the wallet. A loss larger than the whole
  /// balance (a gap through every rupee of margin) is absorbed at zero —
  /// a virtual broker writing off the debit — so the position can always be
  /// closed instead of tripping the balance ≥ 0 constraint.
  private leveragedWalletAfterClose(
    wallet: { balanceP: bigint; marginReservedP: bigint },
    close: { balanceDeltaP: bigint; marginReleaseP: bigint },
  ) {
    const balanceP = wallet.balanceP + close.balanceDeltaP;
    const marginReservedP = wallet.marginReservedP - close.marginReleaseP;
    return {
      balanceP: balanceP < 0n ? 0n : balanceP,
      marginReservedP: marginReservedP < 0n ? 0n : marginReservedP,
    };
  }

  private fireOrderFilled(order: Order | null) {
    if (!order || order.status !== OrderStatus.FILLED) return;
    void this.notifications
      .notifyOrderFilled(order)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`order-fill notify failed: ${msg}`);
      });
    // Re-evaluate achievements off the fill (first trade, trade-count
    // milestones, F&O / short / intraday, P&L, diversification). Fire-and-
    // forget — an achievement failure must never affect the trade.
    void this.achievements.evaluate(order.userId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`order-fill achievement eval failed: ${msg}`);
    });
  }

  async place(input: PlaceOrderInput): Promise<Order> {
    // Admin kill-switch — halt all new order placement during an incident.
    if (this.featureFlags.tradingHalted()) {
      throw new ServiceUnavailableException(
        'Trading is temporarily halted. Please try again later.',
      );
    }
    if (input.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const inst = this.scripMaster.getInstrument(input.symbol, input.exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${input.symbol}" not found on ${input.exchange}`,
      );
    }
    // F&O orders must be in multiples of the contract's lot size (commodities
    // trade by the unit, lot 1, so they're never constrained). One exception:
    // squaring off a whole existing position that is an odd size.
    if (!inst.isEquity && inst.lotSize > 1) {
      if (
        input.quantity % inst.lotSize !== 0 &&
        !(await this.exitsWholePosition(input, inst))
      ) {
        throw new BadRequestException(
          `Quantity must be in whole lots — multiple of lot size (${inst.lotSize}) for ${inst.symbol}.`,
        );
      }
    }

    const type = input.type ?? OrderType.MARKET;
    if (type === OrderType.LIMIT) {
      if (input.limitPrice === undefined || input.limitPrice <= 0) {
        throw new BadRequestException('limitPrice is required for LIMIT');
      }
      return this.placeLimit({ ...input, type, inst });
    }
    if (type === OrderType.STOP_LOSS) {
      if (input.triggerPrice === undefined || input.triggerPrice <= 0) {
        throw new BadRequestException('triggerPrice is required for STOP_LOSS');
      }
      return this.placeStopLoss({ ...input, type, inst });
    }
    if (type === OrderType.STOP_LOSS_LIMIT) {
      if (input.triggerPrice === undefined || input.triggerPrice <= 0) {
        throw new BadRequestException(
          'triggerPrice is required for STOP_LOSS_LIMIT',
        );
      }
      if (input.limitPrice === undefined || input.limitPrice <= 0) {
        throw new BadRequestException(
          'limitPrice is required for STOP_LOSS_LIMIT',
        );
      }
      return this.placeStopLossLimit({ ...input, type, inst });
    }
    if (type === OrderType.TRAILING_STOP) {
      if (input.trailAmount === undefined || input.trailAmount <= 0) {
        throw new BadRequestException(
          'trailAmount is required for TRAILING_STOP',
        );
      }
      return this.placeTrailingStop({ ...input, type, inst });
    }
    // MARKET. When the market is OPEN we fill immediately at the live price.
    // When it's CLOSED, we queue an after-market order (AMO): it sits PENDING
    // and the tick-watcher fills it at the open price on the first live tick
    // when the market next opens. (Users wanting a specific price use a LIMIT.)
    //
    // forceFill bypasses the AMO queue for system square-off / expiry
    // settlement: those must settle instantly at the last (close) price, never
    // sit PENDING (a settlement you could cancel isn't a settlement).
    if (!input.forceFill && !this.isTradingOpen(inst.exchange)) {
      return this.placePendingMarket({ ...input, type, inst });
    }
    return this.placeMarket({ ...input, type, inst });
  }

  /// True when this order closes exactly the unreserved remainder of a long
  /// (SELL) or the whole of a legacy short (BUY).
  private async exitsWholePosition(
    input: PlaceOrderInput,
    inst: Instrument,
  ): Promise<boolean> {
    const position = await this.prisma.position.findUnique({
      where: {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product: input.product ?? OrderProduct.DELIVERY,
        },
      },
    });
    if (!position) return false;
    if (input.side === OrderSide.SELL) {
      return (
        position.quantity > 0 &&
        position.quantity - position.reservedQty === input.quantity
      );
    }
    return position.quantity < 0 && -position.quantity === input.quantity;
  }

  /// After-market MARKET order: reserve at the last-known price and queue it
  /// PENDING so the tick-watcher fills it at the open price when the market
  /// next opens. Reuses the LIMIT reservation path; the watcher fires a
  /// pending MARKET unconditionally (vs. on a price threshold).
  private async placePendingMarket(
    input: PlaceOrderInput & { inst: Instrument },
  ) {
    const ltp = await this.fetchLtpRupees(input.inst);
    if (ltp === null) {
      throw new BadRequestException(
        'Live price is unavailable for this symbol right now. Try again shortly.',
      );
    }
    return this.placeLimit(
      { ...input, limitPrice: ltp },
      OrderType.MARKET,
    );
  }

  /// Last traded price (in rupees) for any instrument, or null if the feed has
  /// nothing. SmartAPI's getLtp endpoint only serves cash scrips (NSE/BSE);
  /// F&O (NFO/BFO) must go through the multi-quote endpoint, so route by
  /// instrument type — this is why option MARKET orders used to fail.
  private async fetchLtpRupees(inst: Instrument): Promise<number | null> {
    const fno =
      isFnoInstrumentType(inst.instrumentType) ||
      inst.exchange === 'NFO' ||
      inst.exchange === 'BFO' ||
      // MCX/CDS commodity & currency contracts also aren't served by getLtp.
      inst.exchange === 'MCX' ||
      inst.exchange === 'CDS' ||
      inst.exchange === 'NCO';
    if (fno) {
      // cache: false — an order fills at this price, so it must be fresh, not
      // a value up to a couple of seconds old from the shared quote cache.
      const rows = await this.smartapi.getMultiQuote(
        { [inst.exchange]: [inst.token] },
        'LTP',
        false,
      );
      const ltp = rows[0]?.ltp;
      return ltp && ltp > 0 ? ltp : null;
    }
    const quote = await this.smartapi.getLtp({
      exchange: inst.exchange,
      tradingsymbol: inst.symbol,
      symboltoken: inst.token,
    });
    return quote.ltp && quote.ltp > 0 ? quote.ltp : null;
  }

  private async placeMarket(input: PlaceOrderInput & { inst: Instrument }) {
    const { inst } = input;
    // Paper-trading simulator: a MARKET order fills at the latest available
    // price for ANY instrument (cash or F&O). When the market is shut the feed
    // returns the prior close, which is a perfectly acceptable fill here — no
    // real capital is at risk, and hard-blocking off-hours just confuses
    // learners. (The admin trading-halt kill-switch still gates `place()`.)
    const ltp = await this.fetchLtpRupees(inst);
    if (ltp === null) {
      throw new BadRequestException(
        'Live price is unavailable for this symbol right now. Try a LIMIT order to queue at your target price.',
      );
    }
    const fillPriceP = rupeesToPaise(ltp);
    const notionalP = fillPriceP * BigInt(input.quantity);
    const product = input.product ?? OrderProduct.DELIVERY;
    const feesP = this.feesFor(
      input.side,
      inst.exchange,
      inst.symbol,
      notionalP,
      product,
    );

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallet.getForUpdate(input.userId, tx);
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
        },
      };
      const position = await tx.position.findUnique({ where: positionKey });

      const currentQty = position?.quantity ?? 0;
      const qty = input.quantity;
      const delta = input.side === OrderSide.BUY ? qty : -qty;
      const newQty = currentQty + delta;
      // Cross-zero orders are ambiguous: close N then open M is two trades.
      if (currentQty > 0 && newQty < 0) {
        throw new BadRequestException(
          'Order crosses zero. Split into a close order and an open order.',
        );
      }
      if (currentQty < 0 && newQty > 0) {
        throw new BadRequestException(
          'Order crosses zero. Split into a cover order and a fresh long.',
        );
      }
      let leveragedOrder = false;
      if (input.side === OrderSide.BUY) {
        if (currentQty < 0) {
          // COVER short. Debit cost from balance, release proportional margin,
          // book realized P&L = (avgShortPrice - fillPrice) × qty - fees.
          const totalCost = notionalP + feesP;
          if (this.available(wallet) < totalCost) {
            throw new BadRequestException('INSUFFICIENT_FUNDS');
          }
          const newAbsQty = Math.abs(newQty);
          const newMarginP = requiredMarginP(
            newAbsQty,
            position!.avgPriceP,
            inst.name,
          );
          const marginReleaseP = position!.marginP - newMarginP;
          await tx.wallet.update({
            where: { userId: input.userId },
            data: {
              balanceP: wallet.balanceP - totalCost,
              marginReservedP: wallet.marginReservedP - marginReleaseP,
            },
          });
          const realized =
            (position!.avgPriceP - fillPriceP) * BigInt(qty) - feesP;
          await tx.position.update({
            where: positionKey,
            data: {
              quantity: newQty,
              marginP: newMarginP,
              realizedPnLP: position!.realizedPnLP + realized,
            },
          });
        } else if (this.buyIsLeveraged(inst, position)) {
          // FUTURES LONG on margin: block the initial margin (it stays in the
          // balance) and pay only the fees — like a real broker, a lot of
          // NIFTY needs ~12% of its contract value, not all of it.
          leveragedOrder = true;
          const marginP = futuresMarginP(notionalP, inst.exchange, inst.name);
          if (this.available(wallet) < marginP + feesP) {
            throw new BadRequestException('INSUFFICIENT_MARGIN');
          }
          await tx.wallet.update({
            where: { userId: input.userId },
            data: {
              balanceP: wallet.balanceP - feesP,
              marginReservedP: wallet.marginReservedP + marginP,
            },
          });
          await this.upsertLongPosition(tx, input, inst, fillPriceP, position, {
            leveraged: true,
            marginAddP: marginP,
          });
        } else {
          // LONG OPEN (or add to long) — pays the full value (cash equity,
          // option premium, legacy full-value futures).
          const totalCost = notionalP + feesP;
          if (this.available(wallet) < totalCost) {
            throw new BadRequestException('INSUFFICIENT_FUNDS');
          }
          await tx.wallet.update({
            where: { userId: input.userId },
            data: { balanceP: wallet.balanceP - totalCost },
          });
          await this.upsertLongPosition(tx, input, inst, fillPriceP, position);
        }
      } else {
        // SELL
        if (currentQty > 0) {
          const availableQty = currentQty - position!.reservedQty;
          if (availableQty < qty) {
            throw new BadRequestException('INSUFFICIENT_QUANTITY');
          }
          if (position!.leveraged) {
            // CLOSE margined futures long: settle the P&L, unblock margin.
            leveragedOrder = true;
            const close = this.leveragedClose(position!, qty, fillPriceP, feesP);
            await tx.wallet.update({
              where: { userId: input.userId },
              data: this.leveragedWalletAfterClose(wallet, close),
            });
            await tx.position.update({
              where: positionKey,
              data: {
                quantity: newQty,
                marginP: position!.marginP - close.marginReleaseP,
                realizedPnLP: position!.realizedPnLP + close.realizedP,
              },
            });
          } else {
            // CLOSE cash long — sale proceeds come back to the balance.
            await tx.wallet.update({
              where: { userId: input.userId },
              data: { balanceP: wallet.balanceP + notionalP - feesP },
            });
            const realized =
              (fillPriceP - position!.avgPriceP) * BigInt(qty) - feesP;
            await tx.position.update({
              where: positionKey,
              data: {
                quantity: newQty,
                realizedPnLP: position!.realizedPnLP + realized,
              },
            });
          }
        } else {
          // Short-selling is disabled — you can only sell holdings you own.
          // (currentQty <= 0 here means there's no long position to reduce.)
          throw new BadRequestException(
            'You can only sell holdings you own. Short-selling is disabled.',
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          side: input.side,
          type: OrderType.MARKET,
          product,
          origin: input.origin ?? OrderOrigin.USER,
          quantity: input.quantity,
          fillPriceP,
          feesP,
          leveraged: leveragedOrder,
          status: OrderStatus.FILLED,
          filledAt: new Date(),
        },
      });
      this.logger.log(
        `[${input.userId}] MARKET ${product} ${input.side} ${input.quantity} ${inst.name} @ ₹${ltp}`,
      );
      return order;
    }).then((order) => {
      this.fireOrderFilled(order);
      return order;
    });
  }

  /// `orderType` is LIMIT for a real limit order; placePendingMarket passes
  /// MARKET to queue an after-market order through the same reservation path.
  private async placeLimit(
    input: PlaceOrderInput & { inst: Instrument },
    orderType: OrderType = OrderType.LIMIT,
  ) {
    const { inst } = input;
    const product = input.product ?? OrderProduct.DELIVERY;
    const limitPriceP = rupeesToPaise(input.limitPrice!);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallet.getForUpdate(input.userId, tx);
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
        },
      };

      let leveraged = false;
      let cashReservedP = 0n;
      if (input.side === OrderSide.BUY) {
        const position = await tx.position.findUnique({ where: positionKey });
        leveraged = this.buyIsLeveraged(inst, position);
        cashReservedP = this.buyCommitP({
          exchange: inst.exchange,
          tradingsymbol: inst.symbol,
          underlying: inst.name,
          priceP: limitPriceP,
          quantity: input.quantity,
          product,
          leveraged,
        });
        if (this.available(wallet) < cashReservedP) {
          throw new BadRequestException(
            leveraged ? 'INSUFFICIENT_MARGIN' : 'INSUFFICIENT_FUNDS',
          );
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + cashReservedP },
        });
      } else {
        const position = await tx.position.findUnique({ where: positionKey });
        const availableQty = position
          ? position.quantity - position.reservedQty
          : 0;
        const closingLong = availableQty >= input.quantity;
        if (closingLong) {
          await tx.position.update({
            where: positionKey,
            data: { reservedQty: position!.reservedQty + input.quantity },
          });
        } else {
          // Short-selling is disabled — only closing/reducing a long is
          // allowed. Distinguish "hold some but not enough" from "hold none".
          throw new BadRequestException(
            position && position.quantity > 0
              ? 'INSUFFICIENT_QUANTITY'
              : 'You can only sell holdings you own. Short-selling is disabled.',
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          side: input.side,
          type: orderType,
          product,
          quantity: input.quantity,
          limitPriceP,
          leveraged,
          cashReservedP,
          status: OrderStatus.PENDING,
        },
      });
      this.logger.log(
        `[${input.userId}] ${orderType} ${product} ${input.side} ${input.quantity} ${inst.name} @ ₹${input.limitPrice} (pending)`,
      );
      return order;
    });
  }

  private async placeStopLoss(input: PlaceOrderInput & { inst: Instrument }) {
    const { inst } = input;
    const product = input.product ?? OrderProduct.DELIVERY;
    const triggerPriceP = rupeesToPaise(input.triggerPrice!);

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallet.getForUpdate(input.userId, tx);
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
        },
      };

      let leveraged = false;
      let cashReservedP = 0n;
      if (input.side === OrderSide.BUY) {
        const position = await tx.position.findUnique({ where: positionKey });
        leveraged = this.buyIsLeveraged(inst, position);
        cashReservedP = this.buyCommitP({
          exchange: inst.exchange,
          tradingsymbol: inst.symbol,
          underlying: inst.name,
          priceP: triggerPriceP,
          quantity: input.quantity,
          product,
          leveraged,
        });
        if (this.available(wallet) < cashReservedP) {
          throw new BadRequestException(
            leveraged ? 'INSUFFICIENT_MARGIN' : 'INSUFFICIENT_FUNDS',
          );
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + cashReservedP },
        });
      } else {
        const position = await tx.position.findUnique({ where: positionKey });
        const availableQty = position
          ? position.quantity - position.reservedQty
          : 0;
        if (availableQty >= input.quantity) {
          await tx.position.update({
            where: positionKey,
            data: { reservedQty: position!.reservedQty + input.quantity },
          });
        } else {
          // Short-selling is disabled — only closing/reducing a long is
          // allowed. Distinguish "hold some but not enough" from "hold none".
          throw new BadRequestException(
            position && position.quantity > 0
              ? 'INSUFFICIENT_QUANTITY'
              : 'You can only sell holdings you own. Short-selling is disabled.',
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          side: input.side,
          type: OrderType.STOP_LOSS,
          product,
          quantity: input.quantity,
          triggerPriceP,
          leveraged,
          cashReservedP,
          status: OrderStatus.PENDING,
        },
      });
      this.logger.log(
        `[${input.userId}] STOP_LOSS ${product} ${input.side} ${input.quantity} ${inst.name} trigger ₹${input.triggerPrice} (pending)`,
      );
      return order;
    });
  }

  private async placeStopLossLimit(
    input: PlaceOrderInput & { inst: Instrument },
  ) {
    const { inst } = input;
    const triggerPriceP = rupeesToPaise(input.triggerPrice!);
    const limitPriceP = rupeesToPaise(input.limitPrice!);
    // BUY reserves cash up to the worst-case fill (limitPrice × qty, or its
    // margin for futures, plus fees); SELL reserves the qty itself.
    const product = input.product ?? OrderProduct.DELIVERY;

    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallet.getForUpdate(input.userId, tx);
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
        },
      };

      let leveraged = false;
      let cashReservedP = 0n;
      if (input.side === OrderSide.BUY) {
        const position = await tx.position.findUnique({ where: positionKey });
        leveraged = this.buyIsLeveraged(inst, position);
        cashReservedP = this.buyCommitP({
          exchange: inst.exchange,
          tradingsymbol: inst.symbol,
          underlying: inst.name,
          priceP: limitPriceP,
          quantity: input.quantity,
          product,
          leveraged,
        });
        if (this.available(wallet) < cashReservedP) {
          throw new BadRequestException(
            leveraged ? 'INSUFFICIENT_MARGIN' : 'INSUFFICIENT_FUNDS',
          );
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + cashReservedP },
        });
      } else {
        const position = await tx.position.findUnique({ where: positionKey });
        const availableQty = position
          ? position.quantity - position.reservedQty
          : 0;
        if (availableQty >= input.quantity) {
          await tx.position.update({
            where: positionKey,
            data: { reservedQty: position!.reservedQty + input.quantity },
          });
        } else {
          // Short-selling is disabled — only closing/reducing a long is
          // allowed. Distinguish "hold some but not enough" from "hold none".
          throw new BadRequestException(
            position && position.quantity > 0
              ? 'INSUFFICIENT_QUANTITY'
              : 'You can only sell holdings you own. Short-selling is disabled.',
          );
        }
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          side: input.side,
          type: OrderType.STOP_LOSS_LIMIT,
          product,
          quantity: input.quantity,
          triggerPriceP,
          limitPriceP,
          leveraged,
          cashReservedP,
          status: OrderStatus.PENDING,
        },
      });
      this.logger.log(
        `[${input.userId}] SL-L ${product} ${input.side} ${input.quantity} ${inst.name} trigger ₹${input.triggerPrice} limit ₹${input.limitPrice} (pending)`,
      );
      return order;
    });
  }

  private async placeTrailingStop(
    input: PlaceOrderInput & { inst: Instrument },
  ) {
    const { inst } = input;
    const ltp = await this.fetchLtpRupees(inst);
    if (ltp === null) {
      throw new BadRequestException(
        'Live price is unavailable for this symbol right now. Try again shortly.',
      );
    }
    const ltpP = rupeesToPaise(ltp);
    const trailAmountP = rupeesToPaise(input.trailAmount!);
    const product = input.product ?? OrderProduct.DELIVERY;

    // BUY: trigger sits ABOVE LTP, ratchets DOWN as price falls, fires on bounce.
    // SELL: trigger sits BELOW LTP, ratchets UP as price rises, fires on retracement.
    const isBuy = input.side === OrderSide.BUY;
    if (!isBuy && trailAmountP >= ltpP) {
      throw new BadRequestException(
        'trailAmount must be less than the current LTP for SELL trailing',
      );
    }
    const initialTriggerP = isBuy ? ltpP + trailAmountP : ltpP - trailAmountP;

    return this.prisma.$transaction(async (tx) => {
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: input.userId,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
        },
      };

      let leveraged = false;
      let cashReservedP = 0n;
      if (isBuy) {
        const wallet = await this.wallet.getForUpdate(input.userId, tx);
        const position = await tx.position.findUnique({ where: positionKey });
        leveraged = this.buyIsLeveraged(inst, position);
        cashReservedP = this.buyCommitP({
          exchange: inst.exchange,
          tradingsymbol: inst.symbol,
          underlying: inst.name,
          priceP: initialTriggerP,
          quantity: input.quantity,
          product,
          leveraged,
        });
        if (this.available(wallet) < cashReservedP) {
          throw new BadRequestException(
            leveraged ? 'INSUFFICIENT_MARGIN' : 'INSUFFICIENT_FUNDS',
          );
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + cashReservedP },
        });
      } else {
        const position = await tx.position.findUnique({ where: positionKey });
        if (!position) {
          throw new BadRequestException('INSUFFICIENT_QUANTITY');
        }
        const availableQty = position.quantity - position.reservedQty;
        if (availableQty < input.quantity) {
          throw new BadRequestException('INSUFFICIENT_QUANTITY');
        }
        await tx.position.update({
          where: positionKey,
          data: { reservedQty: position.reservedQty + input.quantity },
        });
      }

      const order = await tx.order.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          side: input.side,
          type: OrderType.TRAILING_STOP,
          product,
          quantity: input.quantity,
          triggerPriceP: initialTriggerP,
          trailAmountP,
          leveraged,
          cashReservedP,
          status: OrderStatus.PENDING,
        },
      });
      this.logger.log(
        `[${input.userId}] TRAILING_STOP ${product} ${input.side} ${input.quantity} ${inst.name} trail ₹${input.trailAmount} initial trigger ₹${Number(initialTriggerP) / 100}`,
      );
      return order;
    });
  }

  /**
   * Bumps the dynamic trigger of a TRAILING_STOP order. For SELL trailing,
   * trigger ratchets UP (newTrigger > current); for BUY trailing, it ratchets
   * DOWN (newTrigger < current). For BUY orders the wallet's reservedP also
   * decreases by the delta * quantity so we don't over-reserve cash.
   * Called by LimitWatcherService on favorable ticks.
   */
  async updateTrailingTrigger(
    orderId: string,
    newTriggerP: bigint,
    side: OrderSide,
  ): Promise<void> {
    if (side === OrderSide.SELL) {
      await this.prisma.order.updateMany({
        where: {
          id: orderId,
          status: OrderStatus.PENDING,
          type: OrderType.TRAILING_STOP,
          triggerPriceP: { lt: newTriggerP },
        },
        data: { triggerPriceP: newTriggerP },
      });
      return;
    }
    // BUY trailing: also release cash equal to (oldTrigger - newTrigger) × qty.
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (
        !order ||
        order.status !== OrderStatus.PENDING ||
        order.type !== OrderType.TRAILING_STOP ||
        order.triggerPriceP === null ||
        order.triggerPriceP <= newTriggerP
      ) {
        return;
      }
      let release: bigint;
      let cashReservedP = order.cashReservedP;
      if (order.cashReservedP > 0n) {
        // Exact-reservation order: re-size the hold at the new trigger.
        const next = this.buyCommitP({
          exchange: order.exchange,
          tradingsymbol: order.tradingsymbol,
          underlying: order.symbol,
          priceP: newTriggerP,
          quantity: order.quantity,
          product: order.product,
          leveraged: order.leveraged,
        });
        release = order.cashReservedP - next;
        if (release < 0n) release = 0n;
        cashReservedP = order.cashReservedP - release;
      } else {
        // Legacy order reserved threshold × qty.
        release = (order.triggerPriceP - newTriggerP) * BigInt(order.quantity);
      }
      await tx.order.update({
        where: { id: orderId },
        data: { triggerPriceP: newTriggerP, cashReservedP },
      });
      const wallet = await this.wallet.getForUpdate(order.userId, tx);
      await tx.wallet.update({
        where: { userId: order.userId },
        data: { reservedP: wallet.reservedP - release },
      });
    });
  }

  /**
   * Promotes a STOP_LOSS_LIMIT order to a plain LIMIT after its trigger price
   * has been crossed. Reservation amounts are unchanged because BUY SL-L
   * already reserved at limitPrice and SELL SL-L already reserved qty.
   */
  async convertStopLossLimitToLimit(orderId: string): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (
        !order ||
        order.status !== OrderStatus.PENDING ||
        order.type !== OrderType.STOP_LOSS_LIMIT ||
        order.limitPriceP === null
      ) {
        return null;
      }
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { type: OrderType.LIMIT },
      });
      this.logger.log(
        `SL-L triggered → LIMIT ${orderId} ${order.side} ${order.quantity} ${order.symbol} @ limit ₹${Number(order.limitPriceP) / 100}`,
      );
      return updated;
    });
  }

  /** Triggered by LimitWatcherService when a tick crosses a pending order. */
  async fillLimit(orderId: string, ltpRupees: number): Promise<Order | null> {
    const fillPriceP = rupeesToPaise(ltpRupees);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (
        !order ||
        order.status !== OrderStatus.PENDING ||
        (order.type !== OrderType.LIMIT &&
          order.type !== OrderType.STOP_LOSS &&
          order.type !== OrderType.TRAILING_STOP &&
          order.type !== OrderType.MARKET)
      ) {
        return null;
      }
      // Defense-in-depth: never settle a fill while THIS order's market is
      // closed (incl. weekday trading holidays), even if a caller forgets the
      // session check. Gated per exchange so MCX orders fill in the evening
      // session (to 23:30/23:55) while equity orders stay bound to 15:30.
      if (!this.isTradingOpen(order.exchange)) return null;
      // For a queued after-market MARKET order the reservation reference is its
      // limitPriceP (the last-known price captured at placement); it still fills
      // at the live tick price below.
      const thresholdP =
        order.type === OrderType.LIMIT || order.type === OrderType.MARKET
          ? order.limitPriceP
          : order.triggerPriceP;
      if (thresholdP === null) return null;
      const wallet = await this.wallet.getForUpdate(order.userId, tx);
      const positionKey = {
        userId_symboltoken_exchange_product: {
          userId: order.userId,
          symboltoken: order.symboltoken,
          exchange: order.exchange,
          product: order.product,
        },
      };
      const position = await tx.position.findUnique({ where: positionKey });
      const reservedP =
        order.side === OrderSide.BUY ? this.buyReservationOf(order) : 0n;
      const notionalP = fillPriceP * BigInt(order.quantity);
      const feesP = this.feesFor(
        order.side,
        order.exchange,
        order.tradingsymbol,
        notionalP,
        order.product,
      );

      // Releases this BUY's hold and marks it REJECTED — used whenever the
      // fill can't be honoured, so a resting order can never push a balance
      // negative (or retry forever against the DB constraint).
      const rejectBuy = async (reason: string) => {
        await tx.wallet.update({
          where: { userId: order.userId },
          data: { reservedP: wallet.reservedP - reservedP },
        });
        return tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.REJECTED, rejectReason: reason },
        });
      };

      if (order.side === OrderSide.BUY) {
        const currentQty = position?.quantity ?? 0;
        // Cash this user could spend on this fill once its own hold is freed.
        const spendableP = this.available(wallet) + reservedP;
        if (currentQty < 0) {
          // COVER short fill. If a cover would cross zero into a long, reject
          // — same logic as placeMarket's cross-zero guard, applied at fill time.
          const newQty = currentQty + order.quantity;
          if (newQty > 0) {
            return rejectBuy(
              'BUY would cross zero on existing short; split into cover + fresh long',
            );
          }
          if (spendableP < notionalP + feesP) {
            return rejectBuy('Insufficient funds to cover at the fill price');
          }
          const newAbsQty = Math.abs(newQty);
          const newMarginP = requiredMarginP(
            newAbsQty,
            position!.avgPriceP,
            order.symbol,
          );
          const marginReleaseP = position!.marginP - newMarginP;
          await tx.wallet.update({
            where: { userId: order.userId },
            data: {
              balanceP: wallet.balanceP - notionalP - feesP,
              reservedP: wallet.reservedP - reservedP,
              marginReservedP: wallet.marginReservedP - marginReleaseP,
            },
          });
          const realized =
            (position!.avgPriceP - fillPriceP) * BigInt(order.quantity) - feesP;
          await tx.position.update({
            where: positionKey,
            data: {
              quantity: newQty,
              marginP: newMarginP,
              realizedPnLP: position!.realizedPnLP + realized,
            },
          });
        } else if (currentQty > 0 && position!.leveraged !== order.leveraged) {
          // The open position was opened in the other mode (margined vs full
          // value) after this order was placed — mixing them would corrupt
          // the margin accounting.
          return rejectBuy(
            'Position changed since this order was placed — please place it again',
          );
        } else if (order.leveraged) {
          // Futures BUY on margin: lock the initial margin at the FILL price,
          // pay only the fees. A gap at the open can raise the margin beyond
          // what was held — reject cleanly rather than over-commit.
          const marginP = futuresMarginP(notionalP, order.exchange, order.symbol);
          if (spendableP < marginP + feesP) {
            return rejectBuy(
              order.type === OrderType.MARKET
                ? 'Insufficient margin to fill at the market-open price'
                : 'Insufficient margin to fill at the trigger price',
            );
          }
          await tx.wallet.update({
            where: { userId: order.userId },
            data: {
              balanceP: wallet.balanceP - feesP,
              reservedP: wallet.reservedP - reservedP,
              marginReservedP: wallet.marginReservedP + marginP,
            },
          });
          await this.upsertLongPositionRaw(tx, order, fillPriceP, position, {
            leveraged: true,
            marginAddP: marginP,
          });
        } else {
          // Full-value BUY. An after-market MARKET order reserved at the prior
          // price, and a stop fills at whatever trades past its trigger, so the
          // live cost can exceed the hold — reject cleanly rather than let the
          // balance go negative.
          if (spendableP < notionalP + feesP) {
            return rejectBuy(
              order.type === OrderType.MARKET
                ? 'Insufficient funds to fill at the market-open price'
                : 'Insufficient funds to fill at the trigger price',
            );
          }
          await tx.wallet.update({
            where: { userId: order.userId },
            data: {
              balanceP: wallet.balanceP - notionalP - feesP,
              reservedP: wallet.reservedP - reservedP,
            },
          });
          await this.upsertLongPositionRaw(tx, order, fillPriceP, position);
        }
      } else if (order.shortIntent) {
        // Short-open fill. Race-check: refuse if a long appeared meanwhile.
        if (position && position.quantity > 0) {
          await tx.wallet.update({
            where: { userId: order.userId },
            data: {
              marginReservedP:
                wallet.marginReservedP - order.reservedMarginP,
            },
          });
          return tx.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.REJECTED,
              rejectReason:
                'Long position appeared after short-limit placement',
            },
          });
        }
        const oldAbsQty = position ? Math.abs(position.quantity) : 0;
        const newAbsQty = oldAbsQty + order.quantity;
        const newAvgP = position
          ? (position.avgPriceP * BigInt(oldAbsQty) +
              fillPriceP * BigInt(order.quantity)) /
            BigInt(newAbsQty)
          : fillPriceP;
        const newMarginP = requiredMarginP(newAbsQty, newAvgP, order.symbol);
        const oldPosMarginP = position?.marginP ?? 0n;
        // Net change to wallet.marginReservedP:
        //   release the place-time reservation, lock the actual new total
        //   minus what the existing position already had locked.
        const marginDeltaForWallet =
          newMarginP - oldPosMarginP - order.reservedMarginP;
        const newQty = (position?.quantity ?? 0) - order.quantity;
        await tx.wallet.update({
          where: { userId: order.userId },
          data: {
            balanceP: wallet.balanceP + notionalP - feesP,
            marginReservedP: wallet.marginReservedP + marginDeltaForWallet,
          },
        });
        if (position) {
          await tx.position.update({
            where: positionKey,
            data: {
              quantity: newQty,
              avgPriceP: newAvgP,
              marginP: newMarginP,
            },
          });
        } else {
          await tx.position.create({
            data: {
              userId: order.userId,
              symbol: order.symbol,
              tradingsymbol: order.tradingsymbol,
              symboltoken: order.symboltoken,
              exchange: order.exchange,
              product: order.product,
              quantity: newQty,
              avgPriceP: newAvgP,
              marginP: newMarginP,
            },
          });
        }
      } else {
        if (!position || position.reservedQty < order.quantity) {
          throw new Error('SELL fill missing reserved qty');
        }
        if (position.leveraged) {
          // Close margined futures long: settle P&L, unblock margin.
          const close = this.leveragedClose(
            position,
            order.quantity,
            fillPriceP,
            feesP,
          );
          await tx.position.update({
            where: positionKey,
            data: {
              quantity: position.quantity - order.quantity,
              reservedQty: position.reservedQty - order.quantity,
              marginP: position.marginP - close.marginReleaseP,
              realizedPnLP: position.realizedPnLP + close.realizedP,
            },
          });
          await tx.wallet.update({
            where: { userId: order.userId },
            data: this.leveragedWalletAfterClose(wallet, close),
          });
        } else {
          const realized =
            (fillPriceP - position.avgPriceP) * BigInt(order.quantity) - feesP;
          await tx.position.update({
            where: positionKey,
            data: {
              quantity: position.quantity - order.quantity,
              reservedQty: position.reservedQty - order.quantity,
              realizedPnLP: position.realizedPnLP + realized,
            },
          });
          await tx.wallet.update({
            where: { userId: order.userId },
            data: { balanceP: wallet.balanceP + notionalP - feesP },
          });
        }
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FILLED,
          fillPriceP,
          feesP,
          leveraged:
            order.side === OrderSide.SELL
              ? (position?.leveraged ?? false)
              : order.leveraged,
          filledAt: new Date(),
        },
      });
      this.logger.log(
        `${order.type} FILLED ${orderId} ${order.side} ${order.quantity} ${order.symbol} @ ₹${ltpRupees}`,
      );
      // Fire notification *after* the transaction commits.
      queueMicrotask(() => this.fireOrderFilled(updated));
      return updated;
    });
  }

  /// Edits a pending order's price and/or quantity in place without
  /// cancel-then-recreate. The order id stays stable so the user's
  /// orders list and any client-side state doesn't churn.
  ///
  /// Reservation math: we compute the delta between the old and new
  /// reservation amounts and apply it atomically. For BUY orders the
  /// delta lands on `wallet.reservedP`; for SELL orders on
  /// `position.reservedQty`. An insufficient-funds / insufficient-qty
  /// check fires before the mutation so a too-aggressive edit can't
  /// drive the wallet negative.
  ///
  /// Order-type-specific rules:
  ///   * LIMIT             — limitPrice + quantity
  ///   * STOP_LOSS         — triggerPrice + quantity
  ///   * STOP_LOSS_LIMIT   — triggerPrice + limitPrice + quantity
  ///   * TRAILING_STOP     — triggerPrice + quantity (trail amount is
  ///                          immutable; cancel+replace if you need to
  ///                          change it)
  /// MARKET orders can't be modified — they fill at the next tick.
  async modify(
    userId: string,
    orderId: string,
    patch: { quantity?: number; limitPrice?: number; triggerPrice?: number },
  ): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Only pending orders can be modified');
      }
      if (order.type === OrderType.MARKET) {
        throw new BadRequestException(
          'Market orders fill at the next tick and cannot be modified',
        );
      }
      if (order.shortIntent) {
        // Short-open orders carry a margin reservation that depends on
        // an LTP fetch; supporting modify would need to re-quote SmartAPI
        // mid-tx. Out of scope — cancel and re-place is the supported flow.
        throw new BadRequestException(
          'Short-intent orders cannot be modified; cancel and re-place',
        );
      }

      const newQty = patch.quantity ?? order.quantity;
      if (!Number.isInteger(newQty) || newQty <= 0) {
        throw new BadRequestException('Quantity must be a positive integer');
      }

      const newLimitP =
        patch.limitPrice != null
          ? rupeesToPaise(patch.limitPrice)
          : order.limitPriceP;
      const newTriggerP =
        patch.triggerPrice != null
          ? rupeesToPaise(patch.triggerPrice)
          : order.triggerPriceP;
      if (newLimitP !== null && newLimitP <= 0n) {
        throw new BadRequestException('Limit price must be positive');
      }
      if (newTriggerP !== null && newTriggerP <= 0n) {
        throw new BadRequestException('Trigger price must be positive');
      }

      // The "threshold" is whichever price the reservation is sized
      // against. Same lookup as cancel(); keep them in sync if you add
      // a new order type.
      const thresholdOldP =
        order.type === OrderType.LIMIT
          ? order.limitPriceP
          : order.type === OrderType.STOP_LOSS
            ? order.triggerPriceP
            : order.type === OrderType.STOP_LOSS_LIMIT
              ? order.limitPriceP
              : order.type === OrderType.TRAILING_STOP
                ? order.triggerPriceP
                : null;
      const thresholdNewP =
        order.type === OrderType.LIMIT
          ? newLimitP
          : order.type === OrderType.STOP_LOSS
            ? newTriggerP
            : order.type === OrderType.STOP_LOSS_LIMIT
              ? newLimitP
              : order.type === OrderType.TRAILING_STOP
                ? newTriggerP
                : null;
      if (thresholdOldP === null || thresholdNewP === null) {
        throw new BadRequestException('Order type does not support modify');
      }

      let cashReservedP = order.cashReservedP;
      if (order.side === OrderSide.BUY) {
        const oldReservedP = this.buyReservationOf(order);
        // Re-size with the same rule placement used (margin or notional,
        // plus fees) — this also upgrades a legacy order to an exact hold.
        const newReservedP = this.buyCommitP({
          exchange: order.exchange,
          tradingsymbol: order.tradingsymbol,
          underlying: order.symbol,
          priceP: thresholdNewP,
          quantity: newQty,
          product: order.product,
          leveraged: order.leveraged,
        });
        const deltaP = newReservedP - oldReservedP;
        const wallet = await this.wallet.getForUpdate(userId, tx);
        if (deltaP > 0n && this.available(wallet) < deltaP) {
          throw new BadRequestException(
            'Insufficient cash to cover the modified reservation',
          );
        }
        await tx.wallet.update({
          where: { userId },
          data: { reservedP: wallet.reservedP + deltaP },
        });
        cashReservedP = newReservedP;
      } else {
        // SELL: only quantity matters for reservedQty. Price changes
        // (trigger/limit) don't touch the position lock.
        const deltaQty = newQty - order.quantity;
        const positionKey = {
          userId_symboltoken_exchange_product: {
            userId,
            symboltoken: order.symboltoken,
            exchange: order.exchange,
            product: order.product,
          },
        };
        const position = await tx.position.findUniqueOrThrow({
          where: positionKey,
        });
        if (deltaQty > 0) {
          const available = position.quantity - position.reservedQty;
          if (available < deltaQty) {
            throw new BadRequestException(
              'Insufficient available quantity to cover the modified order',
            );
          }
        }
        await tx.position.update({
          where: positionKey,
          data: { reservedQty: position.reservedQty + deltaQty },
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          quantity: newQty,
          limitPriceP: newLimitP,
          triggerPriceP: newTriggerP,
          cashReservedP,
        },
      });
      this.logger.log(
        `Modified ${order.type} order ${orderId} qty=${order.quantity}→${newQty}`,
      );
      return updated;
    });
  }

  async cancel(userId: string, orderId: string): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Order not found');
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('Only pending orders can be cancelled');
      }
      // System square-off / expiry settlement orders are never user-cancellable
      // (they should already be FILLED, but guard here for defence in depth).
      if (order.origin !== OrderOrigin.USER) {
        throw new BadRequestException(
          'Automatic square-off orders cannot be cancelled.',
        );
      }
      if (order.shortIntent) {
        // Release the place-time margin reservation.
        const wallet = await this.wallet.getForUpdate(userId, tx);
        await tx.wallet.update({
          where: { userId },
          data: {
            marginReservedP:
              wallet.marginReservedP - order.reservedMarginP,
          },
        });
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
        });
        this.logger.log(`Cancelled short-intent order ${orderId}`);
        return updated;
      }
      if (this.thresholdOf(order) === null) {
        throw new BadRequestException('Order has no reservation to release');
      }

      if (order.side === OrderSide.BUY) {
        const reservedP = this.buyReservationOf(order);
        const wallet = await this.wallet.getForUpdate(userId, tx);
        await tx.wallet.update({
          where: { userId },
          data: { reservedP: wallet.reservedP - reservedP },
        });
      } else {
        const positionKey = {
          userId_symboltoken_exchange_product: {
            userId,
            symboltoken: order.symboltoken,
            exchange: order.exchange,
            product: order.product,
          },
        };
        const position = await tx.position.findUniqueOrThrow({
          where: positionKey,
        });
        await tx.position.update({
          where: positionKey,
          data: { reservedQty: position.reservedQty - order.quantity },
        });
      }

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      this.logger.log(`Cancelled order ${orderId}`);
      return updated;
    });
  }

  /// Closes a whole position at a fixed settlement price — expiry settlement's
  /// fallback for a contract the feed can no longer quote (already expired
  /// and dropped from the scrip master). An exchange cash-settlement, not a
  /// trade, so no fees. The caller cancels resting orders on it first.
  async settleAtPrice(
    positionId: string,
    settlePriceP: bigint,
  ): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      const position = await tx.position.findUnique({
        where: { id: positionId },
      });
      if (!position || position.quantity === 0) return null;
      const wallet = await this.wallet.getForUpdate(position.userId, tx);
      const qty = Math.abs(position.quantity);
      const notionalP = settlePriceP * BigInt(qty);
      let side: OrderSide;
      let realizedP: bigint;
      let walletData: Prisma.WalletUpdateInput;
      if (position.quantity > 0 && position.leveraged) {
        side = OrderSide.SELL;
        const close = this.leveragedClose(position, qty, settlePriceP, 0n);
        realizedP = close.realizedP;
        walletData = this.leveragedWalletAfterClose(wallet, close);
      } else if (position.quantity > 0) {
        side = OrderSide.SELL;
        realizedP = (settlePriceP - position.avgPriceP) * BigInt(qty);
        walletData = { balanceP: wallet.balanceP + notionalP };
      } else {
        // Legacy short: buy back at the settlement price, release its margin.
        side = OrderSide.BUY;
        realizedP = (position.avgPriceP - settlePriceP) * BigInt(qty);
        const balanceP = wallet.balanceP - notionalP;
        const marginReservedP = wallet.marginReservedP - position.marginP;
        walletData = {
          balanceP: balanceP < 0n ? 0n : balanceP,
          marginReservedP: marginReservedP < 0n ? 0n : marginReservedP,
        };
      }
      await tx.wallet.update({
        where: { userId: position.userId },
        data: walletData,
      });
      await tx.position.update({
        where: { id: position.id },
        data: {
          quantity: 0,
          reservedQty: 0,
          marginP: 0n,
          realizedPnLP: position.realizedPnLP + realizedP,
        },
      });
      const order = await tx.order.create({
        data: {
          userId: position.userId,
          symbol: position.symbol,
          tradingsymbol: position.tradingsymbol,
          symboltoken: position.symboltoken,
          exchange: position.exchange,
          side,
          type: OrderType.MARKET,
          product: position.product,
          origin: OrderOrigin.EXPIRY,
          quantity: qty,
          fillPriceP: settlePriceP,
          feesP: 0n,
          leveraged: position.leveraged,
          status: OrderStatus.FILLED,
          filledAt: new Date(),
        },
      });
      this.logger.log(
        `[${position.userId}] EXPIRY settle ${position.tradingsymbol} ${qty} @ ₹${Number(settlePriceP) / 100}`,
      );
      return order;
    });
  }

  async listForExport(
    userId: string,
    from?: Date,
    to?: Date,
  ): Promise<Order[]> {
    const filledAt: { gte?: Date; lte?: Date } = {};
    if (from) filledAt.gte = from;
    if (to) filledAt.lte = to;
    return this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.FILLED,
        ...(from || to ? { filledAt } : {}),
      },
      orderBy: { filledAt: 'desc' },
      take: 10000,
    });
  }

  async list(
    userId: string,
    options: { status?: OrderStatus; limit?: number } = {},
  ): Promise<Order[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return this.prisma.order.findMany({
      where: { userId, ...(options.status && { status: options.status }) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async get(userId: string, id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /// Adds a filled BUY to the long position (weighted-average price). A
  /// leveraged fill also accumulates the margin it blocked; a cash fill that
  /// reopens a fully closed row resets it to cash mode.
  private async upsertLongPosition(
    tx: Prisma.TransactionClient,
    input: PlaceOrderInput,
    inst: Instrument,
    fillPriceP: bigint,
    existing: PositionRow | null,
    margin?: LeveragedFill,
  ) {
    await this.writeLongFill(tx, {
      userId: input.userId,
      symbol: inst.name,
      tradingsymbol: inst.symbol,
      symboltoken: inst.token,
      exchange: inst.exchange,
      product: input.product ?? OrderProduct.DELIVERY,
      quantity: input.quantity,
      fillPriceP,
      existing,
      margin,
    });
  }

  private async upsertLongPositionRaw(
    tx: Prisma.TransactionClient,
    order: Order,
    fillPriceP: bigint,
    existing: PositionRow | null,
    margin?: LeveragedFill,
  ) {
    await this.writeLongFill(tx, {
      userId: order.userId,
      symbol: order.symbol,
      tradingsymbol: order.tradingsymbol,
      symboltoken: order.symboltoken,
      exchange: order.exchange,
      product: order.product,
      quantity: order.quantity,
      fillPriceP,
      existing,
      margin,
    });
  }

  private async writeLongFill(
    tx: Prisma.TransactionClient,
    f: {
      userId: string;
      symbol: string;
      tradingsymbol: string;
      symboltoken: string;
      exchange: string;
      product: OrderProduct;
      quantity: number;
      fillPriceP: bigint;
      existing: PositionRow | null;
      margin?: LeveragedFill;
    },
  ) {
    const positionKey = {
      userId_symboltoken_exchange_product: {
        userId: f.userId,
        symboltoken: f.symboltoken,
        exchange: f.exchange,
        product: f.product,
      },
    };
    const oldQty = f.existing?.quantity ?? 0;
    const oldAvg = f.existing?.avgPriceP ?? 0n;
    const newQty = oldQty + f.quantity;
    const newAvg =
      (oldAvg * BigInt(oldQty) + f.fillPriceP * BigInt(f.quantity)) /
      BigInt(newQty);
    const reopened = oldQty === 0;
    const leveraged = f.margin
      ? true
      : reopened
        ? false
        : (f.existing?.leveraged ?? false);
    const marginP =
      (reopened ? 0n : (f.existing?.marginP ?? 0n)) +
      (f.margin?.marginAddP ?? 0n);
    if (f.existing) {
      await tx.position.update({
        where: positionKey,
        data: { quantity: newQty, avgPriceP: newAvg, leveraged, marginP },
      });
    } else {
      await tx.position.create({
        data: {
          userId: f.userId,
          symbol: f.symbol,
          tradingsymbol: f.tradingsymbol,
          symboltoken: f.symboltoken,
          exchange: f.exchange,
          product: f.product,
          quantity: f.quantity,
          avgPriceP: f.fillPriceP,
          leveraged,
          marginP,
        },
      });
    }
  }
}

interface Instrument {
  name: string;
  symbol: string;
  token: string;
  exchange: Exchange;
  instrumentType: string;
}

interface PositionRow {
  quantity: number;
  avgPriceP: bigint;
  marginP: bigint;
  leveraged: boolean;
}

interface LeveragedFill {
  leveraged: true;
  /** Initial margin this fill blocked (added to the position's marginP). */
  marginAddP: bigint;
}
