import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { UsersView } from './UsersView';

export const metadata: Metadata = { title: 'App users' };

export default async function UsersPage() {
  const me = await requireMe();
  if (!can(me, 'users.read')) return <NoAccess permission="users.read" />;
  return <UsersView />;
}
