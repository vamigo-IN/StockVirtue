'use client';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { sortRoles } from '@/portal/roles';
import type { RoleInfo, StaffMe } from '@/portal/types';

/**
 * Same rule the API enforces: Super Admin is granted and removed only in the
 * StockVirtue admin console, and nobody can grant (or take away) a role with
 * permissions they don't hold.
 */
export function canGrantRole(me: StaffMe, role: RoleInfo): boolean {
  if (role.key === 'SUPER_ADMIN') return false;
  if (me.isSuperAdmin) return true;
  return role.permissions.every((p) => me.permissions.includes(p));
}

export function RolePicker({
  me,
  roles,
  value,
  onChange,
  locked = [],
}: {
  me: StaffMe;
  roles: RoleInfo[];
  value: string[];
  onChange: (keys: string[]) => void;
  /** Roles shown ticked but not changeable (held, yet beyond your grant). */
  locked?: string[];
}) {
  const toggle = (key: string, on: boolean) =>
    onChange(on ? [...value, key] : value.filter((k) => k !== key));

  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-1.5">
      {sortRoles(roles).map((role) => {
        const grantable = canGrantRole(me, role) && !locked.includes(role.key);
        const checked = value.includes(role.key);
        const id = `role-${role.key}`;
        return (
          <li key={role.key}>
            <label
              htmlFor={id}
              className={cn(
                'flex gap-3 rounded-md px-2.5 py-2',
                grantable ? 'cursor-pointer hover:bg-accent/60' : 'opacity-60',
              )}
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={!grantable}
                onCheckedChange={(v) => toggle(role.key, v === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {role.name}
                  {!role.isSystem && (
                    <Badge
                      variant="outline"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      Custom
                    </Badge>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {grantable
                    ? role.description ||
                      `${role.permissions.length} permissions`
                    : role.key === 'SUPER_ADMIN'
                      ? 'Granted and removed in the StockVirtue admin console.'
                      : "Includes permissions you don't have, so you can't change it."}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
