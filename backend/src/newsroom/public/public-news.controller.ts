import {
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { optionalAppUser } from '../../auth/optional-app-user';
import { AppConfig } from '../../config/configuration';
import { clientInfo } from '../../staff/staff-request';
import { SLUG_RE } from '../slug';
import {
  ArticleQueryDto,
  LimitQueryDto,
  PublicListQueryDto,
  SearchQueryDto,
  StockQueryDto,
} from './public-news.dto';
import { PublicNewsService } from './public-news.service';

/// Browsers and apps may reuse a response briefly; edits still show within
/// seconds on the website, which refreshes its own pages on every change.
const CACHE_HEADER = 'public, max-age=15, stale-while-revalidate=30';
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9&_.-]{0,29}$/;

/**
 * Public news for the website, the app and feed readers. No sign-in. Reads
 * are cached (Redis) rather than throttled per IP, because the website's
 * server makes them on behalf of every visitor; search and view counting,
 * which can't be cached, have their own per-reader limits.
 */
@SkipThrottle()
@Controller({ path: 'news', version: '1' })
export class PublicNewsController {
  constructor(
    private readonly news: PublicNewsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get()
  @Header('Cache-Control', CACHE_HEADER)
  list(@Query() q: PublicListQueryDto) {
    return this.news.list(q);
  }

  @Get('home')
  @Header('Cache-Control', CACHE_HEADER)
  home() {
    return this.news.home();
  }

  @Get('featured')
  @Header('Cache-Control', CACHE_HEADER)
  featured(@Query() q: LimitQueryDto) {
    return this.news.featured(q.limit);
  }

  @Get('breaking')
  @Header('Cache-Control', CACHE_HEADER)
  breaking(@Query() q: LimitQueryDto) {
    return this.news.breaking(q.limit);
  }

  @Get('trending')
  @Header('Cache-Control', CACHE_HEADER)
  trending(@Query() q: LimitQueryDto) {
    return this.news.trending(q.limit);
  }

  @Get('categories')
  @Header('Cache-Control', CACHE_HEADER)
  categories() {
    return this.news.categories();
  }

  @Get('search')
  @Header('Cache-Control', CACHE_HEADER)
  async search(@Query() q: SearchQueryDto, @Req() req: Request) {
    await this.news.limitSearch(
      clientInfo(req, this.siteKey()),
      this.appUser(req),
    );
    return this.news.search(q.q, q.page, q.limit);
  }

  @Get('sitemap')
  @Header('Cache-Control', CACHE_HEADER)
  sitemap() {
    return this.news.sitemap();
  }

  @Get('stocks/:symbol')
  @Header('Cache-Control', CACHE_HEADER)
  stock(@Param('symbol') symbol: string, @Query() q: StockQueryDto) {
    const upper = symbol.toUpperCase();
    if (!SYMBOL_RE.test(upper)) {
      throw new NotFoundException('No stories about that stock.');
    }
    return this.news.stock(upper, q.exchange ?? 'NSE', q.page, q.limit);
  }

  /**
   * One page view. 202 whether or not it counted (repeats and bots don't).
   * Signed-in app readers count as themselves, not as their address.
   */
  @Post(':id/view')
  @HttpCode(202)
  async view(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.news.recordView(
      id,
      clientInfo(req, this.siteKey()),
      this.appUser(req),
    );
    return { ok: true };
  }

  /** `?format=app` returns the document for the app's native reader instead of HTML. */
  @Get(':slug')
  @Header('Cache-Control', CACHE_HEADER)
  article(@Param('slug') slug: string, @Query() q: ArticleQueryDto) {
    if (slug.length > 90 || !SLUG_RE.test(slug)) {
      throw new NotFoundException('Article not found.');
    }
    return this.news.article(slug, q.format ?? 'web');
  }

  private siteKey() {
    return this.config.get('site', { infer: true }).adminKey;
  }

  private appUser(req: Request) {
    return optionalAppUser(
      req,
      this.config.get('jwt', { infer: true }).accessSecret,
    );
  }
}
