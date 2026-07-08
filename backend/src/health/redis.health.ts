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
    } catch {
      // /api/health is public — don't echo the driver error (it embeds the
      // internal Redis host:port, e.g. "ECONNREFUSED 127.0.0.1:6379").
      return ind.down({ message: 'unreachable' });
    }
  }
}
