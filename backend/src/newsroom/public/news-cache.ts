import { Injectable, Logger } from '@nestjs/common';
import { cacheJson } from '../../common/redis-cache';
import { RedisService } from '../../redis/redis.service';
import { SiteRevalidator } from './site-revalidator';

const GENERATION_KEY = 'news:pub:gen';

/// Longest a public response is reused. Any change readers can see clears
/// the cache at once; this only bounds staleness if that step ever fails.
export const NEWS_CACHE_TTL_SECONDS = 30;

/**
 * Cache for the public news API. Keys carry a generation number, so one
 * INCR retires every cached listing, article and feed together; the old keys
 * just expire. Fail-open: if Redis is down, reads go to the database.
 */
@Injectable()
export class NewsCache {
  private readonly logger = new Logger(NewsCache.name);

  constructor(
    private readonly redis: RedisService,
    private readonly revalidator: SiteRevalidator,
  ) {}

  async get<T>(
    key: string,
    load: () => Promise<T>,
    ttlSeconds = NEWS_CACHE_TTL_SECONDS,
  ): Promise<T> {
    let generation: string;
    try {
      generation = (await this.redis.client.get(GENERATION_KEY)) ?? '0';
    } catch {
      return load();
    }
    return cacheJson(
      this.redis.client,
      `news:pub:v${generation}:${key}`,
      ttlSeconds,
      load,
    );
  }

  /**
   * Something readers can see changed: retire every cached public response
   * and ask the website to refresh its pages. Never throws.
   */
  async invalidate(reason: string): Promise<void> {
    try {
      await this.redis.client.incr(GENERATION_KEY);
    } catch (err) {
      this.logger.warn(
        `Couldn't clear the news cache (${(err as Error).message}); it expires within ${NEWS_CACHE_TTL_SECONDS}s.`,
      );
    }
    this.revalidator.schedule(reason);
  }
}
