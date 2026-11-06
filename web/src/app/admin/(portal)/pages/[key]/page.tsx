import { ArrowLeft, Hammer } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { NoAccess, PageHeader } from '@/components/portal/common';
import { DesignedPageEditor } from '@/components/portal/site-content/DesignedPageEditor';
import { Button } from '@/components/ui/button';
import { defaultContent, hasDefault } from '@/content/site/index';
import { DESIGNED_KEYS, LEGAL_KEYS, type DesignedKey } from '@/content/site/types';
import { API_V1 } from '@/portal/backend';
import { canReadSite } from '@/portal/site-content';
import { requireMe } from '@/portal/server';
import { PageEditor } from './PageEditor';

export const metadata: Metadata = { title: 'Edit page' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isDesigned = (k: string): k is DesignedKey => (DESIGNED_KEYS as readonly string[]).includes(k);
const isLegal = (k: string) => (LEGAL_KEYS as readonly string[]).includes(k);

/**
 * One page's editor (W7 addendum §8.3, §8.4): the legal documents, custom
 * pages and the shared block (M7.6a), and the six designed pages (M7.6b),
 * each once its view and built-in default exist (a designed key missing
 * from content/site/index.ts shows the placeholder). The chrome is edited
 * under Menus & footer.
 */
export default async function EditSitePage({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireMe();
  if (!canReadSite(me)) return <NoAccess permission="site.manage, legal.manage or settings.read" />;
  const { key } = await params;
  if (key === 'chrome') redirect('/admin/menus');
  if (!isDesigned(key) && !isLegal(key) && key !== 'wont-do' && !UUID.test(key)) notFound();

  // The designed pages start from their built-in default (§3.11), handed to the client editor as plain data.
  if (isDesigned(key) && hasDefault(key)) {
    return <DesignedPageEditor itemKey={key} builtIn={defaultContent(key)} />;
  }

  if (isDesigned(key)) {
    return (
      <>
        <PageHeader
          title="Edit page"
          actions={
            <Button variant="outline" asChild>
              <Link href="/admin/pages">
                <ArrowLeft /> All pages
              </Link>
            </Button>
          }
        />
        {/* Plain markup: a server page can't hand an icon component to a client one. */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-muted">
            <Hammer className="size-5 text-muted-foreground" aria-hidden />
          </span>
          <p className="mt-3 font-medium">Not editable yet</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            This page’s new design is still being built. It becomes editable when it ships.
          </p>
        </div>
      </>
    );
  }

  // Built-in items start from their code default; legal documents are seeded,
  // and custom pages start from the template.
  const builtIn = key === 'wont-do' && hasDefault(key) ? defaultContent(key) : null;
  // The ops console (the API-served /admin) sends app notifications (§5.1).
  const opsConsoleUrl = `${new URL(API_V1).origin}/admin/notifications`;
  return <PageEditor itemKey={key} builtIn={builtIn} opsConsoleUrl={opsConsoleUrl} />;
}
