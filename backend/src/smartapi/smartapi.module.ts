import { Module } from '@nestjs/common';
import { SmartApiClient } from './smartapi.client';
import { SmartApiController } from './smartapi.controller';
import { SmartApiRateLimiter } from './smartapi.rate-limiter';
import { SmartApiService } from './smartapi.service';

@Module({
  controllers: [SmartApiController],
  providers: [SmartApiClient, SmartApiRateLimiter, SmartApiService],
  exports: [SmartApiService],
})
export class SmartApiModule {}
