import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { WatchlistsController } from './watchlists.controller';
import { WatchlistsService } from './watchlists.service';

@Module({
  imports: [MarketModule, SmartApiModule],
  controllers: [WatchlistsController],
  providers: [WatchlistsService],
})
export class WatchlistsModule {}
