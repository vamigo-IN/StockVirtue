import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

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
 *
 * The website's share (B3). Calls made for the website (the public market
 * API's `web` and `public` channels; see `inBrokerLane`) first take a slot in
 * a website window: at most 2 a second and 120 a minute on `quote`, 1 a second
 * and 40 a minute on `candles`, about a quarter of each lane. A website call
 * that would wait more than 2 s for that window is refused with
 * `WebsiteShareFull` before it reaches the broker. App calls (and the server's
 * own jobs) never wait for the website window. Like the lanes, the window is
 * in this process's memory, so it assumes a single API process (one pm2 fork);
 * a cluster would need it in Redis.
 */
export type RateBucket =
  | 'login'
  | 'ltp'
  | 'candles'
  | 'quote'
  | 'marketData'
  | 'margin';

/** Who a broker call is made for: the app (and the server's own jobs), or the website. */
export type BrokerLane = 'app' | 'website';

interface Limit {
  perSecond: number;
  perMinute?: number;
}

/** A website call that would wait longer than this for its window is refused. */
export const WEBSITE_MAX_WAIT_MS = 2_000;

/**
 * Thrown, without calling the broker, when a website call would wait more
 * than WEBSITE_MAX_WAIT_MS for the website's share of a lane. The message
 * must never look like the broker's own rate-limit error, which
 * SmartApiService retries.
 */
export class WebsiteShareFull extends Error {
  constructor(readonly bucket: RateBucket) {
    super(
      `The website's share of the broker's ${bucket} calls is full; ` +
        'refused without calling the broker.',
    );
    this.name = 'WebsiteShareFull';
  }
}

/** One `inBrokerLane` run: its lane, and whether the website's share refused it. */
interface LaneRun {
  lane: BrokerLane;
  refused: boolean;
}

const lanes = new AsyncLocalStorage<LaneRun>();

/** What `inBrokerLane` resolves to. */
export interface LaneResult<T> {
  value: T;
  /**
   * True when the website's share refused a broker call that `load` made or
   * shared. `value` is then not the broker's answer (the market services
   * swallow failed calls), so it must not be shown or cached as one.
   */
  refused: boolean;
}

/**
 * Runs `load` with every SmartAPI call it makes, however deep, paced for
 * `lane`: website calls first take a slot in the website's share (B3), app
 * calls go straight to the lane. Wrap request work only: a timer started
 * inside `load` would inherit the lane.
 */
export async function inBrokerLane<T>(
  lane: BrokerLane,
  load: () => Promise<T>,
): Promise<LaneResult<T>> {
  const run: LaneRun = { lane, refused: false };
  const value = await lanes.run(run, load);
  return { value, refused: run.refused };
}

/** The lane of the code running now: 'app' outside any `inBrokerLane`. */
export function currentBrokerLane(): BrokerLane {
  return lanes.getStore()?.lane ?? 'app';
}

/**
 * For a website call that shares another website call's request in flight:
 * when that request is refused, this call's answer is refused too. Call it
 * from the sharing call's own code path, so the refusal lands on its run.
 */
export function shareRefusal<T>(pending: Promise<T>): Promise<T> {
  return pending.catch((err: unknown) => {
    if (err instanceof WebsiteShareFull) {
      const run = lanes.getStore();
      if (run) run.refused = true;
    }
    throw err;
  });
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

/**
 * The website's share of one lane (B3), with the same rolling caps as
 * SlidingWindow. Each call is booked its start time when it arrives, so a
 * call whose wait would exceed the limit is refused at once rather than after
 * queueing, and a waiting website call never holds up anyone else.
 */
class ShareWindow {
  /** Booked start times (ms), oldest first; the newest may be in the future. */
  private readonly starts: number[] = [];

  constructor(private readonly limit: Required<Limit>) {}

  /**
   * Books the earliest start that keeps every cap and returns how long the
   * caller must wait for it (ms), or null, booking nothing, when that wait
   * would be longer than `maxWaitMs`.
   */
  book(now: number, maxWaitMs: number): number | null {
    this.prune(now);
    const { perSecond, perMinute } = this.limit;
    const n = this.starts.length;
    let start = now;
    if (n >= perSecond) {
      start = Math.max(start, this.starts[n - perSecond] + 1000);
    }
    if (n >= perMinute) {
      start = Math.max(start, this.starts[n - perMinute] + 60_000);
    }
    if (start - now > maxWaitMs) return null;
    this.starts.push(start);
    return start - now;
  }

  private prune(now: number): void {
    const cutoff = now - 60_000;
    let drop = 0;
    while (drop < this.starts.length && this.starts[drop] < cutoff) drop++;
    if (drop > 0) this.starts.splice(0, drop);
  }
}

@Injectable()
export class SmartApiRateLimiter {
  private readonly logger = new Logger(SmartApiRateLimiter.name);
  private readonly windows: Record<RateBucket, SlidingWindow> = {
    login: new SlidingWindow({ perSecond: 1 }),
    ltp: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    candles: new SlidingWindow({ perSecond: 3, perMinute: 160 }),
    quote: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    margin: new SlidingWindow({ perSecond: 8, perMinute: 450 }),
    marketData: new SlidingWindow({ perSecond: 2, perMinute: 60 }),
  };
  /** B3: the website's share of the two lanes the website uses. */
  private readonly website: Partial<Record<RateBucket, ShareWindow>> = {
    quote: new ShareWindow({ perSecond: 2, perMinute: 120 }),
    candles: new ShareWindow({ perSecond: 1, perMinute: 40 }),
  };
  /** Refusals since the last log line, which is written at most once a minute. */
  private refusals: Partial<Record<RateBucket, number>> = {};
  private loggedAt = 0;

  /**
   * Resolves once the caller has a slot under [bucket]'s limits. A website
   * call (see `inBrokerLane`) first takes a slot in the website's share of
   * the lane and is refused with WebsiteShareFull when that would take more
   * than WEBSITE_MAX_WAIT_MS; app calls go straight to the lane.
   */
  async acquire(bucket: RateBucket): Promise<void> {
    const run = lanes.getStore();
    const share = run?.lane === 'website' ? this.website[bucket] : undefined;
    if (run && share) {
      // Once refused, a run gives up at once: its answer is discarded anyway,
      // so a fallback call or a later batch mustn't spend the share.
      const wait = run.refused
        ? null
        : share.book(Date.now(), WEBSITE_MAX_WAIT_MS);
      if (wait === null) {
        run.refused = true;
        this.noteRefusal(bucket);
        throw new WebsiteShareFull(bucket);
      }
      if (wait > 0) await sleep(wait);
    }
    return this.windows[bucket].acquire();
  }

  private noteRefusal(bucket: RateBucket): void {
    this.refusals[bucket] = (this.refusals[bucket] ?? 0) + 1;
    const now = Date.now();
    if (now - this.loggedAt < 60_000) return;
    const counts = Object.entries(this.refusals)
      .map(([b, n]) => `${n} ${b}`)
      .join(', ');
    this.logger.warn(
      `Website share of the broker account full: refused ${counts} ` +
        'call(s) since the last report.',
    );
    this.refusals = {};
    this.loggedAt = now;
  }
}
