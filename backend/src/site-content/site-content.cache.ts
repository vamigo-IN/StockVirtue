import { Injectable, Logger } from '@nestjs/common';
import { cacheJson } from '../common/redis-cache';
import { SiteRevalidator } from '../newsroom/public/site-revalidator';
import { RedisService } from '../redis/redis.service';

const GENERATION_KEY = 'site:pub:gen';

/** Longest a public site-content response is reused (W7 addendum §7.1). */
export const SITE_CACHE_TTL_SECONDS = 30;

/**
 * Cache for the public site-content API, the NewsCache pattern: keys carry a
 * generation number, so one INCR retires every cached answer; then the
 * website is asked to refresh the pages whose fetches carry the tags
 * (§7.5). Fail-open: with Redis down, reads go to the database.
 */
@Injectable()
export class SiteContentCache {
  private readonly logger = new Logger(SiteContentCache.name);

  constructor(
    private readonly redis: RedisService,
    private readonly revalidator: SiteRevalidator,
  ) {}

  async get<T>(key: string, load: () => Promise<T>, ttlSeconds = SITE_CACHE_TTL_SECONDS): Promise<T> {
    let generation: string;
    try {
      generation = (await this.redis.client.get(GENERATION_KEY)) ?? '0';
    } catch {
      return load();
    }
    return cacheJson(this.redis.client, `site:pub:v${generation}:${key}`, ttlSeconds, load);
  }

  /**
   * Something readers can see changed: retire every cached answer and ask
   * the website to refresh the pages with these tags. Never throws.
   */
  async invalidate(reason: string, tags: readonly string[]): Promise<void> {
    try {
      await this.redis.client.incr(GENERATION_KEY);
    } catch (err) {
      this.logger.warn(
        `Couldn't clear the site content cache (${(err as Error).message}); it expires within ${SITE_CACHE_TTL_SECONDS}s.`,
      );
    }
    if (tags.length) this.revalidator.schedule(reason, [...new Set(tags)]);
  }
}
