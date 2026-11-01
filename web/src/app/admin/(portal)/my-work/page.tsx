import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { MyWorkView } from './MyWorkView';

export const metadata: Metadata = { title: 'My work' };

export default async function MyWorkPage() {
  const me = await requireMe();
  if (!can(me, 'news.read')) return <NoAccess permission="news.read" />;
  return <MyWorkView />;
}
