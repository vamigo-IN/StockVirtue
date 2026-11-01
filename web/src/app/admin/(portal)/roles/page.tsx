import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { RolesView } from './RolesView';

export const metadata: Metadata = { title: 'Roles & permissions' };

export default async function RolesPage() {
  const me = await requireMe();
  if (!can(me, 'staff.read')) return <NoAccess permission="staff.read" />;
  return <RolesView />;
}
