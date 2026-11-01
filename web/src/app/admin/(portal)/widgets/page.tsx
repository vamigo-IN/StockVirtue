import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { WidgetsView } from './WidgetsView';

export const metadata: Metadata = { title: 'Saved widgets' };

export default async function WidgetsPage() {
  const me = await requireMe();
  if (!can(me, 'widgets.read')) return <NoAccess permission="widgets.read" />;
  return <WidgetsView />;
}
