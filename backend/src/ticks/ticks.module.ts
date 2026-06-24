import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MarketModule } from '../market/market.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { SmartApiWsService } from './smartapi-ws.service';
import { TickBusService } from './tick-bus.service';
import { TicksGateway } from './ticks.gateway';

@Module({
  imports: [SmartApiModule, MarketModule, JwtModule.register({})],
  providers: [TickBusService, SmartApiWsService, TicksGateway],
  exports: [TickBusService, SmartApiWsService],
})
export class TicksModule {}
