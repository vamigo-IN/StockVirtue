import { Injectable, Logger } from '@nestjs/common';
import { DeviceToken, Order } from '@prisma/client';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async sendToUser(
    userId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
    });
    await Promise.all(tokens.map((t) => this.sendToToken(t, payload)));
  }

  async sendToToken(
    device: DeviceToken,
    payload: NotificationPayload,
  ): Promise<void> {
    if (!this.firebase.configured) {
      this.logger.log(
        `[DEV-FCM] → ${device.platform}/${device.token.slice(0, 8)}…: ${payload.title} • ${payload.body}`,
      );
      return;
    }
    try {
      await this.firebase.messaging().send({
        token: device.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        // App was uninstalled or token was rotated. Drop it.
        await this.prisma.deviceToken
          .delete({ where: { token: device.token } })
          .catch(() => {});
        return;
      }
      this.logger.warn(
        `FCM send failed for ${device.token.slice(0, 8)}…: ${(err as Error).message}`,
      );
    }
  }

  /** Hook called from OrdersService after a successful fill. */
  async notifyOrderFilled(order: Order): Promise<void> {
    const price = order.fillPriceP
      ? `₹${(Number(order.fillPriceP) / 100).toFixed(2)}`
      : '?';
    await this.sendToUser(order.userId, {
      title: `${order.side} filled — ${order.symbol}`,
      body: `${order.quantity} @ ${price} (${order.type})`,
      data: {
        kind: 'ORDER_FILLED',
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
      },
    });
    await this.maybeEmailOrderFilled(order, price);
  }

  /** Per-trade email — only for users who opted in (default off). */
  private async maybeEmailOrderFilled(
    order: Order,
    price: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: order.userId },
      select: { emailAlias: true, tradeEmailsOptIn: true },
    });
    if (!user?.emailAlias || !user.tradeEmailsOptIn) return;
    const verb = order.side === 'BUY' ? 'Bought' : 'Sold';
    const product =
      order.product === 'INTRADAY' ? 'Intraday (MIS)' : 'Delivery (CNC)';
    const bodyHtml =
      this.mail.heroCard({
        eyebrow: `${order.side} · Filled`,
        value: `${order.quantity} × ${order.symbol}`,
        caption: `Filled @ ₹${price}`,
        tone: order.side === 'BUY' ? 'green' : 'red',
      }) +
      this.mail.detailTable([
        { label: 'Order type', value: order.type },
        { label: 'Product', value: product },
      ]) +
      this.mail.para(
        'Open the StockVirtue app to review your portfolio and P&amp;L.',
      );
    await this.mail
      .notify(
        user.emailAlias,
        `${verb} ${order.quantity} ${order.symbol} @ ${price}`,
        'Order filled',
        bodyHtml,
        `Your ${order.side} order filled: ${order.quantity} ${order.symbol} @ ${price} (${order.type}).`,
      )
      // Email must never break the fill path.
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`trade-fill email failed: ${msg}`);
      });
  }
}
