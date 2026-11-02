import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request } from 'express';
import { MarketInstrumentKind } from '@prisma/client';
import { enforceRateLimit } from '../common/rate-limit';
import { optionalAppUser } from '../auth/optional-app-user';
import { AppConfig } from '../config/configuration';
import {
  instrumentRef,
  WidgetConfigError,
} from '../newsroom/content/widget-registry';
import { RedisService } from '../redis/redis.service';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, fromSite, StaffPrincipal } from '../staff/staff-request';
import { Channel } from './data-rights';
import { InstrumentsService } from './instruments.service';
import {
  CreateInstrumentDto,
  ReorderDto,
  UpdateInstrumentDto,
  UpdateSourceDto,
  UpdateTickerDto,
} from './market-config.dto';
import { MarketConfigService } from './market-config.service';
import {
  CHART_RANGES,
  ChartRange,
  MarketDataService,
} from './market-data.service';
import {
  CreateWidgetDto,
  UpdateWidgetDto,
  WidgetPresetsService,
} from './widget-presets.service';

const LIVE_CACHE = 'public, max-age=5, stale-while-revalidate=10';
const SLOW_CACHE = 'public, max-age=60, stale-while-revalidate=300';

class QuotesQueryDto {
  /** Comma-separated "EX:SYMBOL" refs, e.g. NSE:INFY,BSE:SENSEX. */
  @IsString()
  @MaxLength(600)
  symbols!: string;
}

class MoversQueryDto {
  @IsIn(['gainers', 'losers', 'active'])
  type!: 'gainers' | 'losers' | 'active';

  @IsOptional()
  @IsIn(['largecap', 'midcap', 'smallcap'])
  segment?: 'largecap' | 'midcap' | 'smallcap';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

class HeatmapQueryDto {
  @IsIn(['NIFTY', 'BANKNIFTY', 'SENSEX'])
  index!: string;
}

class ChartQueryDto {
  @IsString()
  @MaxLength(50)
  symbol!: string;

  @IsIn(CHART_RANGES)
  range!: ChartRange;
}

class SuggestQueryDto {
  @IsIn(Object.values(MarketInstrumentKind))
  kind!: MarketInstrumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;
}

function refs(raw: string, max = 20): string[] {
  try {
    const list = [
      ...new Set(
        raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => instrumentRef(s)),
      ),
    ];
    if (list.length === 0 || list.length > max) throw new WidgetConfigError('');
    return list;
  } catch {
    throw new BadRequestException(
      `Ask for 1 to ${max} instruments as EXCHANGE:SYMBOL.`,
    );
  }
}

function ref(raw: string): string {
  try {
    return instrumentRef(raw);
  } catch {
    throw new BadRequestException('Ask for an instrument as EXCHANGE:SYMBOL.');
  }
}

/** A request's licence, and whether the answer is the caller's own. */
interface Audience {
  channel: Channel;
  /** The signed-in app user, for the app channel. */
  userId: string | null;
}

/**
 * Public market data for the website and app: the curated snapshot and
 * ticker, indices, quotes, movers, sectors, heatmaps, charts, IPOs and saved
 * widgets. The website's server (site key) gets the website licence, the
 * signed-in app (its access token) the app licence, and anyone else the
 * stricter of the two. Calls a cache can't absorb have limits: per user for
 * the app (many phones share a mobile carrier's address), per IP otherwise.
 * App answers are marked private, so no shared cache hands them to others.
 */
