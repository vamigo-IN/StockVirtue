import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { AchievementsController } from './achievements.controller';
import { AchievementsService } from './achievements.service';

/// MailService is global; NotificationsModule provides the push sender.
/// Exports AchievementsService so OrdersService, ReferralsService, the daily
/// snapshot, and LearnService can trigger re-evaluation on their hooks.
@Module({
  imports: [NotificationsModule],
  controllers: [AchievementsController],
  providers: [AchievementsService],
  exports: [AchievementsService],
})
export class AchievementsModule {}
