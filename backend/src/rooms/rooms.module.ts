import { Module } from '@nestjs/common';
import { AchievementsModule } from '../achievements/achievements.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [PortfolioModule, AchievementsModule],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
