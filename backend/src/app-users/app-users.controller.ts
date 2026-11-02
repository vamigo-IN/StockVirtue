import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
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
import {
  AppUsersQueryDto,
  BlockAppUserDto,
  RenameAppUserDto,
} from './app-users.dto';
import { AppUsersService } from './app-users.service';

/** StockVirtue app accounts, for newsroom moderators. */
@Controller({ path: 'staff/users', version: '1' })
export class AppUsersController {
  constructor(
    private readonly users: AppUsersService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @StaffOnly('users.read')
  @Get()
  list(@Query() q: AppUsersQueryDto) {
    return this.users.list({
      q: q.q,
      status: q.status,
      cursor: q.cursor,
      limit: q.limit ?? 25,
    });
  }

  @StaffOnly('users.read')
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @StaffOnly('users.update')
  @Patch(':id')
  rename(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: RenameAppUserDto,
    @Req() req: Request,
  ) {
    return this.users.rename(actor, id, dto.displayName, this.client(req));
  }

  @StaffOnly('users.suspend')
  @Post(':id/block')
  @HttpCode(200)
  block(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: BlockAppUserDto,
    @Req() req: Request,
  ) {
    return this.users.block(actor, id, dto.reason, this.client(req));
  }

  @StaffOnly('users.suspend')
  @Post(':id/unblock')
  @HttpCode(200)
  unblock(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.users.unblock(actor, id, this.client(req));
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
