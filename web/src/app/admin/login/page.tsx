import type { Metadata } from 'next';
import { AuthScreen } from '@/components/portal/AuthScreen';
import { safeNext } from '@/portal/session';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === 'string' ? sp[k] : undefined);
  return (
    <AuthScreen>
      <LoginForm
        next={safeNext(one('next'))}
        reason={one('reason')}
        signedOut={one('signedOut') === '1'}
        email={one('email')}
      />
    </AuthScreen>
  );
}
