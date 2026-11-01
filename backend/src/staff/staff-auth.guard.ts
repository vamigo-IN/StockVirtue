import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AppConfig } from '../config/configuration';
import { PermissionKey, SUPER_ADMIN } from '../rbac/rbac.catalog';
import { StaffAuthService } from './staff-auth.service';
import { clientInfo, StaffPrincipal, StaffRequest } from './staff-request';

export const STAFF_PERMISSIONS_KEY = 'newsroom:permissions';

/**
 * Signs the staff session in from the `x-staff-session` header, then checks
 * every permission the route declared with @StaffOnly(...). Enforced here on
 * the server; the portal hiding a button is never the protection.
 */
@Injectable()
export class StaffAuthGuard implements CanActivate {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<StaffRequest>();
    const token = req.header('x-staff-session') ?? '';
    const client = clientInfo(
      req,
      this.config.get('site', { infer: true }).adminKey,
    );
    const principal = await this.auth.authenticate(token, client);
    req.staff = principal;

    const required =
      this.reflector.getAllAndOverride<PermissionKey[]>(STAFF_PERMISSIONS_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    if (principal.roles.includes(SUPER_ADMIN)) return true;
    const missing = required.find((p) => !principal.permissions.has(p));
    if (missing) {
      throw new ForbiddenException(
        `You don't have permission to do this (needs "${missing}"). Ask a newsroom admin.`,
      );
    }
    return true;
  }
}

/** Staff session required, plus every listed permission. */
export function StaffOnly(...permissions: PermissionKey[]) {
  return applyDecorators(
    SetMetadata(STAFF_PERMISSIONS_KEY, permissions),
    UseGuards(StaffAuthGuard),
  );
}

/** The signed-in staff member (only on @StaffOnly routes). */
export const CurrentStaff = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): StaffPrincipal => {
    const staff = ctx.switchToHttp().getRequest<StaffRequest>().staff;
    if (!staff) throw new ForbiddenException('Staff session missing.');
    return staff;
  },
);
