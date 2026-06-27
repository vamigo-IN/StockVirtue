import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { FirebaseModule } from './firebase/firebase.module';
import { MailModule } from './mail/mail.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SmartApiModule } from './smartapi/smartapi.module';
import { MarketModule } from './market/market.module';
import { WatchlistsModule } from './watchlists/watchlists.module';
import { TicksModule } from './ticks/ticks.module';
import { WalletModule } from './wallet/wallet.module';
import { OrdersModule } from './orders/orders.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NewsModule } from './news/news.module';
import { HealthModule } from './health/health.module';
import { RoomsModule } from './rooms/rooms.module';
import { ReferralsModule } from './referrals/referrals.module';
import { AchievementsModule } from './achievements/achievements.module';
import { LearnModule } from './learn/learn.module';
import { AdminModule } from './admin/admin.module';
import { SiteModule } from './site/site.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
      cache: true,
    }),
    // Baseline per-IP rate limit on every HTTP route (defence-in-depth on top
    // of the tight per-endpoint OTP/login throttles). 300 requests / 60s is
    // generous for normal client polling but caps abuse / token-spray. NOTE:
    // in-memory storage — switch to a Redis throttler store for multi-instance.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    FirebaseModule,
    MailModule,
    FeatureFlagsModule,
    RedisModule,
    UsersModule,
    AuthModule,
    SmartApiModule,
    MarketModule,
    WatchlistsModule,
    TicksModule,
    WalletModule,
    OrdersModule,
    PortfolioModule,
    LeaderboardModule,
    NotificationsModule,
    NewsModule,
    HealthModule,
    RoomsModule,
    ReferralsModule,
    AchievementsModule,
    LearnModule,
    AdminModule,
    SiteModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply the throttler to every HTTP route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
