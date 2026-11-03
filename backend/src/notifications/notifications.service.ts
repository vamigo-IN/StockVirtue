import { Injectable, Logger } from '@nestjs/common';
import { DeviceToken, Notification, Order, Prisma } from '@prisma/client';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeBusService } from '../ticks/realtime-bus.service';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Everything needed to create an inbox notification. */
export interface CreateNotificationInput {
  kind?: string; // info | order | price | achievement | reminder | admin
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SerializedNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  data: unknown;
  read: boolean;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeBusService,
  ) {}

  // ─── Inbox: store + real-time + push ──────────────────────────────────

  private serialize(n: Notification): SerializedNotification {
    return {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      data: n.data ?? null,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    };
  }

  /** FCM data values must be strings. Flatten the payload for the pipe. */
  private toFcmData(
    kind: string,
    id: string,
    data?: Record<string, unknown>,
  ): Record<string, string> {
    const out: Record<string, string> = { kind, notificationId: id };
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) out[k] = String(v);
      }
    }
    return out;
  }

  /**
   * The one place a user-facing notification is born: persist it to the inbox,
   * deliver it in real time to any open socket, and push it via FCM for
   * background delivery. Callers (order fills, alerts, achievements, reminders,
   * admin) go through here so everything lands in the fetchable inbox.
   */
  async create(
    userId: string,
    input: CreateNotificationInput,
  ): Promise<SerializedNotification> {
    const kind = input.kind ?? 'info';
    const row = await this.prisma.notification.create({
      data: {
        userId,
        kind,
        title: input.title,
        body: input.body,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    const serialized = this.serialize(row);
    // Real-time (open app) — best-effort; never block on the bus.
    this.realtime
      .emitToUser(userId, 'notification', serialized)
      .catch((err: unknown) =>
        this.logger.warn(`realtime emit failed: ${(err as Error).message}`),
      );
    // Background push (closed app).
    await this.sendToUser(userId, {
      title: input.title,
      body: input.body,
      data: this.toFcmData(kind, row.id, input.data),
    });
    return serialized;
  }

  /** The caller's notification inbox, newest first. */
  async list(userId: string, limit = 50): Promise<SerializedNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map((r) => this.serialize(r));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * Admin broadcast: store a copy in every user's inbox, signal all open
   * sockets to refresh, and push via FCM. Returns the recipient count.
   */
  async broadcast(
    input: CreateNotificationInput,
  ): Promise<{ recipients: number }> {
    const kind = input.kind ?? 'admin';
    // Accounts in use only: never deleted or blocked ones.
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    if (users.length > 0) {
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          kind,
          title: input.title,
          body: input.body,
          data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    }
    // One realtime event to everyone; clients show it and refetch their inbox.
    this.realtime
      .broadcast('notification', {
        id: null,
        kind,
        title: input.title,
        body: input.body,
        data: input.data ?? null,
        read: false,
        createdAt: new Date().toISOString(),
      })
      .catch(() => {});
    // FCM to every registered device of an account in use.
    const tokens = await this.prisma.deviceToken.findMany({
      where: { user: { status: 'ACTIVE' } },
    });
    await Promise.all(
      tokens.map((t) =>
        this.sendToToken(t, {
          title: input.title,
          body: input.body,
          data: { kind },
        }),
      ),
    );
    return { recipients: users.length };
  }

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
    await this.create(order.userId, {
      kind: 'order',
      title: `${order.side} filled — ${order.symbol}`,
      body: `${order.quantity} @ ${price} (${order.type})`,
      data: {
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
