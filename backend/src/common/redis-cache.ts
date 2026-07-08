import Redis from 'ioredis';

/**
 * Read-through JSON cache with a short TTL, used for hot read-only endpoints
 * that proxy the shared SmartAPI broker account (market quotes, option chains,
 * scanners, movers). Collapses many identical requests within the TTL into one
 * upstream call — a big latency + rate-budget win when many users view the same
 * data. FAIL-OPEN: any Redis error just falls through to a live fetch, so the
 * cache can never take an endpoint down.
 *
 * NOTE: never use this for anything that must be exact-to-the-tick (order fills
 * fetch their own uncached price). A few seconds of staleness on browse/quote
 * endpoints is fine — real-time symbols stream over the tick socket.
 */
export async function cacheJson<T>(
  redis: Redis,
  key: string,
  ttlSec: number,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const hit = await redis.get(key);
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // fall through to a live fetch
  }
  const value = await fn();
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSec);
  } catch {
    // caching is best-effort
  }
  return value;
}
