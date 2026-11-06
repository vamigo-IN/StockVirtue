import { Controller, Get, Header, Param } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PublicSiteContentService } from './public-site-content.service';

/// Browsers may reuse an answer briefly; a publish refreshes the website's
/// pages within seconds through the revalidation hook (W7 addendum §7.1).
const CACHE_HEADER = 'public, max-age=15, stale-while-revalidate=30';

/**
 * The public reads of the admin-managed site, for the website's server
 * (/api/v1/site/…). No sign-in; cached in Redis rather than throttled per
 * IP, because the website's server makes them on behalf of every visitor.
 */
@SkipThrottle()
@Controller({ path: 'site', version: '1' })
export class SiteContentPublicController {
  constructor(private readonly content: PublicSiteContentService) {}

  @Get('content-index')
  @Header('Cache-Control', CACHE_HEADER)
  contentIndex() {
    return this.content.contentIndex();
  }

  @Get('content/:key')
  @Header('Cache-Control', CACHE_HEADER)
  item(@Param('key') key: string) {
    return this.content.content(key);
  }

  @Get('chrome')
  @Header('Cache-Control', CACHE_HEADER)
  chrome() {
    return this.content.chrome();
  }

  @Get('pages/:slug')
  @Header('Cache-Control', CACHE_HEADER)
  page(@Param('slug') slug: string) {
    return this.content.page(slug);
  }
}
