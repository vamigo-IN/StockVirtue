import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { PrivacyRequestsView } from './PrivacyRequestsView';

export const metadata: Metadata = { title: 'Privacy requests' };

export default async function PrivacyRequestsPage() {
  const me = await requireMe();
  if (!can(me, 'privacy.manage')) {
    return <NoAccess permission="privacy.manage" />;
  }
  return <PrivacyRequestsView />;
}
