import { HttpException, HttpStatus } from '@nestjs/common';
import Redis from 'ioredis';

/// INCR the window counter and, only on its first hit, attach the TTL — as ONE
/// atomic server-side step. Doing INCR then EXPIRE as two round-trips (the old
/// approach) risks a crash/disconnect in between leaving a counter with no
/// expiry, which would lock an account out forever. Returns the new count.
const INCR_WITH_TTL = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return c
`;

/// Tiny fixed-window rate limiter on top of Redis. Throws a 429 once the
/// threshold is exceeded.
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
  const count = (await redis.eval(
    INCR_WITH_TTL,
    1,
    key,
    String(windowSeconds),
  )) as number;
  if (count > limit) {
    let ttl = await redis.ttl(key);
    // Self-heal a legacy key that was stranded without a TTL by the old
    // non-atomic path, so a lockout can't persist forever.
    if (ttl < 0) {
      await redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }
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
