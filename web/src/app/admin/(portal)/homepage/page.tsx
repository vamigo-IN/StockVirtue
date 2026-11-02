import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { HomepageView } from './HomepageView';

export const metadata: Metadata = { title: 'News homepage' };

export default async function HomepagePage() {
  const me = await requireMe();
  if (!can(me, 'site.manage')) return <NoAccess permission="site.manage" />;
  return <HomepageView />;
}
