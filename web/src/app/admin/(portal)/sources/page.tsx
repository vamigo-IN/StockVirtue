import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { SourcesView } from './SourcesView';

export const metadata: Metadata = { title: 'News sources' };

export default async function SourcesPage() {
  const me = await requireMe();
  if (!can(me, 'sources.read')) return <NoAccess permission="sources.read" />;
  return <SourcesView />;
}
