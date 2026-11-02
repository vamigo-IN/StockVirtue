import { Injectable, Logger } from '@nestjs/common';
import { cacheJson } from '../common/redis-cache';
import { SiteRevalidator } from '../newsroom/public/site-revalidator';
import { RedisService } from '../redis/redis.service';

const GENERATION_KEY = 'md:pub:gen';

/**
 * Short-lived cache for the public market API. Keys carry a generation
 * number, so a change to the curated list, data rights or ticker settings
 * retires every cached answer at once. Fail-open, like NewsCache.
 */
@Injectable()
export class MarketCache {
  private readonly logger = new Logger(MarketCache.name);

  constructor(
    private readonly redis: RedisService,
    private readonly revalidator: SiteRevalidator,
  ) {}

  async get<T>(
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    let generation: string;
    try {
      generation = (await this.redis.client.get(GENERATION_KEY)) ?? '0';
    } catch {
      return load();
    }
    return cacheJson(
      this.redis.client,
      `md:pub:v${generation}:${key}`,
      ttlSeconds,
      load,
    );
  }

  /** Market settings changed: drop cached answers, refresh the website. */
  async invalidate(reason: string): Promise<void> {
    try {
      await this.redis.client.incr(GENERATION_KEY);
    } catch (err) {
      this.logger.warn(
        `Couldn't clear the market cache: ${(err as Error).message}`,
      );
    }
    this.revalidator.schedule(reason, ['market']);
  }
}
