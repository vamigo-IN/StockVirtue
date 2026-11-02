import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SUPER_ADMIN } from './rbac.catalog';
import { syncRbacCatalog } from './rbac.sync';

/// How long a user's resolved permission set is cached. Short, and any role
/// change bumps the cache version, so grants and revocations apply at once.
const PERMS_CACHE_TTL_SEC = 60;
const VERSION_KEY = 'rbac:version';

export interface UserAccess {
  roles: string[];
  permissions: Set<string>;
}

@Injectable()
export class RbacService implements OnModuleInit {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Never let the newsroom block the trading API from booting: if the
    // newsroom migration hasn't been deployed yet, log and carry on — staff
    // sign-in will report the problem instead.
    try {
      const r = await syncRbacCatalog(this.prisma);
      if (r.changedGrants > 0) await this.bumpVersion();
      this.logger.log(
        `RBAC catalogue synced: ${r.permissions} permissions, ${r.roles} system roles (${r.changedGrants} grant changes)`,
      );
    } catch (err) {
      this.logger.error(
        `RBAC catalogue sync failed — newsroom staff access is unavailable until it succeeds: ${(err as Error).message}`,
      );
    }
  }

  /** Roles and the union of their permissions for a user (cached briefly). */
  async accessFor(userId: string): Promise<UserAccess> {
    const version = await this.version();
    const key = `rbac:access:${version}:${userId}`;
    const cached = await this.redis.client.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as {
        roles: string[];
        permissions: string[];
      };
      return { roles: parsed.roles, permissions: new Set(parsed.permissions) };
    }
    const grants = await this.prisma.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            key: true,
            permissions: { select: { permissionKey: true } },
          },
        },
      },
    });
    const roles = grants.map((g) => g.role.key).sort();
    const permissions = new Set<string>();
    for (const g of grants) {
      for (const p of g.role.permissions) permissions.add(p.permissionKey);
    }
    await this.redis.client.set(
      key,
      JSON.stringify({ roles, permissions: [...permissions].sort() }),
      'EX',
      PERMS_CACHE_TTL_SEC,
    );
    return { roles, permissions };
  }

  isSuperAdmin(access: UserAccess): boolean {
    return access.roles.includes(SUPER_ADMIN);
  }

  /** Invalidates every cached permission set (call after any role change). */
  async bumpVersion(): Promise<void> {
    await this.redis.client.incr(VERSION_KEY);
  }

  private async version(): Promise<string> {
    return (await this.redis.client.get(VERSION_KEY)) ?? '0';
  }
}
