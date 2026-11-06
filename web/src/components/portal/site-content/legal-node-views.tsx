'use client';

import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { FileLock2, Hash, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DOC_LIMITS } from '@/content/site/limits';
import { isReservedId, isValidId } from '@/content/site/reserved-ids';
import { cn } from '@/lib/utils';
import { tokenLabel } from '@/portal/site-content';

/**
 * React node views of the legal editor (W7 addendum §8.4): live values as
 * grey chips with a popover for before / after / else / as, the full stop,
 * the Cookie settings button, the fixed request form, and headings with the
 * `#anchor` field under them.
 */

const chip =
  'inline-flex items-center gap-0.5 rounded px-1.5 align-baseline text-[0.85em] font-medium leading-snug ring-1 transition-colors';

const MAX = DOC_LIMITS.maxTokenAttrLength;

/** Tokens whose value is an email address may render as a mailto: link. */
const EMAIL_TOKENS = new Set(['site.email', 'contact.email', 'officer.email']);

function AttrInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        className="h-8 text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

let uid = 0;
function useUid(prefix: string) {
  const [id] = useState(() => `${prefix}-${++uid}`);
  return id;
}

/** A live value: "Officer name". Click to edit what goes around it. */
export function TokenView({ node, updateAttributes, editor, extension, selected, deleteNode }: ReactNodeViewProps) {
  const a = node.attrs as { name: string; before: string | null; after: string | null; else: string | null; as: string | null };
  const allowed = ((extension.options as { allowed?: readonly string[] }).allowed ?? []) as readonly string[];
  const [open, setOpen] = useState(false);
  const id = useUid('tok');
  const editable = editor.isEditable;
  const unknown = !allowed.includes(a.name);
  return (
    <NodeViewWrapper as="span" className="mx-px">
      <Popover open={open && editable} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            contentEditable={false}
            className={cn(
              chip,
              'cursor-pointer bg-muted text-foreground/80 ring-border hover:bg-accent',
              selected && 'ring-2 ring-primary',
              unknown && 'bg-destructive/10 text-destructive ring-destructive/40',
            )}
            aria-label={`Live value: ${tokenLabel(a.name)}${editable ? '. Edit it' : ''}`}
            data-sv-token-chip=""
          >
            {a.before ? <span className="font-normal text-muted-foreground">{a.before}</span> : null}
            {tokenLabel(a.name)}
            {a.as === 'mailto' ? <span className="font-normal text-muted-foreground"> (email link)</span> : null}
            {a.after ? <span className="font-normal text-muted-foreground">{a.after}</span> : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          <div>
            <p className="text-sm font-medium">Live value</p>
            <p className="text-xs text-muted-foreground">
              Filled in from Site settings when the page is published. The text before and after shows only when there
              is a value; “If empty” shows when there isn’t.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`${id}-name`}>
              Value
            </Label>
            <Select value={a.name} onValueChange={(v) => updateAttributes({ name: v, as: EMAIL_TOKENS.has(v) ? a.as : null })}>
              <SelectTrigger id={`${id}-name`} className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {unknown && <SelectItem value={a.name}>{tokenLabel(a.name)} (not allowed here)</SelectItem>}
                {allowed.map((n) => (
                  <SelectItem key={n} value={n}>
                    {tokenLabel(n)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AttrInput id={`${id}-b`} label="Text before" value={a.before ?? ''} onChange={(v) => updateAttributes({ before: v || null })} />
          <AttrInput id={`${id}-a`} label="Text after" value={a.after ?? ''} onChange={(v) => updateAttributes({ after: v || null })} />
          <AttrInput id={`${id}-e`} label="If empty" value={a.else ?? ''} onChange={(v) => updateAttributes({ else: v || null })} />
          {EMAIL_TOKENS.has(a.name) && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={a.as === 'mailto'}
                onChange={(e) => updateAttributes({ as: e.target.checked ? 'mailto' : null })}
              />
              Show as an email link
            </label>
          )}
          <div className="flex justify-between gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => deleteNode()}>
              Remove
            </Button>
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

/** "." unless the text just before already ends with one. */
export function StopView({ selected }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      title="Full stop: left out when the text before already ends with one"
      className={cn(chip, 'bg-muted px-1 font-mono text-foreground/70 ring-border', selected && 'ring-2 ring-primary')}
    >
      .
    </NodeViewWrapper>
  );
}

/** The privacy notice's inline Cookie settings button (shown only while optional services are on). */
export function CookieSettingsView({ node, updateAttributes, editor, selected }: ReactNodeViewProps) {
  const a = node.attrs as { before: string | null; after: string | null };
  const [open, setOpen] = useState(false);
  const id = useUid('cs');
  return (
    <NodeViewWrapper as="span" className="mx-px">
      <Popover open={open && editor.isEditable} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            contentEditable={false}
            className={cn(chip, 'bg-primary/10 text-primary ring-primary/30', selected && 'ring-2 ring-primary')}
            aria-label="Cookie settings button. Edit the text around it"
          >
            {a.before ? <span className="font-normal">{a.before}</span> : null}
            Cookie settings
            {a.after ? <span className="font-normal">{a.after}</span> : null}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          <p className="text-xs text-muted-foreground">
            Shown, with the text around it, only while the site uses analytics or advertising services.
          </p>
          <AttrInput id={`${id}-b`} label="Text before" value={a.before ?? ''} onChange={(v) => updateAttributes({ before: v || null })} />
          <AttrInput id={`${id}-a`} label="Text after" value={a.after ?? ''} onChange={(v) => updateAttributes({ after: v || null })} />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

/** The fixed request form (its fields, ids and texts are code). */
export function RequestFormView({ selected }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      contentEditable={false}
      data-drag-handle
      className={cn(
        'not-prose my-4 flex items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-5 text-sm text-muted-foreground',
        selected && 'ring-2 ring-primary',
      )}
    >
      <FileLock2 className="size-5 shrink-0" aria-hidden />
      <span>
        <span className="block font-medium text-foreground">Privacy request form (fixed)</span>
        The form people fill in. Its fields and words stay as they are; move it, but keep exactly one.
      </span>
    </NodeViewWrapper>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Heading with its link name: `#anchor` is the id the site renders and deep links use. */
export function HeadingView({ node, updateAttributes, editor, extension, selectionInside }: ReactNodeViewProps) {
  const level = Number(node.attrs.level) === 3 ? 3 : 2;
  const anchor = String(node.attrs.anchor ?? '');
  const locked = ((extension.options as { lockedAnchors?: readonly string[] }).lockedAnchors ?? []).includes(anchor);
  const allowCookies = ((extension.options as { lockedAnchors?: readonly string[] }).lockedAnchors ?? []).includes('cookies');
  const editable = editor.isEditable;
  const text = node.textContent;
  const id = useUid('anchor');

  // Propose a link name once, when someone finishes typing a new H2 (ASCII
  // headings only; a Hindi heading's link name must be typed). Never changed
  // again automatically.
  useEffect(() => {
    if (!editable || level !== 2 || anchor || selectionInside) return;
    const base = slugify(text).slice(0, 60).replace(/-+$/, '');
    if (!base || isReservedId(base, { allow: allowCookies ? ['cookies'] : [] })) return;
    const taken = new Set<string>();
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'heading' && n.attrs.anchor) taken.add(String(n.attrs.anchor));
    });
    let candidate = base;
    for (let i = 2; taken.has(candidate); i++) candidate = `${base}-${i}`;
    updateAttributes({ anchor: candidate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionInside]);

  let problem: string | null = null;
  if (anchor) {
    if (!isValidId(anchor)) problem = 'Use lower-case letters, digits and single hyphens (at most 60).';
    else if (isReservedId(anchor, { allow: allowCookies ? ['cookies'] : [] }))
      problem = 'This link name is used by the site itself. Pick another.';
    else {
      let count = 0;
      editor.state.doc.descendants((n) => {
        if (n.type.name === 'heading' && n.attrs.anchor === anchor) count++;
      });
      if (count > 1) problem = 'Another heading uses this link name.';
    }
  } else if (level === 2 && text.trim()) {
    problem = 'Every heading needs a link name.';
  }

  return (
    <NodeViewWrapper className="sv-legal-heading">
      {level === 2 ? <NodeViewContent<'h2'> as="h2" /> : <NodeViewContent<'h3'> as="h3" />}
      <div contentEditable={false} className="not-prose -mt-2 mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label htmlFor={id} className="flex items-center gap-1">
          <Hash className="size-3.5" aria-hidden />
          <span className="sr-only">Link name for this heading</span>
        </label>
        <input
          id={id}
          value={anchor}
          onChange={(e) => updateAttributes({ anchor: e.target.value.toLowerCase().replace(/\s+/g, '-') || null })}
          disabled={!editable || locked}
          placeholder={level === 2 ? 'link-name (required)' : 'link-name (optional)'}
          spellCheck={false}
          className={cn(
            'h-6 w-64 max-w-full rounded border border-input bg-background px-1.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-70',
            problem && 'border-destructive/60',
          )}
          aria-invalid={!!problem}
          aria-describedby={problem ? `${id}-p` : undefined}
        />
        {locked && (
          <span className="flex items-center gap-1">
            <Lock className="size-3" aria-hidden /> Fixed: the cookie banner links here
          </span>
        )}
        {problem && (
          <span id={`${id}-p`} className="text-destructive">
            {problem}
          </span>
        )}
      </div>
    </NodeViewWrapper>
  );
}
