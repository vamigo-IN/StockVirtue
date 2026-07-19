import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { LearnModule } from '../learn/learn.module';
import { MarketModule } from '../market/market.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { RedisModule } from '../redis/redis.module';
import { SiteModule } from '../site/site.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminGuard } from './admin-auth.guard';
import { AdminHealthService } from './admin-health.service';
import { AdminShieldService } from './admin-shield.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    MarketModule,
    SmartApiModule,
    PortfolioModule,
    RedisModule,
    LearnModule,
    AchievementsModule,
    SiteModule,
    NotificationsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminAuditService,
    AdminAuthService,
    AdminGuard,
    AdminHealthService,
    // MailModule / RedisModule / MonitoringModule are all @Global — no import
    // needed for AdminShieldService to inject them.
    AdminShieldService,
    AdminStatsService,
  ],
})
export class AdminModule {}
