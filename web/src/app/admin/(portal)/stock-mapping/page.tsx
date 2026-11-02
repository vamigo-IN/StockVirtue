import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { StockMappingView } from './StockMappingView';

export const metadata: Metadata = { title: 'Stock mapping' };

export default async function StockMappingPage() {
  const me = await requireMe();
  if (!can(me, 'sources.read')) return <NoAccess permission="sources.read" />;
  return <StockMappingView />;
}
