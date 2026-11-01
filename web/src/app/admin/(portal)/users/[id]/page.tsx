import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { UserDetailView } from './UserDetailView';

export const metadata: Metadata = { title: 'App user' };

export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireMe();
  if (!can(me, 'users.read')) return <NoAccess permission="users.read" />;
  const { id } = await params;
  return <UserDetailView id={id} />;
}
