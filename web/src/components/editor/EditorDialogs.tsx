'use client';

import type { Editor } from '@tiptap/react';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { formatDate } from '@/portal/format';
import { useArticles } from '@/portal/queries';
import { insertBlock } from './insert';
import { parseVideoUrl } from './video-url';

const LINK_RE = /^(https?:\/\/|mailto:|\/(?!\/))/i;

export function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [href, setHref] = useState('');
  const [error, setError] = useState<string | null>(null);
  const existing = editor.isActive('link');

  useEffect(() => {
    if (open) {
      setHref((editor.getAttributes('link').href as string | undefined) ?? '');
      setError(null);
    }
  }, [open, editor]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    let value = href.trim();
    if (value && !/^[a-z]+:|^\//i.test(value)) value = `https://${value}`;
    if (!LINK_RE.test(value)) {
      setError(
        'Use a full web address (https://…), an email (mailto:…) or a site path (/news/…).',
      );
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: value })
      .run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={apply} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{existing ? 'Edit link' : 'Add link'}</DialogTitle>
            <DialogDescription>
              Links to other sites open in a new tab and are marked nofollow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="link-href">Address</Label>
            <Input
              id="link-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://www.nseindia.com/…"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange('link')
                    .unsetLink()
                    .run();
                  onOpenChange(false);
                }}
              >
                Remove link
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VideoDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  function insert(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      setError(
        'Paste a YouTube or Vimeo link, e.g. https://www.youtube.com/watch?v=…',
      );
      return;
    }
    insertBlock(editor, { type: 'video', attrs: { ...parsed, caption: '' } });
    setUrl('');
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={insert} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Embed a video</DialogTitle>
            <DialogDescription>
              YouTube (privacy-enhanced mode) and Vimeo only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="video-url">Video link</Label>
            <Input
              id="video-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit">Embed</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a published story to link as a "Related" card. */
export function RelatedDialog({
  open,
  onOpenChange,
  onPick,
  excludeId,
  title = 'Link a related article',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (a: { id: string; title: string; slug: string }) => void;
  excludeId?: string;
  title?: string;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  const list = useArticles({ status: 'PUBLISHED', q });
  const items = (list.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (a) => a.id !== excludeId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Only published stories can be linked.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search published headlines"
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {list.isPending ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : items.length === 0 ? (
            <Alert>
              <AlertDescription>
                {q
                  ? 'No published stories match.'
                  : 'No published stories yet.'}
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="divide-y rounded-lg border">
              {items.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                    onClick={() => {
                      onPick({ id: a.id, title: a.title, slug: a.slug });
                      onOpenChange(false);
                    }}
                  >
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.category?.name ?? 'Uncategorised'} ·{' '}
                      {formatDate(a.publishedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
