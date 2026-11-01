import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/configuration';
import { CurrentStaff, StaffOnly } from './staff-auth.guard';
import {
  AcceptInvitationDto,
  AuditQueryDto,
  CreateInvitationDto,
  InvitationTokenDto,
  SetRolesDto,
  SuspendStaffDto,
} from './staff.dto';
import { clientInfo, StaffPrincipal } from './staff-request';
import { StaffService } from './staff.service';

/** Newsroom team management. Every route checks permissions server-side. */
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // ── Members ─────────────────────────────────────────────────────────

  @StaffOnly('staff.read')
  @Get('members')
  members() {
    return this.staff.listMembers();
  }

  @StaffOnly('staff.update')
  @Put('members/:id/roles')
  setRoles(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolesDto,
    @Req() req: Request,
  ) {
    return this.staff.setRoles(actor, id, dto.roleKeys, this.client(req));
  }

  @StaffOnly('staff.suspend')
  @Post('members/:id/suspend')
  @HttpCode(200)
  suspend(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendStaffDto,
    @Req() req: Request,
  ) {
    return this.staff.suspend(actor, id, dto.reason, this.client(req));
  }

  @StaffOnly('staff.suspend')
  @Post('members/:id/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.staff.reactivate(actor, id, this.client(req));
  }

  // ── Roles ───────────────────────────────────────────────────────────

  @StaffOnly('staff.read')
  @Get('roles')
  roles() {
    return this.staff.listRoles();
  }

  @StaffOnly('staff.read')
  @Get('permissions')
  permissions() {
    return this.staff.listPermissions();
  }

  // ── Invitations ─────────────────────────────────────────────────────

  @StaffOnly('staff.read')
  @Get('invitations')
  invitations() {
    return this.staff.listInvitations();
  }

  @StaffOnly('staff.invite')
  @Post('invitations')
  invite(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: CreateInvitationDto,
    @Req() req: Request,
  ) {
    return this.staff.createInvitation(
      actor,
      dto.email,
      dto.roleKeys,
      this.client(req),
    );
  }

  @StaffOnly('staff.invite')
  @Delete('invitations/:id')
  async revokeInvitation(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.staff.revokeInvitation(actor, id, this.client(req));
    return { ok: true };
  }

  // Public: the invitee has no session yet; the token is the credential.
  // POST (not GET) so the token never appears in URLs or access logs.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('invitations/preview')
  @HttpCode(200)
  previewInvitation(@Body() dto: InvitationTokenDto) {
    return this.staff.previewInvitation(dto.token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('invitations/accept')
  @HttpCode(200)
  acceptInvitation(@Body() dto: AcceptInvitationDto, @Req() req: Request) {
    return this.staff.acceptInvitation(
      dto.token,
      dto.password,
      dto.displayName,
      this.client(req),
    );
  }

  // ── Audit log ───────────────────────────────────────────────────────

  @StaffOnly('audit.read')
  @Get('audit')
  auditLog(@Query() q: AuditQueryDto) {
    return this.audit.list({
      action: q.action,
      actorUserId: q.actorUserId,
      entityType: q.entityType,
      entityId: q.entityId,
      before: q.before ? new Date(q.before) : undefined,
      limit: q.limit ?? 50,
    });
  }

  private client(req: Request) {
    return clientInfo(req, this.config.get('site', { infer: true }).adminKey);
  }
}
