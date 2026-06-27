import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { AppConfig } from '../config/configuration';
import { ContactDto, UpdateSiteSettingsDto } from './site.dto';
import { SiteService } from './site.service';

/**
 * Public surface for the marketing website (stockvirtue.com). All calls come
 * from the website's Next.js server (server-to-server), so:
 *  - GET /site/settings is public (read on every page render),
 *  - PUT /site/settings is guarded by a shared secret header (SITE_ADMIN_KEY),
 *  - POST /site/contact is public but throttled.
 */
@Controller('site')
export class SiteController {
  constructor(
    private readonly site: SiteService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('settings')
  getSettings() {
    return this.site.get();
  }

  @Put('settings')
  updateSettings(
    @Headers('x-site-admin-key') key: string | undefined,
    @Body() dto: UpdateSiteSettingsDto,
  ) {
    const expected = this.config.get('site', { infer: true }).adminKey;
    // Blank key ⇒ the write endpoint is disabled (never auto-authorise).
    if (!expected || !this.safeEqual(key ?? '', expected)) {
      throw new UnauthorizedException('Invalid site admin key');
    }
    return this.site.update(dto);
  }

  // Tight limit on top of the global throttle — contact is a spam target.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('contact')
  async contact(@Body() dto: ContactDto) {
    await this.site.contact(dto);
    return { ok: true };
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  }
}
