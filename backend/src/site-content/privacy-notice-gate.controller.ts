import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { NoticeGateService } from '../privacy/notice-gate.service';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import { NoticeGateDto } from './site-content.dto';

/**
 * The app notice gate's card in Settings → Privacy (W7 decision 2, addendum
 * §5.11.6, §7.2). Reading: everyone who sees the Privacy tab (`settings.read`,
 * `privacy.manage`) and `legal.manage`; switching: `legal.material` (Super
 * Admins). Checked in NoticeGateService.
 */
@Controller({ path: 'staff/site/privacy-notice/gate', version: '1' })
export class PrivacyNoticeGateController {
  constructor(
    private readonly gate: NoticeGateService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** `{ enabled, forcedOff, on, changedAt, changedBy, playConfirmedAt, version, wouldBlock }`. */
  @StaffOnly()
  @Get()
  view(@CurrentStaff() actor: StaffPrincipal) {
    return this.gate.view(actor);
  }

  /** `{ enabled, playConfirmed? }` → `{ gate }`; on needs `playConfirmed: true`. */
  @StaffOnly()
  @Put()
  set(@CurrentStaff() actor: StaffPrincipal, @Body() dto: NoticeGateDto, @Req() req: Request) {
    return this.gate.set(actor, dto, clientInfo(req, this.config.get('site', { infer: true }).adminKey));
  }
}
