'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, initials } from '@/portal/format';
import { qk } from '@/portal/queries';
import { roleLabel } from '@/portal/roles';
import type { StaffMe } from '@/portal/types';

export function ProfileView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const [name, setName] = useState(me.displayName);
  const [title, setTitle] = useState(me.title ?? '');
  const [busy, setBusy] = useState(false);
  const dirty =
    name.trim() !== me.displayName || title.trim() !== (me.title ?? '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error('Use at least 2 characters for your name.');
      return;
    }
    setBusy(true);
    try {
      const next = await api<StaffMe>('staff/auth/me', {
        method: 'PATCH',
        body: { displayName: name.trim(), title: title.trim() },
      });
      qc.setQueryData(qk.me, next);
      void qc.invalidateQueries({ queryKey: ['staff'] });
      setName(next.displayName);
      setTitle(next.title ?? '');
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Profile"
        description="How you appear to the rest of the newsroom."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form onSubmit={save}>
            <CardHeader>
              <CardTitle>Your details</CardTitle>
              <CardDescription>
                Shown on the Staff page, in the audit log and on review notes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Job title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Markets reporter"
                  autoComplete="organization-title"
                />
              </div>
            </CardContent>
            <CardFooter className="justify-end pt-6">
              <Button type="submit" disabled={!dirty || busy}>
                {busy ? 'Saving…' : 'Save profile'}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {initials(me.displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <CardTitle className="truncate">{me.displayName}</CardTitle>
                <CardDescription className="truncate">
                  {me.email}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">Roles</p>
              <div className="flex flex-wrap gap-1.5">
                {me.roles.map((r) => (
                  <Badge key={r} variant="secondary">
                    {roleLabel(r)}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Last portal sign-in
              </p>
              <p>{formatDateTime(me.lastPortalLoginAt)}</p>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Your password belongs to your StockVirtue account. To change it,
              use &ldquo;Forgot password&rdquo; on the app&apos;s sign-in
              screen.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
