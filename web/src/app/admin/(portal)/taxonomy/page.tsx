import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { TaxonomyView } from './TaxonomyView';

export const metadata: Metadata = { title: 'Categories & tags' };

export default async function TaxonomyPage() {
  const me = await requireMe();
  if (!can(me, 'news.read')) return <NoAccess permission="news.read" />;
  return <TaxonomyView />;
}
