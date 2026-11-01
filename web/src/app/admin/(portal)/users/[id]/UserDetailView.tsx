'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  PencilLine,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ConfirmDialog,
  QueryError,
  RowsSkeleton,
  StatusBadge,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import {
  auditLabel,
  formatCount,
  formatDateTime,
  formatINR,
  initials,
  SIGN_IN_LABELS,
  timeAgo,
} from '@/portal/format';
import { qk, useAppUser } from '@/portal/queries';
import type { AppUserDetail } from '@/portal/types';

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

function describeChange(m: AppUserDetail['moderation'][number]): string | null {
  const before = m.before as { displayName?: string } | null;
  const after = m.after as { displayName?: string } | null;
  if (m.action === 'user.rename' && before && after) {
    return `“${before.displayName ?? '—'}” → “${after.displayName ?? '—'}”`;
  }
  const reason = (m.meta as { reason?: string | null } | null)?.reason;
  return reason ? `Reason: ${reason}` : null;
}

export function UserDetailView({ id }: { id: string }) {
  const me = usePortalMe();
  const qc = useQueryClient();
  const user = useAppUser(id);
  const [renaming, setRenaming] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [unblocking, setUnblocking] = useState(false);
  const [reason, setReason] = useState('');

  const refresh = (u: AppUserDetail) => {
    qc.setQueryData(qk.user(id), u);
    void qc.invalidateQueries({ queryKey: ['users'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const back = (
    <Button
      variant="ghost"
      size="sm"
      asChild
      className="-ml-2 mb-3 text-muted-foreground"
    >
      <Link href="/admin/users">
        <ArrowLeft /> App users
      </Link>
    </Button>
  );

  if (user.error) {
    return (
      <>
        {back}
        <QueryError error={user.error} onRetry={() => void user.refetch()} />
      </>
    );
  }
  if (user.isPending) {
    return (
      <>
        {back}
        <RowsSkeleton rows={4} />
      </>
    );
  }

  const u = user.data;
  const self = u.id === me.userId;
  const staffLocked = u.isStaff && !me.isSuperAdmin;
  const canBlock = can(me, 'users.suspend') && !self && !staffLocked;

  return (
    <>
      {back}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {u.avatarUrl && (
              <AvatarImage
                src={u.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials(u.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              <span className="truncate">{u.displayName || 'Unnamed'}</span>
              <StatusBadge status={u.status} />
              {u.isStaff && <Badge variant="outline">Newsroom staff</Badge>}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {u.email ?? 'No email'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(me, 'users.update') && (
            <Button variant="outline" onClick={() => setRenaming(true)}>
              <PencilLine /> Rename
            </Button>
          )}
          {canBlock &&
            (u.status === 'BLOCKED' ? (
              <Button variant="outline" onClick={() => setUnblocking(true)}>
                <RotateCcw /> Unblock
              </Button>
            ) : (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setReason('');
                  setBlocking(true);
                }}
              >
                <Ban /> Block
              </Button>
            ))}
        </div>
      </div>

      {staffLocked && can(me, 'users.suspend') && (
        <Alert className="mb-6">
          <AlertCircle />
          <AlertDescription>
            This account belongs to newsroom staff. Only a Super Admin can block
            it; to remove portal access, suspend them on the Staff page.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
              <Fact label="Joined">{formatDateTime(u.createdAt)}</Fact>
              <Fact label="Last sign-in">
                <span title={formatDateTime(u.lastLoginAt)}>
                  {timeAgo(u.lastLoginAt)}
                </span>
              </Fact>
              <Fact label="Signs in with">
                {u.signIn.length
                  ? u.signIn.map((s) => SIGN_IN_LABELS[s] ?? s).join(', ')
                  : '—'}
              </Fact>
              <Fact label="Email verified">
                {u.emailVerified ? 'Yes' : 'No'}
              </Fact>
              <Fact label="Phone">
                <span className="font-mono text-xs">{u.phone ?? '—'}</span>
              </Fact>
              <Fact label="Referral code">
                <span className="font-mono text-xs">
                  {u.referralCode ?? '—'}
                </span>
              </Fact>
              <Fact label="Virtual wallet">{formatINR(u.walletBalance)}</Fact>
              <Fact label="Orders placed">{formatCount(u.orders)}</Fact>
              <Fact label="Rooms joined">{formatCount(u.rooms)}</Fact>
              <Fact label="Friends referred">{formatCount(u.referrals)}</Fact>
              <Fact label="User id">
                <span className="font-mono text-xs break-all">{u.id}</span>
              </Fact>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moderation history</CardTitle>
            <CardDescription>
              Renames and blocks by newsroom staff.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {u.moderation.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No moderation actions yet.
              </p>
            ) : (
              <ol className="space-y-4">
                {u.moderation.map((m) => {
                  const detail = describeChange(m);
                  return (
                    <li key={m.id} className="border-l-2 pl-3">
                      <p className="text-sm font-medium">
                        {auditLabel(m.action)}
                      </p>
                      {detail && (
                        <p className="text-sm break-words text-muted-foreground">
                          {detail}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {m.actorEmail ?? 'System'} ·{' '}
                        {formatDateTime(m.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {renaming && (
        <RenameDialog
          user={u}
          onClose={() => setRenaming(false)}
          onSaved={(next) => {
            refresh(next);
            toast.success('Display name updated.');
          }}
        />
      )}

      <ConfirmDialog
        open={blocking}
        onOpenChange={setBlocking}
        title={`Block ${u.displayName || 'this user'}?`}
        description="They're signed out of the app on every device and can't sign in again until unblocked. Their portfolio is kept."
        confirmLabel="Block account"
        destructive
        onConfirm={async () => {
          const next = await api<AppUserDetail>(`staff/users/${u.id}/block`, {
            method: 'POST',
            body: reason.trim() ? { reason: reason.trim() } : {},
          });
          refresh(next);
          toast.success('Account blocked.');
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="block-reason">Reason (kept in the audit log)</Label>
          <Textarea
            id="block-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={unblocking}
        onOpenChange={setUnblocking}
        title={`Unblock ${u.displayName || 'this user'}?`}
        description="They can sign in to the app again."
        confirmLabel="Unblock"
        onConfirm={async () => {
          const next = await api<AppUserDetail>(`staff/users/${u.id}/unblock`, {
            method: 'POST',
          });
          refresh(next);
          toast.success('Account unblocked.');
        }}
      />
    </>
  );
}

function RenameDialog({
  user,
  onClose,
  onSaved,
}: {
  user: AppUserDetail;
  onClose: () => void;
  onSaved: (u: AppUserDetail) => void;
}) {
  const [name, setName] = useState(user.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Use at least 2 characters.');
    setBusy(true);
    try {
      const next = await api<AppUserDetail>(`staff/users/${user.id}`, {
        method: 'PATCH',
        body: { displayName: name.trim() },
      });
      onSaved(next);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Rename user</DialogTitle>
            <DialogDescription>
              The new name shows in the app and on leaderboards. The change is
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save name'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
