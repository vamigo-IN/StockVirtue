import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AppConfig } from '../config/configuration';
import { clientInfo, ClientInfo, fromSite } from '../staff/staff-request';
import { AccountErasureService } from './account-erasure.service';
import { ConsentService } from './consent.service';
import {
  AnalyticsConsentDto,
  AppRequestDto,
  DeleteAccountDto,
  NomineeDto,
  NoticeAcceptanceDto,
  WebCodeDto,
  WebConsentDto,
  WebRequestDto,
} from './privacy.dto';
import { PrivacyRequestsService } from './privacy-requests.service';
import { PrivacyService } from './privacy.service';

/**
 * Privacy for people (DPDP Act 2023): who answers for their data, the notice
 * they accept, their data to download, a nominee, requests and grievances,
 * and deleting the account. App routes need the app's sign-in; the website's
 * routes (cookie choices, requests by email) only take calls from the
 * website's own server.
 */
@Controller({ path: 'privacy', version: '1' })
export class PrivacyController {
  constructor(
    private readonly privacy: PrivacyService,
    private readonly consent: ConsentService,
    private readonly requests: PrivacyRequestsService,
    private readonly erasure: AccountErasureService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** The notice version, the grievance officer and the response time. */
  @Get()
  info() {
    return this.privacy.publicInfo();
  }

  // ── The website's server ──────────────────────────────────────────

  @Post('consents')
  @HttpCode(200)
  logConsent(@Req() req: Request, @Body() dto: WebConsentDto) {
    return this.privacy.logWebConsent(dto, this.fromWebsite(req).ip);
  }

  @Post('requests/code')
  @HttpCode(200)
  sendCode(@Req() req: Request, @Body() dto: WebCodeDto) {
    return this.requests.sendWebCode(dto.email, this.fromWebsite(req));
  }

  @Post('requests')
  webRequest(@Req() req: Request, @Body() dto: WebRequestDto) {
    return this.requests.createFromWeb(dto, this.fromWebsite(req));
  }

  // ── The app ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('me')
  status(@CurrentUser() user: User) {
    return this.privacy.status(user);
  }

  /** Accepting the current notice (and confirming 18+). */
  @UseGuards(JwtAuthGuard)
  @Post('me/consent')
  @HttpCode(200)
  async accept(@CurrentUser() user: User, @Body() dto: NoticeAcceptanceDto) {
    const updated = await this.consent.accept(user.id, dto, 'app.notice');
    return this.privacy.status(updated);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/analytics')
  async analytics(@CurrentUser() user: User, @Body() dto: AnalyticsConsentDto) {
    const updated = await this.consent.setAnalytics(
      user.id,
      dto.enabled,
      'app.settings',
    );
    return this.privacy.status(updated);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/export')
  export(@CurrentUser() user: User) {
    return this.privacy.export(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/nominee')
  async nominee(@CurrentUser() user: User) {
    return { nominee: await this.privacy.nominee(user.id) };
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/nominee')
  async setNominee(@CurrentUser() user: User, @Body() dto: NomineeDto) {
    return { nominee: await this.privacy.setNominee(user.id, dto) };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/nominee')
  removeNominee(@CurrentUser() user: User) {
    return this.privacy.removeNominee(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/requests')
  myRequests(@CurrentUser() user: User) {
    return this.requests.listForUser(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/requests')
  raise(
    @CurrentUser() user: User,
    @Body() dto: AppRequestDto,
    @Req() req: Request,
  ) {
    return this.requests.createForUser(user, dto, this.client(req));
  }

  /** Deletes the account (the person typed DELETE to confirm). */
  @UseGuards(JwtAuthGuard)
  @Post('me/delete')
  @HttpCode(200)
  deleteAccount(
    @CurrentUser() user: User,
    @Body() dto: DeleteAccountDto,
    @Req() req: Request,
  ) {
    const client = this.client(req);
    return this.erasure.deleteAccount(user.id, {
      source: 'self',
      reason: dto.reason,
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  private client(req: Request): ClientInfo {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }

  /** The visitor's details, from a call the website's server made for them. */
  private fromWebsite(req: Request): ClientInfo {
    const key = this.config.get('site', { infer: true }).adminKey;
    if (!fromSite(req, key)) {
      throw new ForbiddenException('This endpoint is for the website.');
    }
    return clientInfo(req, key);
  }
}
