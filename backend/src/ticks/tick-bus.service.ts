import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppConfig } from '../config/configuration';
import { PublishedTick } from './tick.types';

const CHANNEL_PREFIX = 'tick';
const PATTERN = `${CHANNEL_PREFIX}:*`;

@Injectable()
export class TickBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TickBusService.name);
  private publisher!: Redis;
  private subscriber!: Redis;
  private readonly handlers = new Set<(tick: PublishedTick) => void>();

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
    this.subscriber.on('pmessage', (_pattern, _channel, message) => {
      try {
        const tick = JSON.parse(message) as PublishedTick;
        for (const h of this.handlers) h(tick);
      } catch (err) {
        this.logger.warn(`Bad tick payload: ${(err as Error).message}`);
      }
    });
    await this.subscriber.psubscribe(PATTERN);
    this.logger.log(`Subscribed to Redis pattern "${PATTERN}"`);
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  async publish(tick: PublishedTick): Promise<void> {
    const channel = this.channelFor(tick.exchange, tick.token);
    await this.publisher.publish(channel, JSON.stringify(tick));
  }

  onTick(handler: (tick: PublishedTick) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private channelFor(exchange: string, token: string): string {
    return `${CHANNEL_PREFIX}:${exchange}:${token}`;
  }
}
