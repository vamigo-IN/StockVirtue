import { Injectable } from '@nestjs/common';

/**
 * SmartAPI is called from many places (the live-quote feed, portfolio,
 * orders, leaderboard, charts…) but all share ONE Angel One account, so the
 * rate limits are per-account and global to this process. This limiter paces
 * every outbound SmartAPI request so we stay under the documented ceilings and
 * users never see "access rate exceeded" errors.
 *
 * Limits (https://smartapi.angelone.in/docs/RateLimit), kept a touch under the
 * published caps for clock/network jitter:
 *
 *   endpoint            /sec  /min
 *   login                 1     -
 *   getLtpData           10    500
 *   getCandleData         3    180
 *   /quote               10    500
 *   margin/batch         10    500
 *
 * gainersLosers / OIBuildup / putCallRatio aren't published — capped
 * conservatively since they're low-frequency analytics calls.
 */
export type RateBucket =
  | 'login'
  | 'ltp'
  | 'candles'
  | 'quote'
  | 'marketData'
  | 'margin';

interface Limit {
  perSecond: number;
  perMinute?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A single endpoint's rolling-window limiter. Acquisitions are serialized so
 * concurrent callers each observe the up-to-date window (no herd slips through
 * the check together). The sliding window guarantees we never exceed the /sec
 * or /min cap in ANY rolling window — stricter than SmartAPI's fixed-window
 * counter, so a green light here is always safe there.
 */
class SlidingWindow {
  private readonly times: number[] = [];
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly limit: Limit) {}

  async acquire(): Promise<void> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      for (;;) {
        const now = Date.now();
        this.prune(now);
        const wait = this.waitMs(now);
        if (wait <= 0) {
          this.times.push(now);
          return;
        }
        await sleep(wait);
      }
    } finally {
      release();
    }
  }

  /** Drop timestamps older than the widest window we track (1 minute). */
  private prune(now: number): void {
    const cutoff = now - 60_000;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] < cutoff) drop++;
    if (drop > 0) this.times.splice(0, drop);
  }

  private countWithin(now: number, windowMs: number): number {
    const cutoff = now - windowMs;
    let c = 0;
    for (let i = this.times.length - 1; i >= 0; i--) {
      if (this.times[i] < cutoff) break;
      c++;
    }
    return c;
  }

  /** How long to wait before a new request fits under every cap (0 = now). */
  private waitMs(now: number): number {
    let wait = 0;
    const { perSecond, perMinute } = this.limit;
    if (perSecond) {
      const c = this.countWithin(now, 1000);
      if (c >= perSecond) {
        const oldest = this.times[this.times.length - perSecond];
        wait = Math.max(wait, oldest + 1000 - now);
      }
    }
    if (perMinute) {
      const c = this.countWithin(now, 60_000);
      if (c >= perMinute) {
        const oldest = this.times[this.times.length - perMinute];
        wait = Math.max(wait, oldest + 60_000 - now);
      }
    }
    return wait;
  }
}

@Injectable()
export class SmartApiRateLimiter {
  private readonly windows: Record<RateBucket, SlidingWindow> = {
    login: new SlidingWindow({ perSecond: 1 }),
    ltp: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    candles: new SlidingWindow({ perSecond: 3, perMinute: 160 }),
    quote: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    margin: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    marketData: new SlidingWindow({ perSecond: 2, perMinute: 60 }),
  };

  /** Resolves once the caller has a slot under [bucket]'s limits. */
  acquire(bucket: RateBucket): Promise<void> {
    return this.windows[bucket].acquire();
  }
}
