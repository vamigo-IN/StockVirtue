import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AlertStatus, Prisma, User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Exchange, isExchange } from '../common/exchange';
import { rupeesToPaise } from '../common/money';
import { ScripMasterService } from '../market/scrip-master.service';
import { NoticeGateExempt } from '../privacy/notice-gate.decorator';
import { NoticeGateService } from '../privacy/notice-gate.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertWatcherService } from './alert-watcher.service';
import { NotificationsService } from './notifications.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdatePrefsDto } from './dto/update-prefs.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    private readonly watcher: AlertWatcherService,
    private readonly notifications: NotificationsService,
    private readonly gate: NoticeGateService,
  ) {}

  // ── Inbox ────────────────────────────────────────────────────────

  /** The caller's notification history, newest first. */
  @Get()
  inbox(@CurrentUser() user: User) {
    return this.notifications.list(user.id);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: User) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  async readAll(@CurrentUser() user: User) {
    await this.notifications.markAllRead(user.id);
    return { ok: true };
  }

  @Post(':id/read')
  async read(@CurrentUser() user: User, @Param('id') id: string) {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  // ── Device tokens ────────────────────────────────────────────────

  @Post('devices')
  async registerDevice(
    @CurrentUser() user: User,
    @Body() dto: RegisterDeviceDto,
  ) {
    const device = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      update: {
        userId: user.id,
        platform: dto.platform,
        lastSeenAt: new Date(),
      },
      create: {
        userId: user.id,
        token: dto.token,
        platform: dto.platform,
      },
    });
    return { id: device.id, platform: device.platform };
  }

  // Open while the notice gate is on: signing out removes the phone's push
  // token first, "while the session can still say so" (W7 addendum §5.11.3).
  @Delete('devices/:token')
  @NoticeGateExempt()
  async unregisterDevice(
    @CurrentUser() user: User,
    @Param('token') token: string,
  ) {
    await this.prisma.deviceToken.deleteMany({
      where: { token, userId: user.id },
    });
    return { ok: true };
  }

  // ── Email preferences ────────────────────────────────────────────

  // Open while the notice gate is on, withdraw-only: switching the per-trade
  // emails off is withdrawing consent (DPDP s.6(4)); switching them on is
  // gated (W7 addendum §5.11.3).
  @Patch('preferences')
  @NoticeGateExempt()
  async setPreferences(@CurrentUser() user: User, @Body() dto: UpdatePrefsDto) {
    if (dto.tradeEmails) this.gate.assertOpen(user);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { tradeEmailsOptIn: dto.tradeEmails },
      select: { tradeEmailsOptIn: true },
    });
    return { tradeEmails: updated.tradeEmailsOptIn };
  }

  // ── Price alerts ─────────────────────────────────────────────────

  @Get('alerts')
  list(@CurrentUser() user: User) {
    return this.prisma.priceAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  @Post('alerts')
  async create(@CurrentUser() user: User, @Body() dto: CreateAlertDto) {
    // Cap active alerts per user (mirrors the watchlist-count guard) so one
    // account can't create unbounded rows + in-memory watcher entries.
    const activeCount = await this.prisma.priceAlert.count({
      where: { userId: user.id, status: AlertStatus.ACTIVE },
    });
    if (activeCount >= 100) {
      throw new BadRequestException(
        'You have reached the maximum of 100 active price alerts. Delete some to add more.',
      );
    }
    const exchange = this.parseExchange(dto.exchange ?? 'NSE');
    const inst = this.scripMaster.getInstrument(dto.symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${dto.symbol}" not found on ${exchange}`,
      );
    }
    const alert = await this.prisma.priceAlert.create({
      data: {
        userId: user.id,
        symbol: inst.name,
        tradingsymbol: inst.symbol,
        symboltoken: inst.token,
        exchange: inst.exchange,
        condition: dto.condition,
        priceP: rupeesToPaise(dto.price),
        note: dto.note,
      },
    });
    this.watcher.track(alert);
    return alert;
  }

  @Delete('alerts/:id')
  async cancel(@CurrentUser() user: User, @Param('id') id: string) {
    const existing = await this.prisma.priceAlert.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      throw new NotFoundException('Alert not found');
    }
    if (existing.status === AlertStatus.ACTIVE) {
      try {
        await this.prisma.priceAlert.update({
          where: { id },
          data: { status: AlertStatus.CANCELLED },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2025'
        ) {
          throw new NotFoundException('Alert not found');
        }
        throw err;
      }
    }
    this.watcher.untrack(id);
    return { ok: true };
  }

  // For symmetry with limit-watcher debug endpoint.
  @Get('alerts/watcher/status')
  status() {
    return this.watcher.stats();
  }

  private parseExchange(value: string): Exchange {
    const upper = value.toUpperCase();
    if (!isExchange(upper)) {
      throw new BadRequestException(`Invalid exchange "${value}"`);
    }
    return upper;
  }
}
