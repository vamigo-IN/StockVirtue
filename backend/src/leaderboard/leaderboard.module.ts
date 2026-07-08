import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { SmartApiModule } from '../smartapi/smartapi.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

@Module({
  imports: [SmartApiModule, AchievementsModule],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
})
export class LeaderboardModule {}
