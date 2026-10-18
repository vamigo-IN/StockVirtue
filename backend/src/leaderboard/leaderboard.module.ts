import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [PortfolioModule, AchievementsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
})
export class LeaderboardModule {}
