import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { SourceDetailView } from './SourceDetailView';

export const metadata: Metadata = { title: 'News source' };

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireMe();
  if (!can(me, 'sources.read')) return <NoAccess permission="sources.read" />;
  const { id } = await params;
  return <SourceDetailView id={id} />;
}
