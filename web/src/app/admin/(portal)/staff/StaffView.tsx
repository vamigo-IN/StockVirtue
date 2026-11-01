'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  LogOut,
  MailPlus,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
  StatusBadge,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { canGrantRole, RolePicker } from '@/components/portal/RolePicker';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, initials, timeAgo } from '@/portal/format';
import {
  invalidateStaff,
  useInvitations,
  useMembers,
  useRoles,
} from '@/portal/queries';
import type { Invitation, RoleInfo, StaffMember } from '@/portal/types';

type Pending =
  | { kind: 'roles'; member: StaffMember }
  | { kind: 'suspend'; member: StaffMember }
  | { kind: 'reactivate'; member: StaffMember }
  | { kind: 'signout'; member: StaffMember }
  | { kind: 'revoke'; invitation: Invitation }
  | null;

export function StaffView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const members = useMembers();
  const invitations = useInvitations();
  const roles = useRoles();
  const [tab, setTab] = useState('members');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [reason, setReason] = useState('');

  const pendingInvites =
    invitations.data?.filter((i) => i.status === 'PENDING').length ?? 0;
  const close = () => setPending(null);

  return (
    <>
      <PageHeader
        title="Staff"
        description="Everyone who can sign in to the newsroom portal, and the roles that decide what they can do."
        actions={
          can(me, 'staff.invite') && (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Invite
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="members">
            Members
            {members.data && (
              <Badge variant="secondary" className="ml-1 px-1.5">
                {members.data.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invitations">
            Invitations
            {pendingInvites > 0 && (
              <Badge className="ml-1 px-1.5">{pendingInvites}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          {members.error ? (
            <QueryError
              error={members.error}
              onRetry={() => void members.refetch()}
            />
          ) : members.isPending ? (
            <RowsSkeleton />
          ) : (
            <MembersTable
              members={members.data}
              onAction={(p) => {
                setReason('');
                setPending(p);
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="invitations" className="mt-4">
          {invitations.error ? (
            <QueryError
              error={invitations.error}
              onRetry={() => void invitations.refetch()}
            />
          ) : invitations.isPending ? (
            <RowsSkeleton rows={3} />
          ) : (
            <InvitationsTable
              invitations={invitations.data}
              roles={roles.data ?? []}
              onRevoke={(invitation) =>
                setPending({ kind: 'revoke', invitation })
              }
            />
          )}
        </TabsContent>
      </Tabs>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles.data ?? []}
        onSent={() => setTab('invitations')}
      />

      {pending?.kind === 'roles' && (
        <EditRolesDialog
          member={pending.member}
          roles={roles.data ?? []}
          onClose={close}
        />
      )}

      <ConfirmDialog
        open={pending?.kind === 'suspend'}
        onOpenChange={(o) => !o && close()}
        title={`Suspend ${pending?.kind === 'suspend' ? pending.member.displayName : ''}?`}
        description="They are signed out everywhere straight away and can't sign in to the portal until reactivated. Their app account is not affected."
        confirmLabel="Suspend"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== 'suspend') return;
          await api(`staff/members/${pending.member.id}/suspend`, {
            method: 'POST',
            body: reason.trim() ? { reason: reason.trim() } : {},
          });
          invalidateStaff(qc);
          toast.success(`${pending.member.displayName} is suspended.`);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">
            Reason (optional, kept in the audit log)
          </Label>
          <Textarea
            id="suspend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'reactivate'}
        onOpenChange={(o) => !o && close()}
        title={`Reactivate ${pending?.kind === 'reactivate' ? pending.member.displayName : ''}?`}
        description="They can sign in again with the roles they had before."
        confirmLabel="Reactivate"
        onConfirm={async () => {
          if (pending?.kind !== 'reactivate') return;
          await api(`staff/members/${pending.member.id}/reactivate`, {
            method: 'POST',
          });
          invalidateStaff(qc);
          toast.success(`${pending.member.displayName} can sign in again.`);
        }}
      />

      <ConfirmDialog
        open={pending?.kind === 'signout'}
        onOpenChange={(o) => !o && close()}
        title={`Sign ${pending?.kind === 'signout' ? pending.member.displayName : ''} out everywhere?`}
        description="Every portal session they have ends now. They can sign in again with their password and an emailed code."
        confirmLabel="Sign out everywhere"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== 'signout') return;
          const res = await api<{ signedOut: number }>(
            `staff/members/${pending.member.id}/sign-out`,
            { method: 'POST' },
          );
          invalidateStaff(qc);
          void qc.invalidateQueries({ queryKey: ['sessions'] });
          toast.success(
            res.signedOut === 0
              ? `${pending.member.displayName} had no active sessions.`
              : `Ended ${res.signedOut} session${res.signedOut === 1 ? '' : 's'}.`,
          );
        }}
      />

      <ConfirmDialog
        open={pending?.kind === 'revoke'}
        onOpenChange={(o) => !o && close()}
        title="Revoke this invitation?"
        description={`The link sent to ${pending?.kind === 'revoke' ? pending.invitation.email : ''} stops working. You can invite them again later.`}
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== 'revoke') return;
          await api(`staff/invitations/${pending.invitation.id}`, {
            method: 'DELETE',
          });
          invalidateStaff(qc);
          toast.success('Invitation revoked.');
        }}
      />
    </>
  );
}

function MembersTable({
  members,
  onAction,
}: {
  members: StaffMember[];
  onAction: (p: NonNullable<Pending>) => void;
}) {
  const me = usePortalMe();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [
        m.displayName,
        m.email ?? '',
        m.title ?? '',
        ...m.roles.map((r) => r.name),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [members, query]);

  const canEditRoles = can(me, 'staff.update');
  const canSuspend = can(me, 'staff.suspend');
  const canSignOut = can(me, 'security.manage');

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or role"
          className="pl-9"
          aria-label="Search staff"
        />
      </div>
      {shown.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query ? 'No one matches that search' : 'No staff yet'}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="pl-4">Member</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last portal sign-in
                </TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((m) => {
                const self = m.userId === me.userId;
                const hasActions =
                  !self && (canEditRoles || canSuspend || canSignOut);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                            {initials(m.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{m.displayName}</span>
                            {self && (
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 text-[10px]"
                              >
                                You
                              </Badge>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.email}
                            {m.title ? ` · ${m.title}` : ''}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {m.roles.map((r) => (
                          <Badge
                            key={r.key}
                            variant={
                              r.key === 'SUPER_ADMIN' ? 'default' : 'secondary'
                            }
                          >
                            {r.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={m.status} />
                        {m.accountBlocked && (
                          <span className="text-xs text-destructive">
                            App account blocked
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className="hidden text-sm text-muted-foreground md:table-cell"
                      title={formatDateTime(m.lastPortalLoginAt)}
                    >
                      {timeAgo(m.lastPortalLoginAt)}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      {hasActions && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${m.displayName}`}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {canEditRoles && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  onAction({ kind: 'roles', member: m })
                                }
                              >
                                <ShieldCheck /> Change roles
                              </DropdownMenuItem>
                            )}
                            {canSignOut && m.status === 'ACTIVE' && (
                              <DropdownMenuItem
                                onSelect={() =>
                                  onAction({ kind: 'signout', member: m })
                                }
                              >
                                <LogOut /> Sign out everywhere
                              </DropdownMenuItem>
                            )}
                            {canSuspend && (
                              <>
                                <DropdownMenuSeparator />
                                {m.status === 'ACTIVE' ? (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() =>
                                      onAction({ kind: 'suspend', member: m })
                                    }
                                  >
                                    <Ban /> Suspend
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      onAction({
                                        kind: 'reactivate',
                                        member: m,
                                      })
                                    }
                                  >
                                    <RotateCcw /> Reactivate
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function InvitationsTable({
  invitations,
  roles,
  onRevoke,
}: {
  invitations: Invitation[];
  roles: RoleInfo[];
  onRevoke: (i: Invitation) => void;
}) {
  const me = usePortalMe();
  const name = (key: string) => roles.find((r) => r.key === key)?.name ?? key;
  if (invitations.length === 0) {
    return (
      <EmptyState icon={MailPlus} title="No invitations yet">
        Invite someone to give them access to the newsroom.
      </EmptyState>
    );
  }
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="pl-4">Email</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Sent</TableHead>
            <TableHead className="hidden md:table-cell">Expires</TableHead>
            <TableHead className="w-24 pr-4">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="pl-4 font-medium">{i.email}</TableCell>
              <TableCell>
                <div className="flex max-w-xs flex-wrap gap-1">
                  {i.roleKeys.map((k) => (
                    <Badge key={k} variant="secondary">
                      {name(k)}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <StatusBadge status={i.status} />
              </TableCell>
              <TableCell
                className="hidden text-sm text-muted-foreground md:table-cell"
                title={formatDateTime(i.createdAt)}
              >
                {timeAgo(i.createdAt)}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                {i.status === 'PENDING' ? formatDateTime(i.expiresAt) : '—'}
              </TableCell>
              <TableCell className="pr-4 text-right">
                {i.status === 'PENDING' && can(me, 'staff.invite') && (
                  <Button variant="ghost" size="sm" onClick={() => onRevoke(i)}>
                    Revoke
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  roles,
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RoleInfo[];
  onSent: () => void;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [keys, setKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset(o: boolean) {
    if (busy) return;
    if (!o) {
      setEmail('');
      setKeys([]);
      setError(null);
    }
    onOpenChange(o);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return setError('Enter a valid email address.');
    }
    if (keys.length === 0) return setError('Pick at least one role.');
    setBusy(true);
    try {
      await api('staff/invitations', {
        method: 'POST',
        body: { email: email.trim(), roleKeys: keys },
      });
      invalidateStaff(qc);
      toast.success(`Invitation sent to ${email.trim()}.`);
      setBusy(false);
      reset(false);
      onSent();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={send} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Invite to the newsroom</DialogTitle>
            <DialogDescription>
              We&apos;ll email a link that&apos;s valid for 3 days. They sign in
              with their StockVirtue account, or create one from the link.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Roles</Label>
            <RolePicker me={me} roles={roles} value={keys} onChange={setKeys} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => reset(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditRolesDialog({
  member,
  roles,
  onClose,
}: {
  member: StaffMember;
  roles: RoleInfo[];
  onClose: () => void;
}) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const [keys, setKeys] = useState(() => member.roles.map((r) => r.key));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Held roles you couldn't grant stay as they are.
  const locked = member.roles
    .map((r) => roles.find((x) => x.key === r.key))
    .filter((r): r is RoleInfo => !!r && !canGrantRole(me, r))
    .map((r) => r.key);

  async function save() {
    setError(null);
    if (keys.length === 0) {
      return setError(
        "Keep at least one role. To remove someone's access, suspend them instead.",
      );
    }
    setBusy(true);
    try {
      await api(`staff/members/${member.id}/roles`, {
        method: 'PUT',
        body: { roleKeys: keys },
      });
      invalidateStaff(qc);
      toast.success(`Roles updated for ${member.displayName}.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Roles for {member.displayName}</DialogTitle>
          <DialogDescription>
            Changes apply within a minute, on their next action in the portal.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <RolePicker
          me={me}
          roles={roles}
          value={keys}
          onChange={setKeys}
          locked={locked}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save roles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
