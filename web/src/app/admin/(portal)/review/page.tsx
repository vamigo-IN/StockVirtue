import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { ReviewQueueView } from './ReviewQueueView';

export const metadata: Metadata = { title: 'Review queue' };

export default async function ReviewPage() {
  const me = await requireMe();
  if (!can(me, 'news.approve')) return <NoAccess permission="news.approve" />;
  return <ReviewQueueView />;
}