@SkipThrottle()
@Controller({ path: 'market', version: '1' })
export class MarketPublicController {
  constructor(
    private readonly data: MarketDataService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('snapshot')
  @Header('Cache-Control', LIVE_CACHE)
  snapshot(@Req() req: Request) {
    return this.data.snapshot(this.channel(req));
  }

  @Get('ticker')
  @Header('Cache-Control', LIVE_CACHE)
  ticker(@Req() req: Request) {
    return this.data.ticker(this.channel(req));
  }

  /** The curated indices from the snapshot. */
  @Get('indices')
  @Header('Cache-Control', LIVE_CACHE)
  async indices(@Req() req: Request) {
    const snap = await this.data.snapshot(this.channel(req));
    return {
      right: snap.right,
      delayMinutes: snap.delayMinutes,
      attribution: snap.attribution,
      sessions: snap.sessions,
      generatedAt: snap.generatedAt,
      indices: snap.instruments.filter(
        (i) => i.kind === MarketInstrumentKind.INDEX,
      ),
    };
  }

  @Get('quotes')
  @Header('Cache-Control', LIVE_CACHE)
  async quotes(@Query() q: QuotesQueryDto, @Req() req: Request) {
    await this.limit(req, 'quotes', 120);
    return this.data.quotes(this.channel(req), refs(q.symbols));
  }

  @Get('movers')
  @Header('Cache-Control', LIVE_CACHE)
  movers(@Query() q: MoversQueryDto, @Req() req: Request) {
    return this.data.movers(
      this.channel(req),
      q.type,
      q.segment ?? 'largecap',
      q.limit ?? 5,
    );
  }

  @Get('sectors')
  @Header('Cache-Control', LIVE_CACHE)
  sectors(@Req() req: Request) {
    return this.data.sectors(this.channel(req));
  }

  @Get('heatmap')
  @Header('Cache-Control', LIVE_CACHE)
  heatmap(@Query() q: HeatmapQueryDto, @Req() req: Request) {
    return this.data.heatmap(this.channel(req), q.index);
  }

  @Get('chart')
  @Header('Cache-Control', SLOW_CACHE)
  async chart(@Query() q: ChartQueryDto, @Req() req: Request) {
    await this.limit(req, 'chart', 60);
    return this.data.chart(this.channel(req), ref(q.symbol), q.range);
  }

  @Get('ipos')
  @Header('Cache-Control', SLOW_CACHE)
  ipos(@Req() req: Request) {
    return this.data.ipos(this.channel(req));
  }

  @Get('widgets/:id')
  @Header('Cache-Control', SLOW_CACHE)
  widget(@Param('id', ParseUUIDPipe) id: string) {
    return this.data.widget(id);
  }

  private siteKey() {
    return this.config.get('site', { infer: true }).adminKey;
  }

  private channel(req: Request): Channel {
    return this.audience(req).channel;
  }

  /**
   * The website's server proves itself with the site key, the app with a
   * signed-in user's access token. Answers depend on which, so they vary on
   * both headers, and the app's are private to the caller.
   */
  private audience(req: Request): Audience {
    const known = (req as Request & { svMarketAudience?: Audience })
      .svMarketAudience;
    if (known) return known;
    let audience: Audience = { channel: 'public', userId: null };
    if (fromSite(req, this.siteKey())) {
      audience = { channel: 'web', userId: null };
    } else {
      const userId = optionalAppUser(
        req,
        this.config.get('jwt', { infer: true }).accessSecret,
      );
      if (userId) audience = { channel: 'app', userId };
    }
    (req as Request & { svMarketAudience?: Audience }).svMarketAudience =
      audience;
    const res = req.res;
    if (res) {
      res.vary('Authorization');
      res.vary('X-Site-Admin-Key');
      // Licensed to the caller (the website's server or a signed-in app):
      // never for a shared cache, which may ignore Vary on custom headers.
      if (audience.channel !== 'public') {
        const cc = String(res.getHeader('Cache-Control') ?? '');
        res.setHeader(
          'Cache-Control',
          cc ? cc.replace(/\bpublic\b/, 'private') : 'private, no-cache',
        );
      }
    }
    return audience;
  }

  private async limit(req: Request, what: string, perMinute: number) {
    const { channel, userId } = this.audience(req);
    if (channel === 'web') return;
    const who =
      channel === 'app' && userId
        ? `u:${userId}`
        : (clientInfo(req, this.siteKey()).ip ?? 'unknown');
    try {
      await enforceRateLimit(
        this.redis.client,
        `rl:market:${what}:${who}`,
        perMinute,
        60,
      );
    } catch (err) {
      if (err instanceof HttpException) throw err;
    }
  }
}

/**
 * The portal's market pages: the curated list, the data licence and the
 * ticker (market.configure to change), plus live previews for editors
 * building widgets — previews may quote any listed stock.
 */
@Controller({ path: 'staff/market', version: '1' })
export class MarketStaffController {
  constructor(
    private readonly instruments: InstrumentsService,
    private readonly settings: MarketConfigService,
    private readonly data: MarketDataService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('news.read')
  @Get('instruments')
  list() {
    return this.instruments.list();
  }

  @StaffOnly('market.configure')
  @Get('instruments/suggest')
  suggest(@Query() q: SuggestQueryDto) {
    return this.instruments.suggestions(q.kind, q.q ?? '');
  }

  @StaffOnly('market.configure')
  @Post('instruments')
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CreateInstrumentDto,
    @Req() req: Request,
  ) {
    return this.instruments.create(actor, dto, this.client(req));
  }

