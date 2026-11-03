import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { enforceRateLimit } from '../common/rate-limit';
import { AppConfig } from '../config/configuration';
import { has } from '../newsroom/articles/article-access';
import { RedisService } from '../redis/redis.service';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import {
  AliasDto,
  ItemsQuery,
  LogsQuery,
  ManualItemDto,
  MatchTestDto,
  SourceDto,
  StartStoryDto,
  TestSourceDto,
} from './ingestion.dto';
import { SourceItemsService } from './source-items.service';
import { SourcesService } from './sources.service';
import { StockMappingService } from './stock-mapping.service';

abstract class StaffController {
  constructor(
    protected readonly config: ConfigService<AppConfig, true>,
    protected readonly redis: RedisService,
  ) {}

  protected client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }

  /** Outbound fetches on request: a few a minute per person. */
  protected limit(actor: StaffPrincipal, what: string, perMinute: number) {
    return enforceRateLimit(
      this.redis.client,
      `rl:ingest:${what}:${actor.staffId}`,
      perMinute,
      60,
      'Too many requests. Wait a minute and try again.',
    );
  }
}

/** News sources: sources.read to see them, create / update / delete to change them. */
@Controller({ path: 'staff/sources', version: '1' })
export class SourcesController extends StaffController {
  constructor(
    private readonly sources: SourcesService,
    config: ConfigService<AppConfig, true>,
    redis: RedisService,
  ) {
    super(config, redis);
  }

  @StaffOnly('sources.read')
  @Get()
  list() {
    return this.sources.list();
  }

  @StaffOnly('sources.read')
  @Get('logs')
  logs(@Query() q: LogsQuery) {
    return this.sources.logs(q);
  }

  @StaffOnly('sources.read')
  @Post('test')
  async test(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: TestSourceDto,
  ) {
    if (!has(actor, 'sources.create') && !has(actor, 'sources.update')) {
      throw new ForbiddenException(
        'Testing a source needs sources.create or sources.update.',
      );
    }
    await this.limit(actor, 'test', 10);
    return this.sources.test(dto);
  }

  @StaffOnly('sources.update')
  @Post('logs/:logId/retry')
  async retry(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('logId', ParseUUIDPipe) logId: string,
    @Req() req: Request,
  ) {
    await this.limit(actor, 'fetch', 10);
    return this.sources.retry(actor, logId, this.client(req));
  }

  @StaffOnly('sources.read')
  @Get('catalogue')
  catalogue() {
    return this.sources.catalogue();
  }

  @StaffOnly('sources.create')
  @Post('catalogue/:key')
  addFromCatalogue(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Req() req: Request,
  ) {
    return this.sources.addFromCatalogue(actor, key, this.client(req));
  }

  @StaffOnly('sources.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.sources.get(id);
  }

  @StaffOnly('sources.create')
  @Post()
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: SourceDto,
    @Req() req: Request,
  ) {
    return this.sources.create(actor, dto, this.client(req));
  }

  @StaffOnly('sources.update')
  @Patch(':id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SourceDto,
    @Req() req: Request,
  ) {
    return this.sources.update(actor, id, dto, this.client(req));
  }

  @StaffOnly('sources.delete')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.sources.remove(actor, id, this.client(req));
  }

  @StaffOnly('sources.update')
  @Post(':id/fetch')
  async fetchNow(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.limit(actor, 'fetch', 10);
    return this.sources.fetchNow(actor, id, this.client(req));
  }
}

/** Incoming news: sources.read to see it; news.create (checked in the service) to act on it. */
@Controller({ path: 'staff/source-items', version: '1' })
export class SourceItemsController extends StaffController {
  constructor(
    private readonly items: SourceItemsService,
    config: ConfigService<AppConfig, true>,
    redis: RedisService,
  ) {
    super(config, redis);
  }

  @StaffOnly('sources.read')
  @Get()
  list(@Query() q: ItemsQuery) {
    return this.items.list(q);
  }

  @StaffOnly('sources.create')
  @Post()
  submit(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: ManualItemDto,
    @Req() req: Request,
  ) {
    return this.items.submit(actor, dto, this.client(req));
  }

  @StaffOnly('sources.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.get(id);
  }

  @StaffOnly('sources.read')
  @Post(':id/dismiss')
  dismiss(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.items.dismiss(actor, id, this.client(req));
  }

  @StaffOnly('sources.read')
  @Post(':id/restore')
  restore(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.items.restore(actor, id, this.client(req));
  }

  @StaffOnly('sources.read')
  @Post(':id/story')
  startStory(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartStoryDto,
    @Req() req: Request,
  ) {
    return this.items.startStory(actor, id, dto, this.client(req));
  }
}

/** Similar stories for the editor: duplicate detection without the AI assistant. */
@Controller({ path: 'staff/articles', version: '1' })
export class SimilarStoriesController {
  constructor(private readonly items: SourceItemsService) {}

  @StaffOnly('news.read')
  @Get(':id/similar')
  similar(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.items.similar(actor, id);
  }
}

/** Stock mapping: sources.read to see and test, sources.update to change. */
@Controller({ path: 'staff/stock-mapping', version: '1' })
export class StockMappingController extends StaffController {
  constructor(
    private readonly mapping: StockMappingService,
    config: ConfigService<AppConfig, true>,
    redis: RedisService,
  ) {
    super(config, redis);
  }

  @StaffOnly('sources.read')
  @Get()
  list() {
    return this.mapping.list();
  }

  @StaffOnly('sources.read')
  @Post('test')
  test(@Body() dto: MatchTestDto) {
    return this.mapping.test(dto.text);
  }

  @StaffOnly('sources.update')
  @Post()
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: AliasDto,
    @Req() req: Request,
  ) {
    return this.mapping.create(actor, dto, this.client(req));
  }

  @StaffOnly('sources.update')
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.mapping.remove(actor, id, this.client(req));
  }
}
