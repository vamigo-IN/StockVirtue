import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES, permissionGroup } from './rbac.catalog';

export interface RbacSyncResult {
  permissions: number;
  roles: number;
  /** System-role grants added or removed to match the catalogue. */
  changedGrants: number;
}

/**
 * Brings the permission catalogue and the system roles in the database in line
 * with rbac.catalog.ts. Idempotent and safe to run on every boot:
 *  - permissions are upserted, never deleted (a rolled-back deploy must not
 *    strip grants a newer one added);
 *  - system roles are upserted and their permission sets reset to the
 *    catalogue's;
 *  - custom roles and user-role assignments are never touched.
 *
 * Takes a bare PrismaClient so the bootstrap CLI can run it without Nest.
 */
export async function syncRbacCatalog(
  prisma: PrismaClient,
): Promise<RbacSyncResult> {
  let changedGrants = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const p of PERMISSIONS) {
        await tx.permission.upsert({
          where: { key: p.key },
          create: {
            key: p.key,
            group: permissionGroup(p.key),
            description: p.description,
          },
          update: { group: permissionGroup(p.key), description: p.description },
        });
      }

      for (const def of SYSTEM_ROLES) {
        const role = await tx.role.upsert({
          where: { key: def.key },
          create: {
            key: def.key,
            name: def.name,
            description: def.description,
            isSystem: true,
          },
          update: {
            name: def.name,
            description: def.description,
            isSystem: true,
          },
        });
        const want = new Set<string>(def.permissions);
        const have = await tx.rolePermission.findMany({
          where: { roleId: role.id },
          select: { permissionKey: true },
        });
        const haveKeys = new Set(have.map((h) => h.permissionKey));
        const stale = [...haveKeys].filter((k) => !want.has(k));
        const missing = [...want].filter((k) => !haveKeys.has(k));
        if (stale.length > 0) {
          await tx.rolePermission.deleteMany({
            where: { roleId: role.id, permissionKey: { in: stale } },
          });
        }
        if (missing.length > 0) {
          await tx.rolePermission.createMany({
            data: missing.map((permissionKey) => ({
              roleId: role.id,
              permissionKey,
            })),
            skipDuplicates: true,
          });
        }
        changedGrants += stale.length + missing.length;
      }
    },
    { timeout: 30_000 },
  );
  return {
    permissions: PERMISSIONS.length,
    roles: SYSTEM_ROLES.length,
    changedGrants,
  };
}
