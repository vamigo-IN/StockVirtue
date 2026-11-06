'use client';

import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { checkContentHref } from '@/lib/site-content/href';

/**
 * Add or edit a link in site content, checked by the site-content href rule
 * (W7 addendum §3.1): a site path (/privacy/hi), mailto: with one address,
 * or an http(s) address of another site. The article editor's own check
 * lets disguised off-site paths through, so it isn't used here.
 */
export function LinkEditDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [href, setHref] = useState('');
  const [lang, setLang] = useState<'none' | 'en' | 'hi'>('none');
  const [error, setError] = useState<string | null>(null);
  const existing = editor.isActive('link');

  useEffect(() => {
    if (!open) return;
    const attrs = editor.getAttributes('link') as { href?: string; lang?: string | null };
    setHref(attrs.href ?? '');
    setLang(attrs.lang === 'en' || attrs.lang === 'hi' ? attrs.lang : 'none');
    setError(null);
  }, [open, editor]);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    let value = href.trim();
    if (value && /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(value)) value = `https://${value}`;
    const ok = checkContentHref(value);
    if (!ok) {
      setError(
        'Use a page of this site (/privacy, /news/markets), an email (mailto:name@example.com) or another site’s address (https://…). Links to stockvirtue.com itself use the page path.',
      );
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: ok.kind === 'external' ? ok.href : value, ...(lang === 'none' ? { lang: null } : { lang }) } as {
        href: string;
      })
      .run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          // Back to the text (as the toolbar's menus do), where the link now is.
          e.preventDefault();
          editor.commands.focus();
        }}
      >
        <form onSubmit={apply} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{existing ? 'Edit link' : 'Add link'}</DialogTitle>
            <DialogDescription>
              Links to other sites open in a new tab. Select the words first, then add the link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sc-link-href">Address</Label>
            <Input
              id="sc-link-href"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="/privacy/requests"
              spellCheck={false}
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? 'sc-link-error' : undefined}
            />
            {error && (
              <p id="sc-link-error" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="sc-link-lang">Language of the linked page</Label>
            <Select value={lang} onValueChange={(v) => setLang(v as typeof lang)}>
              <SelectTrigger id="sc-link-lang" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Same as this page</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi (हिंदी)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Set it when the link text is in another language, as on “यह सूचना हिंदी में पढ़ें”.
            </p>
          </div>
          <DialogFooter className="sm:justify-between">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
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
