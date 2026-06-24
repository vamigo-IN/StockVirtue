import { HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';

/// Tiny fixed-window rate limiter on top of Redis. Each call increments
/// a counter at `key`; if the counter is the first increment of the
/// window we set its TTL so the window auto-expires. Throws a 429 once
/// the threshold is exceeded.
///
/// Trade-off: fixed windows allow a ~2× burst at the boundary, which is
/// fine for the abuse cases this guards (OTP spam, admin brute-force).
/// Sliding-window or token-bucket would add complexity for no real win.
export async function enforceRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSeconds: number,
  message?: string,
): Promise<void> {
  const count = await redis.incr(key);
  if (count === 1) {
    // First hit in this window — set the TTL atomically with the value.
    await redis.expire(key, windowSeconds);
  }
  if (count > limit) {
    const ttl = await redis.ttl(key);
    throw new HttpException(
      {
        message:
          message ??
          `Too many attempts. Try again in ${ttl > 0 ? ttl : windowSeconds}s.`,
        retryAfter: ttl > 0 ? ttl : windowSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
