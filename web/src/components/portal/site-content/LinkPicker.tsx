'use client';

import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MenuTarget } from '@/content/site/types';
import { isKnownSitePath } from '@/lib/site-content/href';
import { cn } from '@/lib/utils';
import { useReturnFocus } from './return-focus';

/**
 * The menus' link picker (W7 addendum §8.7, §6.2): four tabs. Page (the
 * site's own pages, the legal documents and your pages), News section (the
 * hubs and the categories), Path (a known site route, checked as the API
 * checks it) and Web address (https only; not for the header).
 */

export interface PickerPage {
  id: string;
  title: string;
  slug: string | null;
  live: boolean;
}

export interface PickerCategory {
  slug: string;
  name: string;
  isActive: boolean;
}

/** The fixed pages a menu may link (§6.2). */
export const SITE_PAGES: { path: string; label: string }[] = [
  { path: '/', label: 'Home' },
  { path: '/features', label: 'The app (features)' },
  { path: '/download', label: 'Download' },
  { path: '/faq', label: 'FAQ' },
  { path: '/about', label: 'About' },
  { path: '/contact', label: 'Contact' },
  { path: '/privacy', label: 'Privacy notice' },
  { path: '/privacy/hi', label: 'Privacy notice in Hindi' },
  { path: '/privacy/requests', label: 'Privacy requests and grievances' },
  { path: '/terms', label: 'Terms & Conditions' },
  { path: '/disclaimer', label: 'Risk Disclaimer' },
];

export const NEWS_HUBS: { path: string; label: string }[] = [
  { path: '/news', label: 'News front page' },
  { path: '/news/latest', label: 'Latest' },
  { path: '/news/markets', label: 'Markets' },
  { path: '/news/education', label: 'Learn' },
  { path: '/news/commodities', label: 'Commodities' },
  { path: '/news/ipo', label: 'IPOs' },
  { path: '/news/search', label: 'Search' },
  { path: '/news/feed.xml', label: 'RSS feed' },
];

export const MENU_URL_MAX = 300;

/** Why a web address can't be a menu link, or null. */
export function urlProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return 'Type the address.';
  if (v.length > MENU_URL_MAX) return `Keep it to ${MENU_URL_MAX} characters.`;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return 'Type the whole address, starting with https://';
  }
  if (u.protocol !== 'https:') return 'Menu links to other sites must start with https://';
  if (/[\s\u0000-\u001f\u007f]/.test(v)) return 'Remove the spaces from the address.';
  const host = u.hostname.toLowerCase();
  if (host === 'stockvirtue.com' || host === 'www.stockvirtue.com') return 'For a page of this site, use the Page or Path tab.';
  return null;
}

/** Why a path can't be a menu link, or null (the API checks again, with the live pages). */
export function pathProblem(raw: string, liveSlugs: ReadonlySet<string>): string | null {
  const v = raw.trim();
  if (!v) return 'Type a path, such as /news/markets.';
  if (!v.startsWith('/')) return 'A path starts with “/”.';
  if (/^\/(admin|api|preview)(\/|#|$)/.test(v)) return 'Menus can’t link to the portal, the API or previews.';
  if (v.includes('?')) return 'Leave out the “?…” part.';
  if (!isKnownSitePath(v, liveSlugs)) {
    return 'That isn’t a page of the site. Use a site page, a news section, a news category, tag, author or stock page, or one of your published pages.';
  }
  return null;
}

/** A target in words, for the editor's rows. */
export function targetText(t: MenuTarget | null | undefined, pages: PickerPage[], cats: PickerCategory[]): string {
  if (!t) return 'No link yet';
  switch (t.type) {
    case 'path': {
      const known = [...SITE_PAGES, ...NEWS_HUBS].find((p) => p.path === t.path);
      return known ? `${known.label} · ${t.path}` : t.path;
    }
    case 'page': {
      const p = pages.find((x) => x.id === t.pageId);
      return p ? `${p.title} · /${p.slug ?? ''}${p.live ? '' : ' (not published)'}` : 'A page that no longer exists';
    }
    case 'category': {
      const c = cats.find((x) => x.slug === t.slug);
      return `${c?.name ?? t.slug} · /news/category/${t.slug}${c && !c.isActive ? ' (hidden section)' : ''}`;
    }
    case 'url':
      return t.url;
  }
}

function Option({ selected, onClick, children, note }: { selected: boolean; onClick: () => void; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        selected && 'bg-accent',
      )}
    >
      <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
      {note}
    </button>
  );
}

const same = (a: MenuTarget | null, b: MenuTarget) => !!a && JSON.stringify(a) === JSON.stringify(b);

