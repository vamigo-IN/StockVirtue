import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { InboxView } from './InboxView';

export const metadata: Metadata = { title: 'Incoming news' };

export default async function InboxPage() {
  const me = await requireMe();
  if (!can(me, 'sources.read')) return <NoAccess permission="sources.read" />;
  return <InboxView />;
}
