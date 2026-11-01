import { Injectable } from '@nestjs/common';

/**
 * The time the market services work to: trading sessions, price ages and
 * delayed samples. Injected so tests can move market time without touching
 * anything else in the process.
 */
@Injectable()
export class MarketClock {
  now(): number {
    return Date.now();
  }
}
