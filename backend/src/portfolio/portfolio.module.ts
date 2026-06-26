import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { MarketModule } from '../market/market.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { WalletModule } from '../wallet/wallet.module';
import { PortfolioAnalyticsService } from './portfolio-analytics.service';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

@Module({
  imports: [SmartApiModule, WalletModule, AchievementsModule, MarketModule],
  controllers: [PortfolioController],
  providers: [
    PortfolioService,
    PortfolioSnapshotService,
    PortfolioAnalyticsService,
  ],
  exports: [
    PortfolioService,
    PortfolioSnapshotService,
    PortfolioAnalyticsService,
  ],
})
export class PortfolioModule {}
