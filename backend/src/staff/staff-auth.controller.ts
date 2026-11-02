import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { StaffAuthService } from './staff-auth.service';
import { CurrentStaff, StaffOnly } from './staff-auth.guard';
import {
  StaffForgotPasswordDto,
  StaffLoginDto,
  StaffResendDto,
  StaffResetPasswordDto,
  StaffVerifyDto,
  UpdateStaffProfileDto,
} from './staff.dto';
import { clientInfo, StaffPrincipal } from './staff-request';

/**
 * Newsroom portal sign-in: password → emailed one-time code → session token.
 * The portal (website server) sends the token back in `x-staff-session`.
 */
@Controller({ path: 'staff/auth', version: '1' })
export class StaffAuthController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: StaffLoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, this.client(req));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: StaffVerifyDto, @Req() req: Request) {
    return this.auth.verify(dto.challengeId, dto.code, this.client(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend')
  @HttpCode(200)
  resend(@Body() dto: StaffResendDto, @Req() req: Request) {
    return this.auth.resend(dto.challengeId, this.client(req));
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(200)
  forgotPassword(@Body() dto: StaffForgotPasswordDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(dto.email, this.client(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  resetPassword(@Body() dto: StaffResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(
      dto.email,
      dto.code,
      dto.password,
      this.client(req),
    );
  }

  @StaffOnly()
  @Get('me')
  me(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.me(staff);
  }

  @StaffOnly()
  @Patch('me')
  updateMe(
    @CurrentStaff() staff: StaffPrincipal,
    @Body() dto: UpdateStaffProfileDto,
  ) {
    return this.auth.updateProfile(staff, dto);
  }

  @StaffOnly()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentStaff() staff: StaffPrincipal) {
    await this.auth.logout(staff);
    return { ok: true };
  }

  @StaffOnly()
  @Get('sessions')
  sessions(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.listSessions(staff);
  }

  @StaffOnly()
  @Post('sessions/revoke-others')
  @HttpCode(200)
  revokeOtherSessions(@CurrentStaff() staff: StaffPrincipal) {
    return this.auth.revokeOtherSessions(staff);
  }

  @StaffOnly()
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentStaff() staff: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.auth.revokeOwnSession(staff, id);
    return { ok: true };
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
