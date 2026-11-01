import type { Metadata } from 'next';
import { AuthScreen } from '@/components/portal/AuthScreen';
import { VerifyForm } from './VerifyForm';

export const metadata: Metadata = { title: 'Enter your code' };

export default function VerifyPage() {
  return (
    <AuthScreen>
      <VerifyForm />
    </AuthScreen>
  );
}
