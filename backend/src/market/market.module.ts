import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { CompanyDirectoryService } from './company-directory.service';
import { HolidaysService } from './holidays.service';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { ScripMasterService } from './scrip-master.service';

@Module({
  imports: [SmartApiModule, RedisModule],
  controllers: [MarketController],
  providers: [
    MarketService,
    ScripMasterService,
    HolidaysService,
    CompanyDirectoryService,
  ],
  exports: [
    MarketService,
    ScripMasterService,
    HolidaysService,
    CompanyDirectoryService,
  ],
})
export class MarketModule {}
