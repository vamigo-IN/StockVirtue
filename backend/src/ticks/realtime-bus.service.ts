import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';

const USER_PREFIX = 'rt:user:';
const BROADCAST_CHANNEL = 'rt:broadcast';
const PATTERN = 'rt:*';

export interface RealtimeMessage {
  /** Target user, or null for a broadcast to every connected socket. */
  userId: string | null;
  event: string;
  payload: unknown;
}

/**
 * Redis pub/sub bridge for pushing per-user (or broadcast) events to connected
 * Socket.IO clients. Mirrors TickBusService so realtime notifications survive
 * multiple pm2 forks: whichever fork holds a user's socket relays the event,
 * regardless of which fork created the notification. The gateway (which owns
 * the socket server) subscribes via onMessage(); services publish via
 * emitToUser()/broadcast().
 */
@Injectable()
export class RealtimeBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBusService.name);
  private publisher!: Redis;
  private subscriber!: Redis;
  private readonly handlers = new Set<(msg: RealtimeMessage) => void>();

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async onModuleInit() {
    const cfg = this.config.get('redis', { infer: true });
    const opts = {
      host: cfg.host,
      port: cfg.port,
      password: cfg.password || undefined,
    };
    this.publisher = new Redis(opts);
    this.subscriber = new Redis(opts);
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      try {
        const parsed = JSON.parse(message) as { event: string; payload: unknown };
        const userId =
          channel === BROADCAST_CHANNEL
            ? null
            : channel.slice(USER_PREFIX.length);
        for (const h of this.handlers) {
          h({ userId, event: parsed.event, payload: parsed.payload });
        }
      } catch (err) {
        this.logger.warn(`Bad realtime payload: ${(err as Error).message}`);
      }
    });
    await this.subscriber.psubscribe(PATTERN);
    this.logger.log(`Subscribed to Redis pattern "${PATTERN}"`);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  /** Deliver a realtime event to a single user's connected sockets. */
  async emitToUser(
    userId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    await this.publisher.publish(
      `${USER_PREFIX}${userId}`,
      JSON.stringify({ event, payload }),
    );
  }

  /** Deliver a realtime event to every connected socket. */
  async broadcast(event: string, payload: unknown): Promise<void> {
    await this.publisher.publish(
      BROADCAST_CHANNEL,
      JSON.stringify({ event, payload }),
    );
  }

  onMessage(handler: (msg: RealtimeMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
