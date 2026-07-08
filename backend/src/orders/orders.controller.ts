import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Order, OrderStatus, User } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Exchange, isExchange } from '../common/exchange';
import { paiseToRupees } from '../common/money';
import { AutoSquareService } from './auto-square.service';
import { BasketOrderDto } from './dto/basket-order.dto';
import { PlaceOrderDto } from './dto/place-order.dto';
import { LimitWatcherService } from './limit-watcher.service';
import { serializeOrder } from './order.serializer';
import { OrdersService } from './orders.service';

const ORDER_STATUSES = Object.values(OrderStatus);

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly limitWatcher: LimitWatcherService,
    private readonly autoSquare: AutoSquareService,
  ) {}

  @Post('auto-square')
  squareIntraday(@CurrentUser() user: User) {
    return this.autoSquare.runForUser(user.id);
  }

  // Each order does an outbound SmartAPI price fetch + a wallet-locking
  // transaction, so cap placement well above real active-trading rates.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post()
  async place(@CurrentUser() user: User, @Body() dto: PlaceOrderDto) {
    const order = await this.orders.place({
      userId: user.id,
      symbol: dto.symbol,
      exchange: this.parseExchange(dto.exchange ?? 'NSE'),
      side: dto.side,
      quantity: dto.quantity,
      type: dto.type,
      product: dto.product,
      limitPrice: dto.limitPrice,
      triggerPrice: dto.triggerPrice,
      trailAmount: dto.trailAmount,
    });
    if (order.status === OrderStatus.PENDING) {
      this.limitWatcher.track(order);
    }
    return serializeOrder(order);
  }

  /// Places every leg sequentially. We deliberately don't wrap the whole
  /// basket in a transaction — each leg's wallet / margin reservation needs
  /// the prior legs to be committed (a multi-leg short, for example, depends
  /// on the long leg's collateral being locked first). If one leg fails,
  /// earlier legs stay in their resulting state and the response surfaces
  /// per-leg success / error so the UI can show what cleared and what didn't.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('basket')
  async placeBasket(@CurrentUser() user: User, @Body() dto: BasketOrderDto) {
    const results: Array<{
      ok: boolean;
      order?: ReturnType<typeof serializeOrder>;
      error?: string;
    }> = [];
    for (const leg of dto.legs) {
      try {
        const order = await this.orders.place({
          userId: user.id,
          symbol: leg.symbol,
          exchange: this.parseExchange(leg.exchange ?? 'NSE'),
          side: leg.side,
          quantity: leg.quantity,
          type: leg.type,
          product: leg.product,
          limitPrice: leg.limitPrice,
          triggerPrice: leg.triggerPrice,
          trailAmount: leg.trailAmount,
        });
        if (order.status === OrderStatus.PENDING) {
          this.limitWatcher.track(order);
        }
        results.push({ ok: true, order: serializeOrder(order) });
      } catch (err) {
        results.push({
          ok: false,
          error: (err as Error).message ?? 'placement failed',
        });
      }
    }
    return {
      filled: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      legs: results,
    };
  }

  @Post(':id/cancel')
  async cancel(@CurrentUser() user: User, @Param('id') id: string) {
    const order = await this.orders.cancel(user.id, id);
    this.limitWatcher.untrack(id);
    return serializeOrder(order);
  }

  /// Edit a pending order's price and/or quantity in place. Returns the
  /// updated order; the limit-watcher is refreshed so the new threshold
  /// drives the next-tick decision.
  @Patch(':id')
  async modify(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body()
    body: { quantity?: number; limitPrice?: number; triggerPrice?: number },
  ) {
    const order = await this.orders.modify(user.id, id, body);
    // Pull the watcher off the old snapshot, then re-track with the
    // freshly-updated row so the new threshold takes effect.
    this.limitWatcher.untrack(id);
    if (order.status === OrderStatus.PENDING) {
      this.limitWatcher.track(order);
    }
    return serializeOrder(order);
  }

  @Get()
  async list(
    @CurrentUser() user: User,
    @Query('limit') limitRaw = '50',
    @Query('status') statusRaw?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 200);
    const status = this.parseStatus(statusRaw);
    const orders = await this.orders.list(user.id, { status, limit });
    return orders.map(serializeOrder);
  }

  @Get('export')
  async export(
    @CurrentUser() user: User,
    @Res({ passthrough: false }) res: Response,
    @Query('format') formatRaw = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const format = formatRaw === 'json' ? 'json' : 'csv';
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    const orders = await this.orders.listForExport(user.id, fromDate, toDate);
    const today = new Date().toISOString().slice(0, 10);
    const filename = `stockvirtue-trades-${today}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(JSON.stringify(orders.map(serializeOrder), null, 2));
      return;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(buildCsv(orders));
  }

  @Get(':id')
  async get(@CurrentUser() user: User, @Param('id') id: string) {
    return serializeOrder(await this.orders.get(user.id, id));
  }

  private parseExchange(value: string): Exchange {
    const upper = value.toUpperCase();
    if (!isExchange(upper)) {
      throw new BadRequestException(`Invalid exchange "${value}"`);
    }
    return upper;
  }

  private parseStatus(value: string | undefined): OrderStatus | undefined {
    if (!value) return undefined;
    const upper = value.toUpperCase() as OrderStatus;
    if (!ORDER_STATUSES.includes(upper)) {
      throw new BadRequestException(`Invalid status "${value}"`);
    }
    return upper;
  }
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : undefined;
}

const CSV_HEADERS = [
  'date',
  'time',
  'symbol',
  'tradingsymbol',
  'exchange',
  'side',
  'type',
  'product',
  'quantity',
  'price',
  'notional',
  'fees',
  'cashFlow',
  'status',
  'orderId',
];

function buildCsv(orders: Order[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const o of orders) {
    const fillPrice = o.fillPriceP !== null ? paiseToRupees(o.fillPriceP) : 0;
    const notional = fillPrice * o.quantity;
    const fees = paiseToRupees(o.feesP);
    const cashFlow = o.side === 'BUY' ? -(notional + fees) : notional - fees;
    const filled = o.filledAt ?? o.createdAt;
    const row = [
      filled.toISOString().slice(0, 10),
      filled.toISOString().slice(11, 19),
      o.symbol,
      o.tradingsymbol,
      o.exchange,
      o.side,
      o.type,
      o.product,
      o.quantity,
      fillPrice.toFixed(2),
      notional.toFixed(2),
      fees.toFixed(2),
      cashFlow.toFixed(2),
      o.status,
      o.id,
    ];
    lines.push(row.map(csvField).join(','));
  }
  return lines.join('\n');
}

function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
