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
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import { ArticleWorkflowService } from './article-workflow.service';
import {
  ArticleListQueryDto,
  CountsQueryDto,
  CreateArticleDto,
  FlagsDto,
  NoteDto,
  ReviewDto,
  ScheduleDto,
  UpdateArticleDto,
  VersionDto,
} from './articles.dto';
import { ArticlesService } from './articles.service';

class VersionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/**
 * Newsroom articles. Each route declares the permission it needs; the
 * services add the ownership and state rules (own work, separation of
 * duties, what each status allows).
 */
@Controller({ path: 'staff/articles', version: '1' })
export class ArticlesController {
  constructor(
    private readonly articles: ArticlesService,
    private readonly workflow: ArticleWorkflowService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('news.read')
  @Get()
  list(@CurrentStaff() actor: StaffPrincipal, @Query() q: ArticleListQueryDto) {
    return this.articles.list(actor, { ...q, limit: q.limit ?? 30 });
  }

  @StaffOnly('news.read')
  @Get('counts')
  counts(@CurrentStaff() actor: StaffPrincipal, @Query() q: CountsQueryDto) {
    return this.articles.counts(actor, q.scope ?? 'all');
  }

  @StaffOnly('news.create')
  @Post()
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CreateArticleDto,
    @Req() req: Request,
  ) {
    return this.articles.create(actor, dto, this.client(req));
  }

  @StaffOnly('news.read')
  @Get(':id')
  get(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.articles.get(actor, id);
  }

  /** Content needs edit rights for its state; SEO fields also news.update_seo. */
  @StaffOnly('news.read')
  @Patch(':id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
    @Req() req: Request,
  ) {
    return this.articles.update(actor, id, dto, this.client(req));
  }

  @StaffOnly('news.delete')
  @Delete(':id')
  async remove(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: VersionQueryDto,
    @Req() req: Request,
  ) {
    await this.articles.remove(actor, id, q.version, this.client(req));
    return { ok: true };
  }

  // ── Versions ────────────────────────────────────────────────────────

  @StaffOnly('news.read')
  @Get(':id/versions')
  versions(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.articles.versions(actor, id);
  }

  @StaffOnly('news.read')
  @Get(':id/versions/:versionId')
  version(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.articles.version(actor, id, versionId);
  }

  @StaffOnly('news.read')
  @Post(':id/versions/:versionId/restore')
  @HttpCode(200)
  restore(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.articles.restore(
      actor,
      id,
      versionId,
      dto.version,
      this.client(req),
    );
  }

  // ── Workflow ────────────────────────────────────────────────────────

  @StaffOnly('news.submit_review')
  @Post(':id/submit')
  @HttpCode(200)
  submit(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.submit(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.submit_review')
  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.withdraw(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.approve')
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    return this.workflow.approve(
      actor,
      id,
      dto.version,
      dto.comment,
      this.client(req),
    );
  }

  @StaffOnly('news.approve')
  @Post(':id/request-changes')
  @HttpCode(200)
  requestChanges(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    return this.workflow.requestChanges(
      actor,
      id,
      dto.version,
      dto.comment,
      this.client(req),
    );
  }

  @StaffOnly('news.approve')
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    return this.workflow.reject(
      actor,
      id,
      dto.version,
      dto.comment,
      this.client(req),
    );
  }

  @StaffOnly('news.publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.publish(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.schedule', 'news.publish')
  @Post(':id/schedule')
  @HttpCode(200)
  schedule(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleDto,
    @Req() req: Request,
  ) {
    return this.workflow.schedule(
      actor,
      id,
      dto.version,
      dto.scheduledAt,
      this.client(req),
    );
  }

  @StaffOnly('news.schedule')
  @Post(':id/unschedule')
  @HttpCode(200)
  unschedule(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.unschedule(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.unpublish')
  @Post(':id/unpublish')
  @HttpCode(200)
  unpublish(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @Req() req: Request,
  ) {
    return this.workflow.unpublish(
      actor,
      id,
      dto.version,
      dto.comment,
      this.client(req),
    );
  }

  @StaffOnly('news.archive')
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.archive(actor, id, dto.version, this.client(req));
  }

  /** Writers spike their own drafts; editors any pre-release story. */
  @StaffOnly('news.read')
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.cancel(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.read')
  @Post(':id/reopen')
  @HttpCode(200)
  reopen(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VersionDto,
    @Req() req: Request,
  ) {
    return this.workflow.reopen(actor, id, dto.version, this.client(req));
  }

  @StaffOnly('news.correct')
  @Post(':id/correct')
  @HttpCode(200)
  correct(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.workflow.correct(
      actor,
      id,
      dto.version,
      dto.note,
      this.client(req),
    );
  }

  @StaffOnly('news.correct')
  @Post(':id/retract')
  @HttpCode(200)
  retract(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NoteDto,
    @Req() req: Request,
  ) {
    return this.workflow.retract(
      actor,
      id,
      dto.version,
      dto.note,
      this.client(req),
    );
  }

  @StaffOnly('news.feature')
  @Put(':id/flags')
  flags(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FlagsDto,
    @Req() req: Request,
  ) {
    return this.workflow.setFlags(actor, id, dto, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
