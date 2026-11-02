'use client';

import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { api, errorMessage } from '@/portal/api';
import { isSessionEnd, SESSION_END_MESSAGES } from '@/portal/session';
import type { StaffMe } from '@/portal/types';
import { saveChallenge } from './challenge';

const schema = z.object({
  email: z.email('Enter the email address of your StockVirtue account.'),
  password: z.string().min(1, 'Enter your password.'),
});

export function LoginForm({
  next,
  reason,
  signedOut,
  passwordReset,
  email: presetEmail,
}: {
  next: string;
  reason?: string;
  signedOut: boolean;
  /** Arrived from a completed password reset. */
  passwordReset: boolean;
  email?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(presetEmail ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. arrived from an email link)? Go straight in.
  useEffect(() => {
    if (signedOut) return;
    let cancelled = false;
    api<StaffMe>('staff/auth/me', { signInFlow: true })
      .then(() => {
        if (!cancelled) window.location.replace(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [next, signedOut]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email: email.trim(), password });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{
        challengeId: string;
        expiresAt: string;
        sentTo: string;
      }>('staff/auth/login', {
        method: 'POST',
        body: parsed.data,
        signInFlow: true,
      });
      saveChallenge({ ...res, next });
      router.push('/admin/login/verify');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const notice = passwordReset
    ? {
        tone: 'ok' as const,
        text: 'Password changed. Sign in with your new password.',
      }
    : signedOut
      ? { tone: 'ok' as const, text: "You've signed out." }
      : isSessionEnd(reason) && reason !== 'staff_session_required'
        ? {
            tone:
              reason === 'staff_session_idle' ||
              reason === 'staff_session_expired' ||
              reason === 'staff_session_revoked'
                ? ('info' as const)
                : ('error' as const),
            text: SESSION_END_MESSAGES[reason],
          }
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>
          Use your StockVirtue email and password. We&apos;ll then email you a
          one-time code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {notice && !error && (
            <Alert
              variant={notice.tone === 'error' ? 'destructive' : 'default'}
            >
              {notice.tone === 'ok' ? (
                <CheckCircle2 />
              ) : notice.tone === 'info' ? (
                <Info />
              ) : (
                <AlertCircle />
              )}
              <AlertDescription>{notice.text}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!presetEmail}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus={!!presetEmail}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? 'Checking…' : 'Continue'}
          </Button>
          <p className="text-center text-sm">
            <Link
              href={`/admin/login/forgot${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
