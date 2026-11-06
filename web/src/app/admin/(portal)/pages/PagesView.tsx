'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FilePlus2, History, Pencil, PanelsTopLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, QueryError, RowsSkeleton } from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { StatusBadges } from '@/components/portal/site-content/EditorBar';
import { useReturnFocus } from '@/components/portal/site-content/return-focus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changedFacts, slugify, slugProblem, statusOf } from '@/components/portal/site-content/status';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { can } from '@/portal/access';
import { invalidateSiteContent, useSiteContentList } from '@/portal/queries';
import {
  createCustomPage,
  editorHref,
  historyHref,
  isPrivacyKey,
  KIND_GROUPS,
  liveHref,
  personName,
  shortDate,
  siteError,
} from '@/portal/site-content';
import type { SiteContentItem } from '@/portal/types';

function NewPageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownSlug = touched ? slug : slugify(title);
  const problem = slugProblem(shownSlug);
  const titleOk = title.trim().length >= 3 && title.trim().length <= 80;
  const returnFocus = useReturnFocus(open);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (problem || !titleOk) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createCustomPage(shownSlug, title.trim());
      invalidateSiteContent(qc);
      toast.success('Page created as a draft. Nothing is public until you publish it.');
      onOpenChange(false);
      router.push(`/admin/pages/${encodeURIComponent(res.key)}`);
    } catch (err) {
      setError(siteError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        if (o) {
          setTitle('');
          setSlug('');
          setTouched(false);
          setError(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={returnFocus}>
        <form onSubmit={create} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>
              A page of your own, such as a refund policy or careers. It uses the site’s simple page template and stays a
              draft until you publish it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-title">Title</Label>
            <Input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus />
            <p className="text-xs text-muted-foreground">The page’s heading, and its name in this list (3 to 80 characters).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-slug">Address</Label>
            <div className="flex items-center rounded-md border focus-within:ring-[3px] focus-within:ring-ring/50">
              <span className="pl-3 font-mono text-sm text-muted-foreground">stockvirtue.com/</span>
              <input
                id="new-slug"
                className="h-9 min-w-0 flex-1 bg-transparent pr-3 font-mono text-sm outline-none"
                value={shownSlug}
                onChange={(e) => {
                  setTouched(true);
                  setSlug(e.target.value.toLowerCase());
                }}
                aria-invalid={!!problem && (touched || !!title)}
                aria-describedby="new-slug-help"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <p id="new-slug-help" className={problem && (touched || title) ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {problem && (touched || title) ? problem : 'You can change it later; the old address then redirects.'}
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !!problem || !titleOk}>
              {busy ? 'Creating…' : 'Create draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ item, comingSoon }: { item: SiteContentItem; comingSoon: boolean }) {
  const facts = changedFacts(item);
  const live = liveHref(item);
  const by = personName(item.live?.publishedBy);
  const viewable = !!live && (item.status === 'LIVE' || item.kind !== 'CUSTOM');
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <span className="font-medium" lang={item.lang === 'hi' ? 'hi' : undefined}>
          {item.key === 'privacy-hi' ? 'गोपनीयता सूचना' : item.title || 'Untitled page'}
        </span>
        {item.key === 'privacy-hi' && <span className="block text-xs text-muted-foreground">Privacy notice (Hindi)</span>}
        {facts.length > 0 && (
          <span className="mt-1 flex">
            <StatusBadges items={[{ label: `Facts changed: ${facts.join(', ')}`, tone: 'warning' }]} />
          </span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {item.path ?? (item.kind === 'SHARED' ? '/ and /features' : '—')}
      </TableCell>
      <TableCell>
        <StatusBadges items={statusOf(item, comingSoon)} />
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">
        {item.live ? (
          <>
            {shortDate(item.live.publishedAt)}
            {by && <span className="block text-xs text-muted-foreground">by {by}</span>}
          </>
        ) : (
          <span className="text-muted-foreground">Never</span>
        )}
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
        {isPrivacyKey(item.key) && item.live ? `${item.live.noticeVersion ?? '—'} · rev ${item.live.number}` : ''}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        {!comingSoon && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={editorHref(item)} aria-label={`Edit ${item.title}`} title="Edit">
              <Pencil /> <span className="max-2xl:sr-only">Edit</span>
            </Link>
          </Button>
        )}
        {!comingSoon && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={historyHref(item.key)} aria-label={`History of ${item.title}`} title="History">
              <History /> <span className="max-2xl:sr-only">History</span>
            </Link>
          </Button>
        )}
        {viewable && (
          <Button variant="ghost" size="sm" asChild>
            <a href={live} target="_blank" rel="noopener noreferrer" aria-label={`View ${item.title} live (opens in a new tab)`} title="View live">
              <ExternalLink /> <span className="max-2xl:sr-only">View live</span>
            </a>
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PagesView({ builtInKeys }: { builtInKeys: string[] }) {
  const me = usePortalMe();
  const list = useSiteContentList();
  const [creating, setCreating] = useState(false);
  const canCreate = can(me, 'site.manage');
  const items = list.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Pages"
        description="The words on stockvirtue.com’s own pages, the legal documents and your own pages. Every publish is kept in the history; the design stays as it is."
        actions={
          canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <FilePlus2 /> New page
            </Button>
          ) : undefined
        }
      />
      {list.error ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <RowsSkeleton rows={8} />
      ) : (
        <div className="space-y-8">
          {KIND_GROUPS.map((g) => {
            const rows = items.filter((i) => i.kind === g.kind);
            return (
              <section key={g.kind} aria-labelledby={`grp-${g.kind}`}>
                <div className="mb-2">
                  <h2 id={`grp-${g.kind}`} className="text-base font-semibold">
                    {g.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">{g.help}</p>
                </div>
                {rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {g.kind === 'CUSTOM'
                      ? canCreate
                        ? 'No pages of your own yet. “New page” adds one.'
                        : 'No pages of your own yet.'
                      : 'Nothing here.'}
                  </p>
                ) : (
                  <div className="rounded-xl border bg-card">
                    {/* One column layout for every group, so the four tables line up. */}
                    <Table className="min-w-[760px] table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[20%]">Page</TableHead>
                          <TableHead className="w-[15%]">Address</TableHead>
                          <TableHead className="w-[18%]">Status</TableHead>
                          <TableHead className="w-[12%]">Last published</TableHead>
                          <TableHead className="w-[10%]">{g.kind === 'LEGAL' ? 'Notice version' : ''}</TableHead>
                          <TableHead className="w-[25%] text-right">
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((item) => (
                          <Row
                            key={item.key}
                            item={item}
                            comingSoon={item.kind === 'DESIGNED' && !builtInKeys.includes(item.key)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            );
          })}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <PanelsTopLeft className="size-4" aria-hidden />
            The header menu, the phone menu, the footer and the 404 page are under{' '}
            <Link href="/admin/menus" className="text-primary underline-offset-4 hover:underline">
              Menus &amp; footer
            </Link>
            .
          </p>
        </div>
      )}
      <NewPageDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
