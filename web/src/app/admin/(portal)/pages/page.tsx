import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { SITE_CONTENT_DEFAULTS } from '@/content/site/index';
import { canReadSite } from '@/portal/site-content';
import { requireMe } from '@/portal/server';
import { PagesView } from './PagesView';

export const metadata: Metadata = { title: 'Pages' };

/**
 * The website's pages (W7 addendum §8.2): the designed pages, the shared
 * block, the legal documents and the custom pages, with their status.
 * Readable with site.manage, legal.manage or settings.read.
 */
export default async function PagesPage() {
  const me = await requireMe();
  if (!canReadSite(me)) return <NoAccess permission="site.manage, legal.manage or settings.read" />;
  // A designed page is editable once its built-in default is in the index (§3.11).
  return <PagesView builtInKeys={Object.keys(SITE_CONTENT_DEFAULTS)} />;
}
