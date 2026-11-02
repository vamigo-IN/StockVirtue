import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import {
  MediaStorageConnectionDto,
  MediaStorageSaveDto,
} from './media-storage.dto';
import { MediaStorageService } from './media-storage.service';

/**
 * Where media files are kept: this server's disk, or Cloudflare R2 once a
 * connection is saved here (media.storage). The secret key is write-only.
 */
@Controller({ path: 'staff/media-storage', version: '1' })
export class MediaStorageController {
  constructor(
    private readonly storage: MediaStorageService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('media.storage')
  @Get()
  view() {
    return this.storage.view();
  }

  @StaffOnly('media.storage')
  @Post('check')
  @HttpCode(200)
  check(@Body() dto: MediaStorageConnectionDto) {
    return this.storage.check(dto);
  }

  @StaffOnly('media.storage')
  @Put()
  save(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: MediaStorageSaveDto,
    @Req() req: Request,
  ) {
    return this.storage.save(actor, dto, this.client(req));
  }

  @StaffOnly('media.storage')
  @Delete()
  disconnect(@CurrentStaff() actor: StaffPrincipal, @Req() req: Request) {
    return this.storage.disconnect(actor, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
