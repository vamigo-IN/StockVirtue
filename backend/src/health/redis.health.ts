import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult, HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const ind = this.indicators.check(key);
    try {
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        return ind.down({ message: `unexpected response: ${pong}` });
      }
      return ind.up();
    } catch (err) {
      return ind.down({ message: (err as Error).message });
    }
  }
}
