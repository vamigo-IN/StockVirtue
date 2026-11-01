import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { MarketView } from './MarketView';

export const metadata: Metadata = { title: 'Market data' };

export default async function MarketPage() {
  const me = await requireMe();
  if (!can(me, 'market.configure')) {
    return <NoAccess permission="market.configure" />;
  }
  return <MarketView />;
}
