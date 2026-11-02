import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../../config/configuration';
import { CurrentStaff, StaffOnly } from '../../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../../staff/staff-request';
import { ArticleCollabService } from './article-collab.service';
import {
  AssignmentDto,
  AssignmentUpdateDto,
  CommentDto,
  CommentUpdateDto,
} from './articles.dto';

/** Comments, assignments and work queues around articles. */
@Controller({ path: 'staff', version: '1' })
export class ArticleCollabController {
  constructor(
    private readonly collab: ArticleCollabService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('news.read')
  @Get('my-work')
  myWork(@CurrentStaff() actor: StaffPrincipal) {
    return this.collab.myWork(actor);
  }

  @StaffOnly('news.assign')
  @Get('directory')
  directory() {
    return this.collab.directory();
  }

  @StaffOnly('news.read')
  @Get('articles/:id/comments')
  comments(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.collab.listComments(actor, id);
  }

  @StaffOnly('news.comment')
  @Post('articles/:id/comments')
  addComment(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentDto,
    @Req() req: Request,
  ) {
    return this.collab.addComment(actor, id, dto, this.client(req));
  }

  @StaffOnly('news.read')
  @Patch('comments/:commentId')
  updateComment(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: CommentUpdateDto,
    @Req() req: Request,
  ) {
    return this.collab.updateComment(actor, commentId, dto, this.client(req));
  }

  @StaffOnly('news.read')
  @Delete('comments/:commentId')
  async deleteComment(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() req: Request,
  ) {
    await this.collab.deleteComment(actor, commentId, this.client(req));
    return { ok: true };
  }

  @StaffOnly('news.assign')
  @Post('articles/:id/assignments')
  assign(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignmentDto,
    @Req() req: Request,
  ) {
    return this.collab.assign(actor, id, dto, this.client(req));
  }

  @StaffOnly('news.read')
  @Patch('assignments/:assignmentId')
  updateAssignment(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: AssignmentUpdateDto,
    @Req() req: Request,
  ) {
    return this.collab.updateAssignment(
      actor,
      assignmentId,
      dto.status,
      this.client(req),
    );
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
