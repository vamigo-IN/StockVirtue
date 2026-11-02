import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { can } from '@/portal/access';
import { requireMe } from '@/portal/server';
import { AiView } from './AiView';

export const metadata: Metadata = { title: 'AI assistant' };

export default async function AiPage() {
  const me = await requireMe();
  if (!can(me, 'ai.configure')) return <NoAccess permission="ai.configure" />;
  return <AiView />;
}
