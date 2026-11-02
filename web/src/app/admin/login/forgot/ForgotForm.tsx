'use client';

import { AlertCircle, Loader2, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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

const emailSchema = z.email(
  'Enter the email address of your newsroom account.',
);
const resetSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
    password: z
      .string()
      .min(10, 'Use at least 10 characters for your password.')
      .max(128, 'Use at most 128 characters.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "The two passwords don't match.",
    path: ['confirm'],
  });

/**
 * A forgotten password, reset on the portal itself: an emailed code, then a
 * new password. It is also the StockVirtue app password.
 */
export function ForgotForm({ email: presetEmail }: { email?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(presetEmail ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setError(null);
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ message: string; expiresInSeconds: number }>(
        'staff/auth/password/forgot',
        { method: 'POST', body: { email: parsed.data }, signInFlow: true },
      );
      setSent(
        `${res.message} It works for ${Math.round(res.expiresInSeconds / 60)} minutes.`,
      );
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = resetSchema.safeParse({
      code: code.trim(),
      password,
      confirm,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await api('staff/auth/password/reset', {
        method: 'POST',
        body: {
          email: email.trim(),
          code: parsed.data.code,
          password: parsed.data.password,
        },
        signInFlow: true,
      });
      router.replace(
        `/admin/login?reset=1&email=${encodeURIComponent(email.trim())}`,
      );
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription>
          {step === 'email'
            ? "Enter your newsroom email and we'll send you a code to choose a new password."
            : 'Enter the code from the email and choose a new password. It also becomes your StockVirtue app password.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={
            step === 'email'
              ? (e) => {
                  e.preventDefault();
                  void sendCode();
                }
              : reset
          }
          className="space-y-4"
          noValidate
        >
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {step === 'code' && sent && !error && (
            <Alert>
              <MailCheck />
              <AlertDescription>{sent}</AlertDescription>
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
              readOnly={step === 'code'}
              autoFocus={step === 'email'}
              required
            />
          </div>
          {step === 'email' ? (
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  autoFocus
                  className="h-12 text-center font-mono text-2xl tracking-[0.5em] placeholder:tracking-[0.5em]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  At least 10 characters.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy || code.length !== 6}
              >
                {busy && <Loader2 className="animate-spin" />}
                {busy ? 'Saving…' : 'Set new password'}
              </Button>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-sm"
                onClick={() => void sendCode()}
                disabled={busy}
              >
                Send a new code
              </Button>
            </>
          )}
          <p className="text-center text-sm">
            <Link
              href="/admin/login"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
