import type { Metadata } from 'next';
import { AuthScreen } from '@/components/portal/AuthScreen';
import { ForgotForm } from './ForgotForm';

export const metadata: Metadata = { title: 'Reset your password' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  return (
    <AuthScreen>
      <ForgotForm email={typeof sp.email === 'string' ? sp.email : undefined} />
    </AuthScreen>
  );
}
