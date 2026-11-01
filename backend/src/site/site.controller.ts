import { Body, Controller, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactDto } from './site.dto';
import { SiteService } from './site.service';

/**
 * Public surface for the marketing website (stockvirtue.com). All calls come
 * from the website's Next.js server (server-to-server), so:
 *  - GET /site/settings is public (read on every page render),
 *  - POST /site/contact is public but throttled.
 * Settings are edited by signed-in staff via /api/v1/staff/site/settings
 * (SiteStaffController), with per-person permissions and an audit trail.
 */
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get('settings')
  getSettings() {
    return this.site.get();
  }

  // Tight limit on top of the global throttle — contact is a spam target.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('contact')
  async contact(@Body() dto: ContactDto) {
    await this.site.contact(dto);
    return { ok: true };
  }
}
