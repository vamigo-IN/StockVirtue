import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Order,
  OrderProduct,
  OrderSide,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client';
import { Exchange } from '../common/exchange';
import { computeFees } from '../common/fees';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import {
  isFnoInstrumentType,
  marginRateBps,
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
  ) {}

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
    // F&O orders must be in multiples of the contract's lot size.
    if (!inst.isEquity && inst.lotSize > 1) {
      if (input.quantity % inst.lotSize !== 0) {
        throw new BadRequestException(
          `quantity must be a multiple of lot size (${inst.lotSize}) for ${inst.symbol}`,
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
    return this.placeMarket({ ...input, type, inst });
  }

  /// Last traded price (in rupees) for any instrument, or null if the feed has
  /// nothing. SmartAPI's getLtp endpoint only serves cash scrips (NSE/BSE);
  /// F&O (NFO/BFO) must go through the multi-quote endpoint, so route by
  /// instrument type — this is why option MARKET orders used to fail.
  private async fetchLtpRupees(inst: Instrument): Promise<number | null> {
    const fno =
      isFnoInstrumentType(inst.instrumentType) ||
      inst.exchange === 'NFO' ||
      inst.exchange === 'BFO';
    if (fno) {
      const rows = await this.smartapi.getMultiQuote(
        { [inst.exchange]: [inst.token] },
        'LTP',
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
    const fees = computeFees({
      side: input.side,
      exchange: inst.exchange,
      notionalP,
      intraday: product === OrderProduct.INTRADAY,
    });
    const feesP = fees.total;

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
      const fno = isFnoInstrumentType(inst.instrumentType);

      if (input.side === OrderSide.BUY) {
        if (currentQty < 0) {
          // COVER short. Debit cost from balance, release proportional margin,
          // book realized P&L = (avgShortPrice - fillPrice) × qty - fees.
          const totalCost = notionalP + feesP;
          const available = wallet.balanceP - wallet.reservedP;
          if (available < totalCost) {
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
        } else {
          // LONG OPEN (or add to long) — existing flow.
          const totalCost = notionalP + feesP;
          const available = wallet.balanceP - wallet.reservedP;
          if (available < totalCost) {
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
          // CLOSE long — existing flow.
          const availableQty = currentQty - position!.reservedQty;
          if (availableQty < qty) {
            throw new BadRequestException('INSUFFICIENT_QUANTITY');
          }
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
        } else {
          // SHORT OPEN (or add to short). F&O only.
          if (!fno) {
            throw new BadRequestException(
              'Short selling only allowed on F&O instruments',
            );
          }
          // Weighted avg short price across existing + new contracts.
          const oldAbsQty = Math.abs(currentQty);
          const newAbsQty = oldAbsQty + qty;
          const newAvgP =
            currentQty < 0
              ? (position!.avgPriceP * BigInt(oldAbsQty) +
                  fillPriceP * BigInt(qty)) /
                BigInt(newAbsQty)
              : fillPriceP;
          const newMarginP = requiredMarginP(newAbsQty, newAvgP, inst.name);
          const oldMarginP = position?.marginP ?? 0n;
          const marginDeltaP = newMarginP - oldMarginP;
          const available =
            wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
          if (available < marginDeltaP) {
            throw new BadRequestException('INSUFFICIENT_MARGIN');
          }
          // Receive premium minus fees; lock margin delta.
          await tx.wallet.update({
            where: { userId: input.userId },
            data: {
              balanceP: wallet.balanceP + notionalP - feesP,
              marginReservedP: wallet.marginReservedP + marginDeltaP,
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
                userId: input.userId,
                symbol: inst.name,
                tradingsymbol: inst.symbol,
                symboltoken: inst.token,
                exchange: inst.exchange,
                product,
                quantity: newQty,
                avgPriceP: newAvgP,
                marginP: newMarginP,
              },
            });
          }
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
          quantity: input.quantity,
          fillPriceP,
          feesP,
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

  private async placeLimit(input: PlaceOrderInput & { inst: Instrument }) {
    const { inst } = input;
    const product = input.product ?? OrderProduct.DELIVERY;
    const limitPriceP = rupeesToPaise(input.limitPrice!);
    const reserveP = limitPriceP * BigInt(input.quantity);

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

      if (input.side === OrderSide.BUY) {
        const available = wallet.balanceP - wallet.reservedP;
        if (available < reserveP) {
          throw new BadRequestException('INSUFFICIENT_FUNDS');
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + reserveP },
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
        } else if (
          isFnoInstrumentType(inst.instrumentType) &&
          (!position || position.quantity <= 0)
        ) {
          // SHORT-OPEN intent on F&O. Reserve margin at the limit price.
          const marginP =
            (limitPriceP *
              BigInt(input.quantity) *
              marginRateBps(inst.name)) /
            10000n;
          const available =
            wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
          if (available < marginP) {
            throw new BadRequestException('INSUFFICIENT_MARGIN');
          }
          await tx.wallet.update({
            where: { userId: input.userId },
            data: { marginReservedP: wallet.marginReservedP + marginP },
          });
          const order = await tx.order.create({
            data: {
              userId: input.userId,
              symbol: inst.name,
              tradingsymbol: inst.symbol,
              symboltoken: inst.token,
              exchange: inst.exchange,
              side: input.side,
              type: OrderType.LIMIT,
              product,
              quantity: input.quantity,
              limitPriceP,
              shortIntent: true,
              reservedMarginP: marginP,
              status: OrderStatus.PENDING,
            },
          });
          this.logger.log(
            `[${input.userId}] LIMIT SHORT ${product} SELL ${input.quantity} ${inst.name} @ ₹${input.limitPrice} (pending, margin ₹${Number(marginP) / 100})`,
          );
          return order;
        } else {
          throw new BadRequestException('INSUFFICIENT_QUANTITY');
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
          type: OrderType.LIMIT,
          product,
          quantity: input.quantity,
          limitPriceP,
          status: OrderStatus.PENDING,
        },
      });
      this.logger.log(
        `[${input.userId}] LIMIT ${product} ${input.side} ${input.quantity} ${inst.name} @ ₹${input.limitPrice} (pending)`,
      );
      return order;
    });
  }

  private async placeStopLoss(input: PlaceOrderInput & { inst: Instrument }) {
    const { inst } = input;
    const product = input.product ?? OrderProduct.DELIVERY;
    const triggerPriceP = rupeesToPaise(input.triggerPrice!);
    const reserveP = triggerPriceP * BigInt(input.quantity);

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

      if (input.side === OrderSide.BUY) {
        const available = wallet.balanceP - wallet.reservedP;
        if (available < reserveP) {
          throw new BadRequestException('INSUFFICIENT_FUNDS');
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + reserveP },
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
        } else if (
          isFnoInstrumentType(inst.instrumentType) &&
          (!position || position.quantity <= 0)
        ) {
          // SHORT-OPEN intent via SL. Reserve margin at trigger price.
          const marginP =
            (triggerPriceP *
              BigInt(input.quantity) *
              marginRateBps(inst.name)) /
            10000n;
          const available =
            wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
          if (available < marginP) {
            throw new BadRequestException('INSUFFICIENT_MARGIN');
          }
          await tx.wallet.update({
            where: { userId: input.userId },
            data: { marginReservedP: wallet.marginReservedP + marginP },
          });
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
              shortIntent: true,
              reservedMarginP: marginP,
              status: OrderStatus.PENDING,
            },
          });
          this.logger.log(
            `[${input.userId}] SL SHORT ${product} SELL ${input.quantity} ${inst.name} trigger ₹${input.triggerPrice} (pending, margin ₹${Number(marginP) / 100})`,
          );
          return order;
        } else {
          throw new BadRequestException('INSUFFICIENT_QUANTITY');
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
    // BUY reserves cash up to the worst-case fill (limitPrice × qty); SELL
    // reserves the qty itself.
    const product = input.product ?? OrderProduct.DELIVERY;
    const reserveP = limitPriceP * BigInt(input.quantity);

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

      if (input.side === OrderSide.BUY) {
        const available = wallet.balanceP - wallet.reservedP;
        if (available < reserveP) {
          throw new BadRequestException('INSUFFICIENT_FUNDS');
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + reserveP },
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
        } else if (
          isFnoInstrumentType(inst.instrumentType) &&
          (!position || position.quantity <= 0)
        ) {
          // SHORT-OPEN intent via SL-L. Reserve margin at the limit price
          // (worst-case fill — limit is the floor the SELL can drop to once
          // the trigger fires).
          const marginP =
            (limitPriceP *
              BigInt(input.quantity) *
              marginRateBps(inst.name)) /
            10000n;
          const available =
            wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
          if (available < marginP) {
            throw new BadRequestException('INSUFFICIENT_MARGIN');
          }
          await tx.wallet.update({
            where: { userId: input.userId },
            data: { marginReservedP: wallet.marginReservedP + marginP },
          });
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
              shortIntent: true,
              reservedMarginP: marginP,
              status: OrderStatus.PENDING,
            },
          });
          this.logger.log(
            `[${input.userId}] SL-L SHORT ${product} SELL ${input.quantity} ${inst.name} trigger ₹${input.triggerPrice} limit ₹${input.limitPrice} (pending, margin ₹${Number(marginP) / 100})`,
          );
          return order;
        } else {
          throw new BadRequestException('INSUFFICIENT_QUANTITY');
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

      if (isBuy) {
        const wallet = await this.wallet.getForUpdate(input.userId, tx);
        const reserveP = initialTriggerP * BigInt(input.quantity);
        const available = wallet.balanceP - wallet.reservedP;
        if (available < reserveP) {
          throw new BadRequestException('INSUFFICIENT_FUNDS');
        }
        await tx.wallet.update({
          where: { userId: input.userId },
          data: { reservedP: wallet.reservedP + reserveP },
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
      const delta = order.triggerPriceP - newTriggerP;
      const release = delta * BigInt(order.quantity);
      await tx.order.update({
        where: { id: orderId },
        data: { triggerPriceP: newTriggerP },
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
          order.type !== OrderType.TRAILING_STOP)
      ) {
        return null;
      }
      const thresholdP =
        order.type === OrderType.LIMIT
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
      const reservedP = thresholdP * BigInt(order.quantity);
      const notionalP = fillPriceP * BigInt(order.quantity);
      const fees = computeFees({
        side: order.side,
        exchange: order.exchange,
        notionalP,
        intraday: order.product === OrderProduct.INTRADAY,
      });
      const feesP = fees.total;

      if (order.side === OrderSide.BUY) {
        const currentQty = position?.quantity ?? 0;
        if (currentQty < 0) {
          // COVER short fill. If a cover would cross zero into a long, reject
          // — same logic as placeMarket's cross-zero guard, applied at fill time.
          const newQty = currentQty + order.quantity;
          if (newQty > 0) {
            await tx.wallet.update({
              where: { userId: order.userId },
              data: { reservedP: wallet.reservedP - reservedP },
            });
            return tx.order.update({
              where: { id: orderId },
              data: {
                status: OrderStatus.REJECTED,
                rejectReason:
                  'BUY would cross zero on existing short; split into cover + fresh long',
              },
            });
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
        } else {
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

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FILLED,
          fillPriceP,
          feesP,
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

      if (order.side === OrderSide.BUY) {
        const oldReservedP = thresholdOldP * BigInt(order.quantity);
        const newReservedP = thresholdNewP * BigInt(newQty);
        const deltaP = newReservedP - oldReservedP;
        if (deltaP > 0n) {
          const wallet = await this.wallet.getForUpdate(userId, tx);
          const available =
            wallet.balanceP - wallet.reservedP - wallet.marginReservedP;
          if (available < deltaP) {
            throw new BadRequestException(
              'Insufficient cash to cover the modified reservation',
            );
          }
        }
        const wallet = await this.wallet.getForUpdate(userId, tx);
        await tx.wallet.update({
          where: { userId },
          data: { reservedP: wallet.reservedP + deltaP },
        });
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
      const thresholdP =
        order.type === OrderType.LIMIT
          ? order.limitPriceP
          : order.type === OrderType.STOP_LOSS
            ? order.triggerPriceP
            : order.type === OrderType.STOP_LOSS_LIMIT
              ? order.limitPriceP
              : order.type === OrderType.TRAILING_STOP
                ? order.triggerPriceP
                : null;
      if (thresholdP === null) {
        throw new BadRequestException('Order has no reservation to release');
      }

      if (order.side === OrderSide.BUY) {
        const reservedP = thresholdP * BigInt(order.quantity);
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

  private async upsertLongPosition(
    tx: Prisma.TransactionClient,
    input: PlaceOrderInput,
    inst: Instrument,
    fillPriceP: bigint,
    existing: PositionRow | null,
  ) {
    const product = input.product ?? OrderProduct.DELIVERY;
    const positionKey = {
      userId_symboltoken_exchange_product: {
        userId: input.userId,
        symboltoken: inst.token,
        exchange: inst.exchange,
        product,
      },
    };
    const oldQty = existing?.quantity ?? 0;
    const oldAvg = existing?.avgPriceP ?? 0n;
    const newQty = oldQty + input.quantity;
    const newAvg =
      (oldAvg * BigInt(oldQty) + fillPriceP * BigInt(input.quantity)) /
      BigInt(newQty);
    if (existing) {
      await tx.position.update({
        where: positionKey,
        data: { quantity: newQty, avgPriceP: newAvg },
      });
    } else {
      await tx.position.create({
        data: {
          userId: input.userId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          product,
          quantity: input.quantity,
          avgPriceP: fillPriceP,
        },
      });
    }
  }

  private async upsertLongPositionRaw(
    tx: Prisma.TransactionClient,
    order: Order,
    fillPriceP: bigint,
    existing: PositionRow | null,
  ) {
    const positionKey = {
      userId_symboltoken_exchange_product: {
        userId: order.userId,
        symboltoken: order.symboltoken,
        exchange: order.exchange,
        product: order.product,
      },
    };
    const oldQty = existing?.quantity ?? 0;
    const oldAvg = existing?.avgPriceP ?? 0n;
    const newQty = oldQty + order.quantity;
    const newAvg =
      (oldAvg * BigInt(oldQty) + fillPriceP * BigInt(order.quantity)) /
      BigInt(newQty);
    if (existing) {
      await tx.position.update({
        where: positionKey,
        data: { quantity: newQty, avgPriceP: newAvg },
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
          quantity: order.quantity,
          avgPriceP: fillPriceP,
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
}
