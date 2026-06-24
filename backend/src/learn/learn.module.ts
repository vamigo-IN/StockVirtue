import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { LearnController } from './learn.controller';
import { LearnService } from './learn.service';

@Module({
  imports: [AchievementsModule],
  controllers: [LearnController],
  providers: [LearnService],
  exports: [LearnService],
})
export class LearnModule {}
