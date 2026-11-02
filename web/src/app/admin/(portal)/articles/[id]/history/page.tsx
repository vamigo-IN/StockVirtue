import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { HistoryView } from './HistoryView';

export const metadata: Metadata = { title: 'Version history' };

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireMe();
  if (!can(me, 'news.read')) return <NoAccess permission="news.read" />;
  const { id } = await params;
  return <HistoryView id={id} />;
}
