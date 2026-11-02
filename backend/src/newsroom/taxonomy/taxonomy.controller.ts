import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import { has } from '../articles/article-access';
import { AuthorDto, CategoryDto, TagDto, TagQueryDto } from './taxonomy.dto';
import { TaxonomyService } from './taxonomy.service';

/** Categories, tags and bylines. Anyone in the newsroom can read them. */
@Controller({ path: 'staff', version: '1' })
export class TaxonomyController {
  constructor(
    private readonly taxonomy: TaxonomyService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ── Categories ──────────────────────────────────────────────────────

  @StaffOnly('news.read')
  @Get('categories')
  categories() {
    return this.taxonomy.listCategories();
  }

  @StaffOnly('taxonomy.manage')
  @Post('categories')
  createCategory(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CategoryDto,
    @Req() req: Request,
  ) {
    return this.taxonomy.createCategory(actor, dto, this.client(req));
  }

  @StaffOnly('taxonomy.manage')
  @Put('categories/:id')
  updateCategory(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryDto,
    @Req() req: Request,
  ) {
    return this.taxonomy.updateCategory(actor, id, dto, this.client(req));
  }

  @StaffOnly('taxonomy.manage')
  @Delete('categories/:id')
  async deleteCategory(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.taxonomy.deleteCategory(actor, id, this.client(req));
    return { ok: true };
  }

  // ── Tags ────────────────────────────────────────────────────────────

  @StaffOnly('news.read')
  @Get('tags')
  tags(@Query() q: TagQueryDto) {
    return this.taxonomy.listTags(q.q);
  }

  /** Writers add tags while tagging a story; taxonomy managers too. */
  @StaffOnly()
  @Post('tags')
  createTag(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: TagDto,
    @Req() req: Request,
  ) {
    if (!has(actor, 'news.create') && !has(actor, 'taxonomy.manage')) {
      throw new ForbiddenException(
        'You don\'t have permission to do this (needs "news.create" or "taxonomy.manage"). Ask a newsroom admin.',
      );
    }
    return this.taxonomy.createTag(actor, dto.name, this.client(req));
  }

  @StaffOnly('taxonomy.manage')
  @Patch('tags/:id')
  renameTag(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TagDto,
    @Req() req: Request,
  ) {
    return this.taxonomy.renameTag(actor, id, dto.name, this.client(req));
  }

  @StaffOnly('taxonomy.manage')
  @Delete('tags/:id')
  async deleteTag(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.taxonomy.deleteTag(actor, id, this.client(req));
    return { ok: true };
  }

  // ── Bylines ─────────────────────────────────────────────────────────

  @StaffOnly('news.read')
  @Get('authors')
  authors() {
    return this.taxonomy.listAuthors();
  }

  @StaffOnly('taxonomy.manage')
  @Post('authors')
  createAuthor(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: AuthorDto,
    @Req() req: Request,
  ) {
    return this.taxonomy.saveAuthor(actor, null, dto, this.client(req));
  }

  @StaffOnly('taxonomy.manage')
  @Put('authors/:id')
  updateAuthor(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AuthorDto,
    @Req() req: Request,
  ) {
    return this.taxonomy.saveAuthor(actor, id, dto, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
