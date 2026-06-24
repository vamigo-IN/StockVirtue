import { Module } from '@nestjs/common';
import { SmartApiClient } from './smartapi.client';
import { SmartApiController } from './smartapi.controller';
import { SmartApiService } from './smartapi.service';

@Module({
  controllers: [SmartApiController],
  providers: [SmartApiClient, SmartApiService],
  exports: [SmartApiService],
})
export class SmartApiModule {}
