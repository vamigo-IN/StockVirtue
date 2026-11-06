import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import {
  CreatePageDto,
  CreatePreviewDto,
  DraftVersionDto,
  PrivacyNoticePublishDto,
  PublishDto,
  SaveDraftDto,
  UpdatePageDto,
  UpdatePreviewDto,
} from './site-content.dto';
import { PrivacyNoticePublishService } from './privacy-notice-publish.service';
import { SiteContentService } from './site-content.service';
import { SitePreviewsService } from './site-previews.service';

/**
 * The website's pages, menus, footer and legal documents, edited from the
 * portal (W7 addendum §7.2). Every route needs a staff session; who may read
 * and who may change each kind of item is checked in the service (§7.3).
 * No route uses DELETE: the portal's proxy drops request bodies on DELETE.
 */
@Controller({ path: 'staff/site', version: '1' })
export class SiteContentStaffController {
  constructor(
    private readonly content: SiteContentService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly notice: PrivacyNoticePublishService,
  ) {}

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }

  @StaffOnly()
  @Get('content')
  list(@CurrentStaff() actor: StaffPrincipal) {
    return this.content.list(actor);
  }

  // Before content/:key, so "types" is never read as a key.
  @StaffOnly()
  @Get('content/types')
  types(@CurrentStaff() actor: StaffPrincipal) {
    return this.content.types(actor);
  }

  @StaffOnly()
  @Get('content/:key')
  get(@CurrentStaff() actor: StaffPrincipal, @Param('key') key: string) {
    return this.content.get(actor, key);
  }

  @StaffOnly()
  @Put('content/:key/draft')
  saveDraft(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Body() dto: SaveDraftDto,
    @Req() req: Request,
  ) {
    return this.content.saveDraft(actor, key, dto, this.client(req));
  }

  @StaffOnly()
  @Post('content/:key/draft/discard')
  @HttpCode(200)
  discard(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Body() dto: DraftVersionDto,
    @Req() req: Request,
  ) {
    return this.content.discard(actor, key, dto, this.client(req));
  }

  @StaffOnly()
  @Post('content/:key/publish')
  @HttpCode(200)
  publish(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Body() dto: PublishDto,
    @Req() req: Request,
  ) {
    return this.content.publish(actor, key, dto, this.client(req));
  }

  @StaffOnly()
  @Get('content/:key/revisions')
  revisions(@CurrentStaff() actor: StaffPrincipal, @Param('key') key: string) {
    return this.content.revisions(actor, key);
  }

  @StaffOnly()
  @Get('content/:key/revisions/:id')
  revision(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.content.revision(actor, key, id);
  }

  @StaffOnly()
  @Post('content/:key/revisions/:id/restore')
  @HttpCode(200)
  restore(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DraftVersionDto,
    @Req() req: Request,
  ) {
    return this.content.restore(actor, key, id, dto, this.client(req));
  }

  @StaffOnly('site.manage')
  @Post('pages')
  createPage(@CurrentStaff() actor: StaffPrincipal, @Body() dto: CreatePageDto, @Req() req: Request) {
    return this.content.createPage(actor, dto, this.client(req));
  }

  @StaffOnly('site.manage')
  @Patch('pages/:key')
  updatePage(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key', ParseUUIDPipe) key: string,
    @Body() dto: UpdatePageDto,
    @Req() req: Request,
  ) {
    return this.content.updatePage(actor, key, dto, this.client(req));
  }

  @StaffOnly('site.manage')
  @Post('pages/:key/unpublish')
  @HttpCode(200)
  unpublishPage(@CurrentStaff() actor: StaffPrincipal, @Param('key', ParseUUIDPipe) key: string, @Req() req: Request) {
    return this.content.hidePage(actor, key, 'HIDDEN', this.client(req));
  }

  @StaffOnly('site.manage')
  @Post('pages/:key/archive')
  @HttpCode(200)
  archivePage(@CurrentStaff() actor: StaffPrincipal, @Param('key', ParseUUIDPipe) key: string, @Req() req: Request) {
    return this.content.hidePage(actor, key, 'ARCHIVED', this.client(req));
  }

  /* ── The privacy notice's own publish (§5.1–§5.3; M7.3) ──────────── */

  /** The versions, the next id, the code's facts, the cookie version and the gate. */
  @StaffOnly()
  @Get('privacy-notice')
  privacyNotice(@CurrentStaff() actor: StaffPrincipal) {
    return this.notice.overview(actor);
  }

  /** MINOR (a small fix for Admins) or MATERIAL (Super Admins): both notices. */
  @StaffOnly()
  @Post('privacy-notice/publish')
  @HttpCode(200)
  publishNotice(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: PrivacyNoticePublishDto,
    @Req() req: Request,
  ) {
    return this.notice.publish(actor, dto, this.client(req));
  }
}

/**
 * Live previews (§7.2, §8.9). They skip the global per-IP throttle (every
 * portal call comes from the web server's IP, so one open pane would spend
 * the whole portal's budget) and have per-staff limits in the service.
 */
@SkipThrottle()
@Controller({ path: 'staff/site/previews', version: '1' })
export class SitePreviewsController {
  constructor(private readonly previews: SitePreviewsService) {}

  @StaffOnly()
  @Post()
  create(@CurrentStaff() actor: StaffPrincipal, @Body() dto: CreatePreviewDto) {
    return this.previews.create(actor, dto.key, dto.content);
  }

  @StaffOnly()
  @Put(':token')
  @HttpCode(204)
  async update(@CurrentStaff() actor: StaffPrincipal, @Param('token') token: string, @Body() dto: UpdatePreviewDto) {
    await this.previews.update(actor, token, dto.content);
  }

  @StaffOnly()
  @Get(':token')
  read(@CurrentStaff() actor: StaffPrincipal, @Param('token') token: string) {
    return this.previews.read(actor, token);
  }
}
