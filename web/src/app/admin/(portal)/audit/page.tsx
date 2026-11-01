import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { AuditView } from './AuditView';

export const metadata: Metadata = { title: 'Audit log' };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const me = await requireMe();
  if (!can(me, 'audit.read')) return <NoAccess permission="audit.read" />;
  const { action } = await searchParams;
  return <AuditView initialAction={typeof action === 'string' ? action : ''} />;
}
