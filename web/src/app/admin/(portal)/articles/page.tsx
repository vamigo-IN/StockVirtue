import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { ArticlesView } from './ArticlesView';

export const metadata: Metadata = { title: 'Articles' };

export default async function ArticlesPage() {
  const me = await requireMe();
  if (!can(me, 'news.read')) return <NoAccess permission="news.read" />;
  return <ArticlesView />;
}
