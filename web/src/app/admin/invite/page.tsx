import type { Metadata } from 'next';
import { AuthScreen } from '@/components/portal/AuthScreen';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata: Metadata = {
  title: 'Join the newsroom',
  referrer: 'no-referrer',
};

export default function InvitePage() {
  return (
    <AuthScreen>
      <AcceptInvitation />
    </AuthScreen>
  );
}
