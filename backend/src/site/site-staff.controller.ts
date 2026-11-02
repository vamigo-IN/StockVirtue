import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import { UpdateSiteSettingsDto } from './site.dto';
import { SiteService } from './site.service';

/** Website settings, edited from the newsroom portal. */
@Controller({ path: 'staff/site', version: '1' })
export class SiteStaffController {
  constructor(
    private readonly site: SiteService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('settings.read')
  @Get('settings')
  settings() {
    return this.site.getForStaff();
  }

  @StaffOnly('settings.update')
  @Put('settings')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: UpdateSiteSettingsDto,
    @Req() req: Request,
  ) {
    return this.site.updateByStaff(
      actor,
      dto,
      clientInfo(req, this.config.get('site', { infer: true }).adminKey),
    );
  }
}
