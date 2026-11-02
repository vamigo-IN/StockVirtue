import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { ArticleWorkspace } from './ArticleWorkspace';

export const metadata: Metadata = { title: 'Article' };

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireMe();
  if (!can(me, 'news.read')) return <NoAccess permission="news.read" />;
  const { id } = await params;
  return <ArticleWorkspace id={id} />;
}
