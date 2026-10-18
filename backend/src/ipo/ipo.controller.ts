import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { cacheJson } from '../common/redis-cache';
import { RedisService } from '../redis/redis.service';
import { IpoService } from './ipo.service';

@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('ipo')
export class IpoController {
  constructor(
    private readonly ipo: IpoService,
    private readonly redis: RedisService,
  ) {}

  /// Open, upcoming, listing-soon and recently-listed IPOs from NSE, with
  /// live prices + listing gains for the listed ones. `available: false`
  /// means NSE couldn't be reached — the app hides the IPO section.
  @Get()
  board() {
    return cacheJson(this.redis.client, 'ipo:board:v1', 60, () =>
      this.ipo.getBoard(),
    );
  }
}
