'use client';

import { AlertCircle, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
import { ApiError, api, errorMessage } from '@/portal/api';
import {
  clearChallenge,
  loadChallenge,
  saveChallenge,
  type PendingChallenge,
} from '../challenge';

const RESEND_COOLDOWN_S = 30;

function useCountdown(until: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return 0;
  return Math.max(0, Math.round((new Date(until).getTime() - now) / 1000));
}

const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function VerifyForm() {
  const router = useRouter();
  const [challenge, setChallenge] = useState<PendingChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** The attempt is over (too many tries, expired): only a new sign-in helps. */
  const [dead, setDead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submitted = useRef('');

  useEffect(() => {
    const c = loadChallenge();
    if (!c) router.replace('/admin/login');
    else setChallenge(c);
  }, [router]);

  const left = useCountdown(challenge?.expiresAt);
  const cooldown = useCountdown(
    resentAt
      ? new Date(resentAt + RESEND_COOLDOWN_S * 1000).toISOString()
      : undefined,
  );

  async function verify(value: string) {
    if (!challenge || busy || value === submitted.current) return;
    submitted.current = value;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api('staff/auth/verify', {
        method: 'POST',
        body: { challengeId: challenge.challengeId, code: value },
        signInFlow: true,
      });
      clearChallenge();
      window.location.assign(challenge.next);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setDead(
        err instanceof ApiError &&
          /sign in again|no longer valid|expired/i.test(message),
      );
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge) return;
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ expiresAt: string; sentTo: string }>(
        'staff/auth/resend',
        {
          method: 'POST',
          body: { challengeId: challenge.challengeId },
          signInFlow: true,
        },
      );
      const updated = { ...challenge, ...res };
      saveChallenge(updated);
      setChallenge(updated);
      setResentAt(Date.now());
      submitted.current = '';
      setNotice(`We sent a new code to ${res.sentTo}.`);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      setDead(/sign in again|no longer valid/i.test(message));
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void verify(digits);
  }

  if (!challenge) return null;
  const expired = left === 0;

  return (
    <Card>
      <CardHeader>
        <span className="mb-1 grid size-10 place-items-center rounded-full bg-primary/10">
          <MailCheck className="size-5 text-primary" aria-hidden />
        </span>
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>
          We sent a 6-digit code to{' '}
          <span className="font-medium text-foreground">
            {challenge.sentTo}
          </span>
          . {expired ? 'It has expired.' : `It expires in ${mmss(left)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitted.current = '';
            void verify(code);
          }}
          className="space-y-4"
          noValidate
        >
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && !error && (
            <Alert>
              <MailCheck />
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {dead ? (
            <Button asChild className="w-full">
              <Link href="/admin/login" onClick={clearChallenge}>
                Sign in again
              </Link>
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Sign-in code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => onChange(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  disabled={busy || expired}
                  className="h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]"
                  aria-describedby="code-help"
                />
                <p id="code-help" className="text-xs text-muted-foreground">
                  Can&apos;t find it? Check spam, or send a new code.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || code.length !== 6 || expired}
              >
                {busy && <Loader2 className="animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0"
                  onClick={() => void resend()}
                  disabled={cooldown > 0}
                >
                  {cooldown > 0
                    ? `Send a new code (${cooldown}s)`
                    : 'Send a new code'}
                </Button>
                <Link
                  href="/admin/login"
                  onClick={clearChallenge}
                  className="text-muted-foreground underline-offset-4 hover:underline"
                >
                  Use another account
                </Link>
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
