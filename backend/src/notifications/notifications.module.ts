import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { TicksModule } from '../ticks/ticks.module';
import { AlertWatcherService } from './alert-watcher.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TicksModule, MarketModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AlertWatcherService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