export function LinkPicker({
  open,
  onOpenChange,
  value,
  onPick,
  allowUrl,
  pages,
  categories,
  categoriesNote,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: MenuTarget | null;
  onPick: (t: MenuTarget) => void;
  /** The header can't link other sites (§6.3). */
  allowUrl: boolean;
  pages: PickerPage[];
  categories: PickerCategory[];
  /** Shown instead of the categories when they couldn't be loaded. */
  categoriesNote?: string | null;
}) {
  const [tab, setTab] = useState('page');
  const returnFocus = useReturnFocus(open);
  const [choice, setChoice] = useState<MenuTarget | null>(value);
  const [path, setPath] = useState('');
  const [url, setUrl] = useState('');
  const liveSlugs = new Set(pages.filter((p) => p.live && p.slug).map((p) => p.slug as string));

  useEffect(() => {
    if (!open) return;
    setChoice(value);
    setPath(value?.type === 'path' ? value.path : '');
    setUrl(value?.type === 'url' ? value.url : 'https://');
    const onSitePage = value?.type === 'path' && SITE_PAGES.some((p) => p.path === value.path);
    const onHub = value?.type === 'path' && NEWS_HUBS.some((p) => p.path === value.path);
    setTab(
      !value || value.type === 'page' || onSitePage
        ? 'page'
        : value.type === 'category' || onHub
          ? 'news'
          : value.type === 'url'
            ? 'url'
            : 'path',
    );
  }, [open, value]);

  const pathErr = tab === 'path' ? pathProblem(path, liveSlugs) : null;
  const urlErr = tab === 'url' ? urlProblem(url) : null;
  const picked: MenuTarget | null =
    tab === 'path' ? (pathErr ? null : { type: 'path', path: path.trim() }) : tab === 'url' ? (urlErr ? null : { type: 'url', url: url.trim() }) : choice;
  const pickedInTab =
    picked &&
    (tab === 'page'
      ? picked.type === 'page' || (picked.type === 'path' && SITE_PAGES.some((p) => p.path === picked.path))
      : tab === 'news'
        ? picked.type === 'category' || (picked.type === 'path' && NEWS_HUBS.some((p) => p.path === picked.path))
        : true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Choose where the link goes</DialogTitle>
          <DialogDescription>A page of the site, a news section, a path, or {allowUrl ? 'another site.' : 'a path (the header can’t link other sites).'}</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="page">Page</TabsTrigger>
            <TabsTrigger value="news">News section</TabsTrigger>
            <TabsTrigger value="path">Path</TabsTrigger>
            {allowUrl && <TabsTrigger value="url">Web address</TabsTrigger>}
          </TabsList>
          <TabsContent value="page" className="mt-3">
            <div role="group" aria-label="Pages" className="max-h-72 space-y-0.5 overflow-y-auto">
              {SITE_PAGES.map((p) => {
                const t: MenuTarget = { type: 'path', path: p.path };
                return (
                  <Option key={p.path} selected={same(choice, t)} onClick={() => setChoice(t)}>
                    {p.label} <span className="font-mono text-xs text-muted-foreground">{p.path}</span>
                  </Option>
                );
              })}
              {pages.length > 0 && <p className="px-2.5 pt-2 text-xs font-medium text-muted-foreground">Your pages</p>}
              {pages.map((p) => {
                const t: MenuTarget = { type: 'page', pageId: p.id };
                return (
                  <Option
                    key={p.id}
                    selected={same(choice, t)}
                    onClick={() => setChoice(t)}
                    note={!p.live ? <Badge variant="outline">Not published</Badge> : undefined}
                  >
                    {p.title} <span className="font-mono text-xs text-muted-foreground">/{p.slug}</span>
                  </Option>
                );
              })}
            </div>
            {choice?.type === 'page' && !pages.find((p) => p.id === (choice as { pageId: string }).pageId)?.live && (
              <p className="mt-2 text-xs text-warning">
                The menus can be saved with this link, but they can only be published once the page is.
              </p>
            )}
          </TabsContent>
          <TabsContent value="news" className="mt-3">
            <div role="group" aria-label="News sections" className="max-h-72 space-y-0.5 overflow-y-auto">
              {NEWS_HUBS.map((p) => {
                const t: MenuTarget = { type: 'path', path: p.path };
                return (
                  <Option key={p.path} selected={same(choice, t)} onClick={() => setChoice(t)}>
                    {p.label} <span className="font-mono text-xs text-muted-foreground">{p.path}</span>
                  </Option>
                );
              })}
              <p className="px-2.5 pt-2 text-xs font-medium text-muted-foreground">Categories</p>
              {categoriesNote ? (
                <p className="px-2.5 text-xs text-muted-foreground">{categoriesNote}</p>
              ) : (
                categories.map((c) => {
                  const t: MenuTarget = { type: 'category', slug: c.slug };
                  return (
                    <Option
                      key={c.slug}
                      selected={same(choice, t)}
                      onClick={() => setChoice(t)}
                      note={!c.isActive ? <Badge variant="outline">Hidden section</Badge> : undefined}
                    >
                      {c.name} <span className="font-mono text-xs text-muted-foreground">/news/category/{c.slug}</span>
                    </Option>
                  );
                })
              )}
            </div>
          </TabsContent>
          <TabsContent value="path" className="mt-3 space-y-1.5">
            <Label htmlFor="pick-path">Path on this site</Label>
            <Input
              id="pick-path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/news/stocks/RELIANCE"
              className="font-mono"
              aria-invalid={!!pathErr && !!path}
              aria-describedby="pick-path-help"
              spellCheck={false}
              autoComplete="off"
            />
            <p id="pick-path-help" className={pathErr && path ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {pathErr && path ? pathErr : 'A site route, optionally with #section. Files such as /news/feed.xml open as plain links.'}
            </p>
          </TabsContent>
          {allowUrl && (
            <TabsContent value="url" className="mt-3 space-y-1.5">
              <Label htmlFor="pick-url">Web address</Label>
              <Input
                id="pick-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
                className="font-mono"
                aria-invalid={!!urlErr && url !== 'https://'}
                aria-describedby="pick-url-help"
                spellCheck={false}
                autoComplete="off"
              />
              <p id="pick-url-help" className={urlErr && url !== 'https://' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {urlErr && url !== 'https://' ? urlErr : 'Another site, https only. It opens in a new tab.'}
              </p>
            </TabsContent>
          )}
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!picked || !pickedInTab}
            onClick={() => {
              if (picked) onPick(picked);
              onOpenChange(false);
            }}
          >
            Use this link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
