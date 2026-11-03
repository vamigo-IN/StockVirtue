import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AppConfig } from '../config/configuration';
import { CurrentStaff, StaffOnly } from '../staff/staff-auth.guard';
import { clientInfo, StaffPrincipal } from '../staff/staff-request';
import { StaffRequestsQuery, UpdateRequestDto } from './privacy.dto';
import { PrivacyRequestsService } from './privacy-requests.service';

/** The privacy request register in the newsroom portal (privacy.manage). */
@Controller({ path: 'staff/privacy', version: '1' })
export class PrivacyStaffController {
  constructor(
    private readonly requests: PrivacyRequestsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('privacy.manage')
  @Get('requests')
  list(@Query() q: StaffRequestsQuery) {
    return this.requests.list(q);
  }

  @StaffOnly('privacy.manage')
  @Get('requests/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(id);
  }

  /** Progress, or the answer (emailed to the person) when closing. */
  @StaffOnly('privacy.manage')
  @Patch('requests/:id')
  update(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
    @Req() req: Request,
  ) {
    return this.requests.update(actor, id, dto, this.client(req));
  }

  /** Deletes the linked account, which also closes the request. */
  @StaffOnly('privacy.manage')
  @Post('requests/:id/erase')
  erase(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.requests.eraseAccount(actor, id, this.client(req));
  }

  /** The linked account's data, to answer an access request. */
  @StaffOnly('privacy.manage')
  @Get('requests/:id/export')
  export(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.requests.exportAccount(actor, id, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
