import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { StorageView } from './StorageView';

export const metadata: Metadata = { title: 'Media storage' };

export default async function StoragePage() {
  const me = await requireMe();
  if (!can(me, 'media.storage')) {
    return <NoAccess permission="media.storage" />;
  }
  return <StorageView />;
}
