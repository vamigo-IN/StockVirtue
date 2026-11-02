'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Lock, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { can, groupLabel } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { invalidateStaff, usePermissions, useRoles } from '@/portal/queries';
import { sortRoles } from '@/portal/roles';
import type { PermissionInfo, RoleInfo } from '@/portal/types';

type Editing = { mode: 'view' | 'edit' | 'create'; role?: RoleInfo } | null;

function grouped(permissions: PermissionInfo[]) {
  const map = new Map<string, PermissionInfo[]>();
  for (const p of permissions) {
    map.set(p.group, [...(map.get(p.group) ?? []), p]);
  }
  return [...map.entries()];
}

export function RolesView() {
  const me = usePortalMe();
  const roles = useRoles();
  const permissions = usePermissions();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<RoleInfo | null>(null);
  const qc = useQueryClient();
  const manage = can(me, 'roles.manage');

  const error = roles.error ?? permissions.error;

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="A role is a named set of permissions. Built-in roles follow the newsroom's standard desks; custom roles fit anything else."
        actions={
          manage && (
            <Button onClick={() => setEditing({ mode: 'create' })}>
              <Plus /> New role
            </Button>
          )
        }
      />
      {error ? (
        <QueryError
          error={error}
          onRetry={() => {
            void roles.refetch();
            void permissions.refetch();
          }}
        />
      ) : !roles.data || !permissions.data ? (
        <RowsSkeleton rows={4} />
      ) : (
        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="matrix">Compare permissions</TabsTrigger>
          </TabsList>
          <TabsContent value="roles" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortRoles(roles.data).map((role) => (
                <Card key={role.key} className="gap-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {role.name}
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0 text-[10px] font-medium"
                      >
                        {role.isSystem ? 'Built-in' : 'Custom'}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="line-clamp-2 min-h-10">
                      {role.description || 'No description.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" aria-hidden />{' '}
                      {role.memberCount}{' '}
                      {role.memberCount === 1 ? 'person' : 'people'}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Check className="size-4" aria-hidden />{' '}
                      {role.permissions.length} permissions
                    </span>
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditing({
                          mode: manage && !role.isSystem ? 'edit' : 'view',
                          role,
                        })
                      }
                    >
                      {manage && !role.isSystem ? 'Edit' : 'View'}
                    </Button>
                    {manage && !role.isSystem && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(role)}
                      >
                        <Trash2 /> Delete
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="matrix" className="mt-4">
            <Matrix
              roles={sortRoles(roles.data)}
              permissions={permissions.data}
            />
          </TabsContent>
        </Tabs>
      )}

      {editing && permissions.data && (
        <RoleSheet
          key={editing.role?.key ?? 'new'}
          editing={editing}
          permissions={permissions.data}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete the ${deleting?.name ?? ''} role?`}
        description={
          deleting && deleting.memberCount > 0
            ? `${deleting.memberCount} ${deleting.memberCount === 1 ? 'person still has' : 'people still have'} this role. Remove it from them on the Staff page first.`
            : 'This can’t be undone. Nobody holds this role right now.'
        }
        confirmLabel="Delete role"
        destructive
        onConfirm={async () => {
          if (!deleting) return;
          await api(`staff/roles/${deleting.key}`, { method: 'DELETE' });
          invalidateStaff(qc);
          toast.success(`Deleted the ${deleting.name} role.`);
        }}
      />
    </>
  );
}

function Matrix({
  roles,
  permissions,
}: {
  roles: RoleInfo[];
  permissions: PermissionInfo[];
}) {
  const sets = useMemo(
    () => new Map(roles.map((r) => [r.key, new Set(r.permissions)])),
    [roles],
  );
  return (
    <Card className="overflow-hidden py-0">
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 min-w-60 border-b bg-card px-4 py-3 text-left font-medium">
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r.key}
                  scope="col"
                  className="sticky top-0 z-10 border-b bg-card px-2 py-3 text-center text-xs font-medium whitespace-nowrap"
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped(permissions).map(([group, perms]) => (
              <MatrixGroup
                key={group}
                group={group}
                perms={perms}
                roles={roles}
                sets={sets}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MatrixGroup({
  group,
  perms,
  roles,
  sets,
}: {
  group: string;
  perms: PermissionInfo[];
  roles: RoleInfo[];
  sets: Map<string, Set<string>>;
}) {
  return (
    <>
      <tr>
        <th
          colSpan={roles.length + 1}
          scope="colgroup"
          className="sticky left-0 border-b bg-muted/60 px-4 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {groupLabel(group)}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p.key} className="hover:bg-accent/30">
          <th
            scope="row"
            className="sticky left-0 border-b bg-card px-4 py-2 text-left font-normal"
          >
            <span className="block">{p.description}</span>
            <code className="font-mono text-[11px] text-muted-foreground">
              {p.key}
            </code>
          </th>
          {roles.map((r) => (
            <td key={r.key} className="border-b px-2 py-2 text-center">
              {sets.get(r.key)?.has(p.key) ? (
                <Check
                  className="mx-auto size-4 text-success"
                  aria-label="Yes"
                />
              ) : (
                <span className="text-muted-foreground/40" aria-label="No">
                  ·
                </span>
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function RoleSheet({
  editing,
  permissions,
  onClose,
}: {
  editing: NonNullable<Editing>;
  permissions: PermissionInfo[];
  onClose: () => void;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const readOnly = editing.mode === 'view';
  const [name, setName] = useState(editing.role?.name ?? '');
  const [description, setDescription] = useState(
    editing.role?.description ?? '',
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(editing.role?.permissions ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // You can only bundle permissions you hold yourself (the API checks too).
  const holds = (key: string) =>
    me.isSuperAdmin || me.permissions.includes(key);

  function toggle(key: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function save() {
    setError(null);
    if (name.trim().length < 2)
      return setError('Give the role a name of at least 2 characters.');
    if (selected.size === 0) return setError('Pick at least one permission.');
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim(),
        permissions: [...selected],
      };
      if (editing.mode === 'create') {
        await api('staff/roles', { method: 'POST', body });
        toast.success(`Created the ${body.name} role.`);
      } else {
        await api(`staff/roles/${editing.role!.key}`, { method: 'PUT', body });
        toast.success(`Saved the ${body.name} role.`);
      }
      invalidateStaff(qc);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const title =
    editing.mode === 'create'
      ? 'New custom role'
      : editing.mode === 'edit'
        ? `Edit ${editing.role!.name}`
        : editing.role!.name;

  return (
    <Sheet open onOpenChange={(o) => !o && !busy && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {readOnly
              ? editing.role?.isSystem
                ? "Built-in roles are defined by StockVirtue and can't be edited. Create a custom role for a different mix."
                : 'You can view this role, but changing roles needs the roles.manage permission.'
              : 'People with this role get every permission ticked below.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!readOnly && (
            <>
              <div className="space-y-2">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Sports desk"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role-desc">Description</Label>
                <Textarea
                  id="role-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={300}
                  rows={2}
                />
              </div>
            </>
          )}
          {grouped(permissions).map(([group, perms]) => {
            const shown = readOnly
              ? perms.filter((p) => selected.has(p.key))
              : perms;
            if (shown.length === 0) return null;
            const all = perms.every(
              (p) => selected.has(p.key) || !holds(p.key),
            );
            return (
              <fieldset key={group} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <legend className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {groupLabel(group)}
                  </legend>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() =>
                        perms.forEach(
                          (p) => holds(p.key) && toggle(p.key, !all),
                        )
                      }
                    >
                      {all ? 'Clear' : 'Select all'}
                    </Button>
                  )}
                </div>
                <ul className="divide-y rounded-lg border">
                  {shown.map((p) => {
                    const allowed = holds(p.key);
                    const id = `perm-${p.key}`;
                    return (
                      <li key={p.key}>
                        <label
                          htmlFor={id}
                          className={cn(
                            'flex items-start gap-3 px-3 py-2',
                            !readOnly &&
                              allowed &&
                              'cursor-pointer hover:bg-accent/40',
                          )}
                        >
                          {readOnly ? (
                            <Check
                              className="mt-0.5 size-4 shrink-0 text-success"
                              aria-hidden
                            />
                          ) : (
                            <Checkbox
                              id={id}
                              checked={selected.has(p.key)}
                              disabled={!allowed}
                              onCheckedChange={(v) => toggle(p.key, v === true)}
                              className="mt-0.5"
                            />
                          )}
                          <span className="min-w-0 text-sm">
                            <span className="block">{p.description}</span>
                            <code className="font-mono text-[11px] text-muted-foreground">
                              {p.key}
                            </code>
                          </span>
                          {!readOnly && !allowed && (
                            <Lock
                              className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                              aria-label="You don't hold this permission"
                            />
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
        {!readOnly && (
          <SheetFooter className="flex-row justify-end border-t">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy
                ? 'Saving…'
                : editing.mode === 'create'
                  ? 'Create role'
                  : 'Save changes'}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
