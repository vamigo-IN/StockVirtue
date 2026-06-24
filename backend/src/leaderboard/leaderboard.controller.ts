import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
@UseGuards(JwtAuthGuard)
export class LeaderboardController {
  constructor(private readonly service: LeaderboardService) {}

  @Get()
  get(@CurrentUser() user: User, @Query('limit') limitRaw = '50') {
    const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 50, 1), 100);
    return this.service.getLeaderboard(user.id, limit);
  }
}
