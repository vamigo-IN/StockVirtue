import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { TicksModule } from '../ticks/ticks.module';
import { FeedAuthService } from './feed.auth.service';
import { FeedGateway } from './feed.gateway';
import { FeedService } from './feed.service';
import { FeedStore } from './feed.store';

/**
 * Public market-data feed for sibling apps (FinCalc).
 *
 * One WebSocket namespace, one fixed instrument list, its own API-key auth. It
 * consumes the broker connection and scrip master this backend already runs —
 * there is no second Angel One login and no second upstream socket — so adding
 * it costs the trading app nothing.
 */
@Module({
  imports: [TicksModule, MarketModule, SmartApiModule],
  providers: [FeedStore, FeedAuthService, FeedService, FeedGateway],
  exports: [FeedService],
})
export class FeedModule {}
