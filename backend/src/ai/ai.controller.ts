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
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import { AiJobsService } from './ai-jobs.service';
import { AiSettingsService } from './ai-settings.service';
import {
  AiProviderDto,
  CreateAiJobDto,
  ListAiJobsQuery,
  UpdateAiSettingsDto,
} from './ai.dto';

/**
 * The AI assistant: requests and their history (ai.use), and the switch,
 * providers and limits (ai.configure). Provider keys are write-only.
 */
@Controller({ path: 'staff/ai', version: '1' })
export class AiController {
  constructor(
    private readonly jobs: AiJobsService,
    private readonly settings: AiSettingsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('ai.use')
  @Get('status')
  status(@CurrentStaff() actor: StaffPrincipal) {
    return this.jobs.status(actor);
  }

  @StaffOnly('ai.use')
  @Post('jobs')
  create(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CreateAiJobDto,
    @Req() req: Request,
  ) {
    return this.jobs.create(actor, dto, this.client(req));
  }

  @StaffOnly('ai.use')
  @Get('jobs')
  list(@CurrentStaff() actor: StaffPrincipal, @Query() q: ListAiJobsQuery) {
    return this.jobs.list(actor, q);
  }

  @StaffOnly('ai.use')
  @Get('jobs/:id')
  get(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobs.get(actor, id);
  }

  @StaffOnly('ai.use')
  @Post('jobs/:id/applied')
  applied(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.jobs.applied(actor, id, this.client(req));
  }

  @StaffOnly('ai.configure')
  @Get('settings')
  view() {
    return this.settings.view();
  }

  @StaffOnly('ai.configure')
  @Put('settings')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: UpdateAiSettingsDto,
    @Req() req: Request,
  ) {
    return this.settings.update(actor, dto, this.client(req));
  }

  @StaffOnly('ai.configure')
  @Get('usage')
  usage() {
    return this.settings.usage();
  }

  @StaffOnly('ai.configure')
  @Post('providers')
  createProvider(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: AiProviderDto,
    @Req() req: Request,
  ) {
    return this.settings.createProvider(actor, dto, this.client(req));
  }

  @StaffOnly('ai.configure')
  @Patch('providers/:id')
  updateProvider(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiProviderDto,
    @Req() req: Request,
  ) {
    return this.settings.updateProvider(actor, id, dto, this.client(req));
  }

  @StaffOnly('ai.configure')
  @Delete('providers/:id')
  @HttpCode(204)
  async deleteProvider(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.settings.deleteProvider(actor, id, this.client(req));
  }

  @StaffOnly('ai.configure')
  @Post('providers/:id/test')
  test(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.settings.testProvider(actor, id, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
