import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { UsersService } from '../users/users.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { EmailForgotDto } from './dto/email-forgot.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { EmailResendDto } from './dto/email-resend.dto';
import { EmailResetDto } from './dto/email-reset.dto';
import { EmailVerifyDto } from './dto/email-verify.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly flags: FeatureFlagsService,
  ) {}

  /// Public: tells the app which sign-in methods to offer. The Mobile-OTP
  /// flag is admin-controlled (paused/resumed from the admin panel).
  @Get('config')
  authConfig() {
    return this.flags.authConfig();
  }

  // ─── Server email/password ───────────────────────────────────────

  @Post('email/register')
  @HttpCode(HttpStatus.OK)
  registerEmail(@Ip() ip: string, @Body() dto: EmailRegisterDto) {
    return this.auth.registerEmail(ip, dto.email, dto.password);
  }

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Ip() ip: string, @Body() dto: EmailVerifyDto) {
    return this.auth.verifyEmail(ip, dto.email, dto.code);
  }

  @Post('email/login')
  @HttpCode(HttpStatus.OK)
  loginEmail(@Ip() ip: string, @Body() dto: EmailLoginDto) {
    return this.auth.loginEmail(ip, dto.email, dto.password);
  }

  @Post('email/resend')
  @HttpCode(HttpStatus.OK)
  resendEmailOtp(@Ip() ip: string, @Body() dto: EmailResendDto) {
    return this.auth.resendEmailOtp(ip, dto.email);
  }

  @Post('email/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Ip() ip: string, @Body() dto: EmailForgotDto) {
    return this.auth.requestPasswordReset(ip, dto.email);
  }

  @Post('email/reset')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Ip() ip: string, @Body() dto: EmailResetDto) {
    return this.auth.resetPassword(ip, dto.email, dto.code, dto.newPassword);
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.emailAlias,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      tradeEmailsOptIn: user.tradeEmailsOptIn,
      status: user.status,
      profileComplete: this.users.isProfileComplete(user),
      // Sign-in method — drives which identity field the client locks when
      // editing the profile. MUST match auth.service.sanitize() so /auth/me
      // (read on launch) and the login responses agree.
      authProvider:
        user.passwordHash != null
          ? 'email'
          : user.emailVerified
            ? 'google'
            : 'phone',
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      // Referral fields — code is the user's public invite ID, and
      // referredById is non-null once they've redeemed someone else's.
      // Full stats (count, bonus, redeem-window) live on /referrals/stats.
      referralCode: user.referralCode,
      referredById: user.referredById,
    };
  }

  @Post('firebase/login')
  @HttpCode(HttpStatus.OK)
  firebaseLogin(@Ip() ip: string, @Body() dto: FirebaseLoginDto) {
    return this.auth.loginWithFirebaseIdToken(ip, dto.idToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: User) {
    // Lazy-backfill referralCode for users created before the column
    // existed. The migration's PL/pgSQL backfill should have caught
    // everyone, but this catches any row created in the deploy window.
    const ensured = await this.users.ensureReferralCode(user);
    return this.serializeUser(ensured);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.users.updateProfile(user.id, dto);
    return this.serializeUser(updated);
  }
}