  @StaffOnly('market.configure')
  @Put('instruments/order')
  reorder(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: ReorderDto,
    @Req() req: Request,
  ) {
    return this.instruments.reorder(actor, dto.ids, this.client(req));
  }

  @StaffOnly('market.configure')
  @Patch('instruments/:id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInstrumentDto,
    @Req() req: Request,
  ) {
    return this.instruments.update(actor, id, dto, this.client(req));
  }

  @StaffOnly('market.configure')
  @Delete('instruments/:id')
  @HttpCode(204)
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.instruments.remove(actor, id, this.client(req));
  }

  @StaffOnly('news.read')
  @Get('source')
  source() {
    return this.settings.source();
  }

  @StaffOnly('market.configure')
  @Put('source')
  updateSource(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: UpdateSourceDto,
    @Req() req: Request,
  ) {
    return this.settings.updateSource(actor, dto, this.client(req));
  }

  @StaffOnly('news.read')
  @Get('ticker')
  ticker() {
    return this.settings.ticker();
  }

  @StaffOnly('market.configure')
  @Put('ticker')
  updateTicker(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: UpdateTickerDto,
    @Req() req: Request,
  ) {
    return this.settings.updateTicker(actor, dto, this.client(req));
  }

  // ── Previews: exactly what the website will show ────────────────────

  @StaffOnly('news.read')
  @Get('preview/snapshot')
  previewSnapshot() {
    return this.data.snapshot('web');
  }

  @StaffOnly('news.read')
  @Get('preview/ticker')
  previewTicker() {
    return this.data.ticker('web');
  }

  @StaffOnly('news.read')
  @Get('preview/quotes')
  previewQuotes(@Query() q: QuotesQueryDto) {
    return this.data.quotes('web', refs(q.symbols), { anyStock: true });
  }

  @StaffOnly('news.read')
  @Get('preview/movers')
  previewMovers(@Query() q: MoversQueryDto) {
    return this.data.movers(
      'web',
      q.type,
      q.segment ?? 'largecap',
      q.limit ?? 5,
    );
  }

  @StaffOnly('news.read')
  @Get('preview/sectors')
  previewSectors() {
    return this.data.sectors('web');
  }

  @StaffOnly('news.read')
  @Get('preview/heatmap')
  previewHeatmap(@Query() q: HeatmapQueryDto) {
    return this.data.heatmap('web', q.index);
  }

  @StaffOnly('news.read')
  @Get('preview/chart')
  previewChart(@Query() q: ChartQueryDto) {
    return this.data.chart('web', ref(q.symbol), q.range, { anyStock: true });
  }

  @StaffOnly('news.read')
  @Get('preview/ipos')
  previewIpos() {
    return this.data.ipos('web');
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}

/** The saved-widget library (widgets.* permissions). */
@Controller({ path: 'staff/widgets', version: '1' })
export class WidgetPresetsController {
  constructor(
    private readonly presets: WidgetPresetsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('widgets.read')
  @Get()
  list() {
    return this.presets.list();
  }

  @StaffOnly('widgets.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.presets.get(id);
  }

  @StaffOnly('widgets.create')
  @Post()
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CreateWidgetDto,
    @Req() req: Request,
  ) {
    return this.presets.create(actor, dto, this.client(req));
  }

  @StaffOnly('widgets.update')
  @Put(':id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWidgetDto,
    @Req() req: Request,
  ) {
    return this.presets.update(actor, id, dto, this.client(req));
  }

  @StaffOnly('widgets.delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.presets.remove(actor, id, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
