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
  RoleBodyDto,
  SetRolesDto,
  SuspendStaffDto,
} from './staff.dto';
import { StaffDashboardService } from './staff-dashboard.service';
import { clientInfo, StaffPrincipal } from './staff-request';
import { StaffSecurityService } from './staff-security.service';
import { StaffService } from './staff.service';

/** Newsroom team management. Every route checks permissions server-side. */
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly security: StaffSecurityService,
    private readonly dashboard: StaffDashboardService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Home-page figures; each section only for those allowed to see it. */
  @StaffOnly()
  @Get('dashboard')
  overview(@CurrentStaff() staff: StaffPrincipal) {
    return this.dashboard.overview(staff);
  }

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

  @StaffOnly('security.manage')
  @Post('members/:id/sign-out')
  @HttpCode(200)
  signOutMember(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.security.signOutEverywhere(actor, id, this.client(req));
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

  @StaffOnly('roles.manage')
  @Post('roles')
  createRole(
    @CurrentStaff() actor: StaffPrincipal,
    @Body() dto: RoleBodyDto,
    @Req() req: Request,
  ) {
    return this.staff.createRole(actor, dto, this.client(req));
  }

  @StaffOnly('roles.manage')
  @Put('roles/:key')
  updateRole(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Body() dto: RoleBodyDto,
    @Req() req: Request,
  ) {
    return this.staff.updateRole(actor, key, dto, this.client(req));
  }

  @StaffOnly('roles.manage')
  @Delete('roles/:key')
  async deleteRole(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('key') key: string,
    @Req() req: Request,
  ) {
    await this.staff.deleteRole(actor, key, this.client(req));
    return { ok: true };
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

  // ── Security ────────────────────────────────────────────────────────

  @StaffOnly('security.manage')
  @Get('security/sessions')
  allSessions(@CurrentStaff() actor: StaffPrincipal) {
    return this.security.listSessions(actor);
  }

  @StaffOnly('security.manage')
  @Delete('security/sessions/:id')
  async revokeAnySession(
    @CurrentStaff() actor: StaffPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    await this.security.revokeSession(actor, id, this.client(req));
    return { ok: true };
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
