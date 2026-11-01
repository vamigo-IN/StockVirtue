import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { StaffView } from './StaffView';

export const metadata: Metadata = { title: 'Staff' };

export default async function StaffPage() {
  const me = await requireMe();
  if (!can(me, 'staff.read')) return <NoAccess permission="staff.read" />;
  return <StaffView />;
}
