import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import { UpdateHomepageDto } from './homepage.dto';
import { HomepageService } from './homepage.service';

/** The /news homepage layout, edited in the portal. */
@Controller({ path: 'staff/site/homepage', version: '1' })
export class HomepageController {
  constructor(
    private readonly homepage: HomepageService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('site.manage')
  @Get()
  get() {
    return this.homepage.forStaff();
  }

  @StaffOnly('site.manage')
  @Put()
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: UpdateHomepageDto,
    @Req() req: Request,
  ) {
    return this.homepage.update(
      actor,
      dto,
      clientInfo(req, this.config.get('site', { infer: true }).adminKey),
    );
  }
}
