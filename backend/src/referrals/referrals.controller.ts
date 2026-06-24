import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReferralsService } from './referrals.service';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /// Redeem a friend's code. Validates window + uniqueness + self-redeem
  /// and, on success, credits both wallets atomically. The referred user
  /// is locked in for life — there's no "undo" or re-redeem.
  @Post('redeem')
  redeem(@CurrentUser() user: User, @Body() body: { code?: string }) {
    return this.referrals.redeem(user.id, body.code ?? '');
  }

  /// The caller's referral picture: code, count, lifetime bonus rupees,
  /// who referred them, and the list of people they've referred.
  @Get('stats')
  stats(@CurrentUser() user: User) {
    return this.referrals.getStats(user.id);
  }
}
