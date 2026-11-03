import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { has } from '../newsroom/articles/article-access';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import {
  AdsDto,
  AnalyticsDto,
  BrandingDto,
  SearchSettingsDto,
  UpdateSiteSettingsDto,
} from './site.dto';
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
    return this.site.updateByStaff(actor, dto, this.client(req));
  }

  /** Branding, search & indexing, analytics and ads: readable by anyone who edits one of them. */
  @StaffOnly()
  @Get('config')
  siteConfig(@CurrentStaff() actor: StaffPrincipal) {
    if (
      !has(actor, 'settings.read') &&
      !has(actor, 'seo.read') &&
      !has(actor, 'ads.manage')
    ) {
      throw new ForbiddenException(
        'Viewing website settings needs the settings.read, seo.read or ads.manage permission.',
      );
    }
    return this.site.getConfigForStaff();
  }

  @StaffOnly('settings.update')
  @Put('config/branding')
  branding(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: BrandingDto,
    @Req() req: Request,
  ) {
    return this.site.updateConfig(
      actor,
      'branding',
      {
        logoMediaId: dto.logoMediaId ?? null,
        faviconMediaId: dto.faviconMediaId ?? null,
        shareImageMediaId: dto.shareImageMediaId ?? null,
        themeColor: dto.themeColor,
      },
      this.client(req),
    );
  }

  @StaffOnly('seo.update')
  @Put('config/search')
  search(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: SearchSettingsDto,
    @Req() req: Request,
  ) {
    return this.site.updateConfig(
      actor,
      'search',
      { ...dto },
      this.client(req),
    );
  }

  @StaffOnly('settings.update')
  @Put('config/analytics')
  analytics(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: AnalyticsDto,
    @Req() req: Request,
  ) {
    return this.site.updateConfig(
      actor,
      'analytics',
      { ...dto },
      this.client(req),
    );
  }

  @StaffOnly('ads.manage')
  @Put('config/ads')
  ads(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: AdsDto,
    @Req() req: Request,
  ) {
    return this.site.updateConfig(actor, 'ads', { ...dto }, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
