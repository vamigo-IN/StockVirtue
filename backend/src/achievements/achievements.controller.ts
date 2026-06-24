import { Controller, Get, UseGuards } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AchievementsService } from './achievements.service';

@Controller('achievements')
@UseGuards(JwtAuthGuard)
export class AchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  /// Returns every badge with the caller's unlocked flag + timestamp. The
  /// client maps these ids onto its visual catalog. Evaluation is refreshed
  /// server-side on each call.
  @Get()
  get(@CurrentUser() user: User) {
    return this.achievements.getForUser(user.id);
  }
}
