import { Module, forwardRef } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { TicksModule } from '../ticks/ticks.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AchievementsModule } from '../achievements/achievements.module';
import { AutoSquareService } from './auto-square.service';
import { ExpirySettlementService } from './expiry-settlement.service';
import { LimitWatcherService } from './limit-watcher.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    SmartApiModule,
    MarketModule,
    WalletModule,
    forwardRef(() => TicksModule),
    NotificationsModule,
    AchievementsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    LimitWatcherService,
    AutoSquareService,
    ExpirySettlementService,
  ],
  exports: [
    OrdersService,
    LimitWatcherService,
    AutoSquareService,
    ExpirySettlementService,
  ],
})
export class OrdersModule {}
