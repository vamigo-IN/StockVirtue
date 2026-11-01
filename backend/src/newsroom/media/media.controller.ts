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
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import { MediaQueryDto, MediaUpdateDto, StartUploadDto } from './media.dto';
import { MediaService } from './media.service';

/** The newsroom media library (images for articles). */
@Controller({ path: 'staff/media', version: '1' })
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('media.upload')
  @Get()
  list(@Query() q: MediaQueryDto) {
    return this.media.list({ q: q.q, cursor: q.cursor, limit: q.limit ?? 30 });
  }

  @StaffOnly('media.upload')
  @Post('uploads')
  start(@CurrentStaff() actor: StaffPrincipal, @Body() dto: StartUploadDto) {
    return this.media.startUpload(actor, dto);
  }

  @StaffOnly('media.upload')
  @Post(':id/complete')
  @HttpCode(200)
  complete(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.media.completeUpload(actor, id, this.client(req));
  }

  @StaffOnly('media.upload')
  @Patch(':id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MediaUpdateDto,
    @Req() req: Request,
  ) {
    return this.media.update(actor, id, dto, this.client(req));
  }

  @StaffOnly('media.upload')
  @Delete(':id')
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.media.remove(actor, id, this.client(req));
    return { ok: true };
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
