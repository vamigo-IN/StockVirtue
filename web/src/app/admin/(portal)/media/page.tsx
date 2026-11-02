import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { MediaView } from './MediaView';

export const metadata: Metadata = { title: 'Media library' };

export default async function MediaPage() {
  const me = await requireMe();
  if (!can(me, 'media.upload')) return <NoAccess permission="media.upload" />;
  return <MediaView />;
}
