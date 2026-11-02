import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { RedisModule } from '../redis/redis.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { IpoController } from './ipo.controller';
import { IpoService } from './ipo.service';

@Module({
  imports: [MarketModule, SmartApiModule, RedisModule],
  controllers: [IpoController],
  providers: [IpoService],
  exports: [IpoService],
})
export class IpoModule {}
