import type { Metadata } from 'next';
import { NoAccess } from '@/components/portal/common';
import { defaultContent } from '@/content/site/index';
import { canReadSite } from '@/portal/site-content';
import { requireMe } from '@/portal/server';
import { MenusEditor } from './MenusEditor';

export const metadata: Metadata = { title: 'Menus & footer' };

/**
 * Menus & footer (W7 addendum §8.7): edited with site.manage (the legal
 * lines also need legal.manage); anyone who may read the site's pages can
 * open it read-only.
 */
export default async function MenusPage() {
  const me = await requireMe();
  if (!canReadSite(me)) return <NoAccess permission="site.manage" />;
  return <MenusEditor builtIn={defaultContent('chrome')} />;
}
