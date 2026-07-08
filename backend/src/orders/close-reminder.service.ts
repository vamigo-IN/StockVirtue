import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { OrderProduct } from '@prisma/client';
import { isMarketOpen } from '../common/market-hours';
import { HolidaysService } from '../market/holidays.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

// 15:10 IST = 09:40 UTC — 20 minutes before the 15:30 close and ahead of the
// 15:20 intraday auto-square, so traders still have time to act on open
// positions before they're closed for them.
function nextRunDelayMs(now = new Date()): number {
  const target = new Date(now);
  target.setUTCHours(9, 40, 0, 0);
  if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}

/**
 * Self-scheduled daily job that reminds users holding an open intraday (MIS)
 * or F&O position that the market is about to close. Mirrors the
 * AutoSquareService / ExpirySettlementService timer pattern (no cron dep).
 */
@Injectable()
export class CloseReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CloseReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly holidays: HolidaysService,
  ) {}

  onModuleInit() {
    this.scheduleNext();
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext() {
    const delay = nextRunDelayMs();
    const fireAt = new Date(Date.now() + delay).toISOString();
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.scheduleNext());
    }, delay);
    this.logger.log(`Next market-close reminder at ${fireAt}`);
  }

  async run(): Promise<{ notified: number }> {
    if (this.running) return { notified: 0 };
    this.running = true;
    try {
      // Only fire on an actual trading day (skip weekends & holidays).
      if (!isMarketOpen(new Date(), this.holidays.getCachedHolidayDates())) {
        this.logger.log('Market-close reminder skipped (market closed today)');
        return { notified: 0 };
      }
      // Users holding an open intraday (MIS) position OR any F&O position.
      const positions = await this.prisma.position.findMany({
        where: {
          quantity: { not: 0 },
          OR: [
            { product: OrderProduct.INTRADAY },
            { exchange: 'NFO' },
            { exchange: 'BFO' },
          ],
        },
        select: { userId: true, product: true, exchange: true },
      });
      // Collapse to one reminder per user, noting what they hold.
      const byUser = new Map<string, { intraday: boolean; fno: boolean }>();
      for (const p of positions) {
        const cur = byUser.get(p.userId) ?? { intraday: false, fno: false };
        if (p.product === OrderProduct.INTRADAY) cur.intraday = true;
        if (p.exchange === 'NFO' || p.exchange === 'BFO') cur.fno = true;
        byUser.set(p.userId, cur);
      }
      let notified = 0;
      for (const [userId, flags] of byUser) {
        const what =
          flags.intraday && flags.fno
            ? 'intraday and F&O positions'
            : flags.intraday
              ? 'intraday (MIS) positions'
              : 'F&O positions';
        const tail = flags.intraday
          ? ' Your intraday positions auto-square at 3:20 PM.'
          : '';
        await this.notifications
          .create(userId, {
            kind: 'reminder',
            title: 'Market closing soon',
            body: `The market closes at 3:30 PM and you still have open ${what}.${tail}`,
          })
          .catch((err: unknown) =>
            this.logger.warn(
              `close reminder failed for ${userId}: ${(err as Error).message}`,
            ),
          );
        notified += 1;
      }
      this.logger.log(`Market-close reminders sent: ${notified}`);
      return { notified };
    } finally {
      this.running = false;
    }
  }
}
