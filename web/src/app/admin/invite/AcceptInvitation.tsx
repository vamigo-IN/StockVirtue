'use client';

import { AlertCircle, CheckCircle2, Loader2, MailX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime } from '@/portal/format';
import type { InvitationPreview } from '@/portal/types';

type State =
  | { step: 'loading' }
  | { step: 'invalid'; message: string }
  | { step: 'form'; preview: InvitationPreview }
  | { step: 'done'; email: string };

export function AcceptInvitation() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>({ step: 'loading' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Once only: the first run wipes the fragment this reads.
    if (started.current) return;
    started.current = true;
    // The token travels in the URL fragment (never sent to any server). Take
    // it, then wipe it from the address bar and history.
    const t = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
    if (!t) {
      setState({
        step: 'invalid',
        message:
          'This link is incomplete. Open the invitation email and use its button.',
      });
      return;
    }
    setToken(t);
    api<InvitationPreview>('staff/invitations/preview', {
      method: 'POST',
      body: { token: t },
      signInFlow: true,
    })
      .then((preview) => setState({ step: 'form', preview }))
      .catch((err) =>
        setState({ step: 'invalid', message: errorMessage(err) }),
      );
  }, []);

  async function submit(e: React.FormEvent, preview: InvitationPreview) {
    e.preventDefault();
    setError(null);
    if (preview.needsNewPassword) {
      const check = z
        .string()
        .min(10, 'Use at least 10 characters for your password.')
        .max(128, 'Use at most 128 characters.')
        .safeParse(password);
      if (!check.success) return setError(check.error.issues[0].message);
      if (password !== confirm)
        return setError("The two passwords don't match.");
    } else if (!password) {
      return setError('Enter your StockVirtue password.');
    }
    setBusy(true);
    try {
      await api('staff/invitations/accept', {
        method: 'POST',
        body: {
          token,
          password,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        },
        signInFlow: true,
      });
      setState({ step: 'done', email: preview.email });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (state.step === 'loading') {
    return (
      <Card>
        <CardContent className="space-y-3 py-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (state.step === 'invalid') {
    return (
      <Card>
        <CardHeader>
          <span className="mb-1 grid size-10 place-items-center rounded-full bg-destructive/10">
            <MailX className="size-5 text-destructive" aria-hidden />
          </span>
          <CardTitle className="text-xl">Invitation unavailable</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild className="w-full">
            <Link href="/admin/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.step === 'done') {
    return (
      <Card>
        <CardHeader>
          <span className="mb-1 grid size-10 place-items-center rounded-full bg-primary/10">
            <CheckCircle2 className="size-5 text-primary" aria-hidden />
          </span>
          <CardTitle className="text-xl">You&apos;re in</CardTitle>
          <CardDescription>
            Your newsroom access is ready. Sign in with {state.email} and your
            password; we&apos;ll email you a one-time code each time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link
              href={`/admin/login?email=${encodeURIComponent(state.email)}`}
            >
              Sign in to the newsroom
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { preview } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Join the StockVirtue newsroom</CardTitle>
        <CardDescription>
          You&apos;ve been invited as{' '}
          <span className="font-medium text-foreground">{preview.email}</span>.
          This link expires {formatDateTime(preview.expiresAt)}.
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {preview.roles.map((r) => (
            <Badge key={r} variant="secondary">
              {r}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => void submit(e, preview)}
          className="space-y-4"
          noValidate
        >
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            {preview.needsNewPassword
              ? preview.hasAccount
                ? 'Your StockVirtue account signs in with Google or phone. Choose a password for the newsroom; it also works in the app.'
                : 'Choose a password. It creates your StockVirtue account, which also works in the app.'
              : 'You already have a StockVirtue account. Confirm it with your current password.'}
          </p>
          <div className="space-y-2">
            <Label htmlFor="password">
              {preview.needsNewPassword
                ? 'New password'
                : 'StockVirtue password'}
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete={
                preview.needsNewPassword ? 'new-password' : 'current-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
            {preview.needsNewPassword && (
              <p className="text-xs text-muted-foreground">
                At least 10 characters.
              </p>
            )}
          </div>
          {preview.needsNewPassword && (
            <div className="space-y-2">
              <Label htmlFor="confirm">Repeat password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="displayName">
              Name shown in the newsroom{' '}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="displayName"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Setting up…' : 'Accept invitation'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
