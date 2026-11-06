import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/portal/common';
import { HistoryCompare } from '@/components/portal/site-content/HistoryCompare';
import { defaultContent, hasDefault } from '@/content/site/index';
import { DESIGNED_KEYS, LEGAL_KEYS } from '@/content/site/types';
import { canReadSite } from '@/portal/site-content';
import { requireMe } from '@/portal/server';

export const metadata: Metadata = { title: 'Page history' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIXED = new Set<string>([...DESIGNED_KEYS, ...LEGAL_KEYS, 'wont-do', 'chrome']);

/** History, compare and restore of one item (W7 addendum §8.6), the chrome included. */
export default async function SitePageHistory({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireMe();
  if (!canReadSite(me)) return <NoAccess permission="site.manage, legal.manage or settings.read" />;
  const { key } = await params;
  if (!FIXED.has(key) && !UUID.test(key)) notFound();
  const builtIn = hasDefault(key) ? defaultContent(key) : null;
  return <HistoryCompare itemKey={key} builtIn={builtIn} />;
}
