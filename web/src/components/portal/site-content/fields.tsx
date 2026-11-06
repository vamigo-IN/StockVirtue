'use client';

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { ArrowDown, ArrowUp, Bold, ImageIcon, Italic, Link2, Lock, Plus, Trash2, Variable, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { inlineExtensions, toStoredInline } from '@/components/editor/legal-extensions';
import { MediaPicker } from '@/components/portal/MediaPicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { APP_FACTS, type FactId } from '@/content/app';
import { inlineLength, textLength, type FieldRule } from '@/content/site/limits';
import { isReservedId, isValidId } from '@/content/site/reserved-ids';
import type { Fact, TokenName } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { canonicalJson, istToday, tokenLabel } from '@/portal/site-content';
import { LinkEditDialog } from './LinkEditDialog';
import { useRefocusOnClose } from './return-focus';

/**
 * The controls of the schema-driven form (W7 addendum §8.3), one per field
 * kind of §3.1. Each shows its live length against the limit ("53 / 56",
 * amber from 95 %), its "where this shows" help, the API's error for it,
 * and a lock on legal-locked fields for people without legal.manage.
 */

export interface FieldBase {
  id: string;
  label: string;
  help?: string;
  rule?: FieldRule;
  disabled?: boolean;
  error?: string;
  /** Legal-locked and this person may not change it. */
  locked?: boolean;
}

/* ── Shell and counter ───────────────────────────────────────────────────── */

export function LengthCounter({ length, rule, id }: { length: number; rule?: FieldRule; id?: string }) {
  const [min, max] = rule?.len ?? [0, 0];
  if (!max) return null;
  const over = length > max || (length > 0 && length < min) || (length === 0 && min > 0 && !rule?.optional);
  const near = !over && length >= max * 0.95;
  return (
    <span
      id={id}
      className={cn(
        'shrink-0 text-xs tabular-nums text-muted-foreground',
        near && 'text-warning',
        over && 'font-medium text-destructive',
      )}
      title={min ? `Between ${min} and ${max} characters` : `Up to ${max} characters`}
    >
      {length} / {max}
    </span>
  );
}

export function FieldShell({
  id,
  label,
  help,
  error,
  locked,
  counter,
  children,
  aside,
}: {
  id: string;
  label: string;
  help?: string;
  error?: string;
  locked?: boolean;
  counter?: React.ReactNode;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field={id}>
      <div className="flex items-end justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-1.5">
          {label}
          {locked && (
            <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
              <Lock className="size-3" aria-hidden /> Needs the legal.manage permission
            </span>
          )}
        </Label>
        {counter}
      </div>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {aside}
      {error && (
        <p className="text-xs text-destructive" role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Plain text ──────────────────────────────────────────────────────────── */

export function LineField({ id, label, help, rule, disabled, error, locked, value, onChange, placeholder }: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  // A format the value must match (e.g. the size in MB); the API checks it again.
  let format: string | undefined;
  if (rule?.pattern && value) {
    try {
      if (!new RegExp(rule.pattern, 'u').test(value)) format = 'This isn’t in the format the field needs (see below).';
    } catch {
      format = undefined;
    }
  }
  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error ?? format}
      locked={locked}
      counter={<LengthCounter length={textLength(value ?? '')} rule={rule} id={`${id}-count`} />}
    >
      <Input
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
        disabled={disabled || locked}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : `${id}-count`}
      />
    </FieldShell>
  );
}

export function TextField({ id, label, help, rule, disabled, error, locked, value, onChange, rows = 3 }: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      locked={locked}
      counter={<LengthCounter length={textLength(value ?? '')} rule={rule} id={`${id}-count`} />}
    >
      <Textarea
        id={id}
        value={value ?? ''}
        rows={rows}
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
        disabled={disabled || locked}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : `${id}-count`}
      />
    </FieldShell>
  );
}

export function NumberField({ id, label, help, rule, disabled, error, value, onChange }: FieldBase & {
  value: number;
  onChange: (v: number) => void;
}) {
  const [min, max] = rule?.range ?? [0, 100];
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        disabled={disabled}
        className="w-28"
      />
    </FieldShell>
  );
}

export function MonthField({ id, label, help, disabled, error, value, onChange }: FieldBase & {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      <Input id={id} type="month" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="w-48" />
    </FieldShell>
  );
}

export function BooleanField({ id, label, help, disabled, value, onChange }: FieldBase & {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <Switch id={id} checked={!!value} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
      <div className="space-y-1">
        <Label htmlFor={id}>{label}</Label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
    </div>
  );
}

/** A link name (`id` kind). Published ones change only through "Change link". */
export function IdField({ id, label, help, disabled, error, value, onChange, published, unlocked, onUnlock }: FieldBase & {
  value: string;
  onChange: (v: string) => void;
  /** The live content has this id at this place. */
  published: boolean;
  unlocked: boolean;
  onUnlock: () => void;
}) {
  const problem =
    value && !isValidId(value)
      ? 'Use lower-case letters, digits and single hyphens (at most 60).'
      : value && isReservedId(value)
        ? 'This link name is used by the site itself. Pick another.'
        : undefined;
  const readOnly = published && !unlocked;
  return (
    <FieldShell id={id} label={label} help={help} error={error ?? problem}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          readOnly={readOnly}
          disabled={disabled}
          spellCheck={false}
          className={cn('font-mono text-sm', readOnly && 'bg-muted/50')}
          aria-invalid={!!(error ?? problem)}
        />
        {readOnly && !disabled && (
          <Button type="button" variant="outline" size="sm" onClick={onUnlock}>
            Change link
          </Button>
        )}
      </div>
    </FieldShell>
  );
}

/* ── Rich inline text: one paragraph of TipTap ───────────────────────────── */

function MiniTool({ label, icon: Icon, active, onClick, disabled }: {
  label: string;
  icon: typeof Bold;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const toDoc = (value: unknown) => ({
  type: 'doc',
  content: [{ type: 'paragraph', ...(Array.isArray(value) && value.length ? { content: value } : {}) }],
});

/** The single-paragraph TipTap editor of an `inline` field. */
export function InlineEditor({ id, value, onChange, marks, tokens, disabled, invalid, label, describedBy }: {
  id: string;
  value: unknown;
  onChange: (v: unknown[]) => void;
  marks: boolean;
  tokens: readonly TokenName[];
  disabled?: boolean;
  invalid?: boolean;
  label: string;
  describedBy?: string;
}) {
  const last = useRef(canonicalJson(value ?? []));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [linkOpen, setLinkOpen] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: inlineExtensions({ marks, tokens }),
    content: toDoc(value),
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'false',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        class: 'min-h-9 px-3 py-1.5 text-sm leading-relaxed outline-none [&_a]:text-primary [&_a]:underline',
      },
      // One paragraph: Enter does nothing.
      handleKeyDown: (_view, event) => event.key === 'Enter',
    },
    onUpdate: ({ editor: e }) => {
      const next = toStoredInline(e.getJSON());
      last.current = canonicalJson(next);
      onChangeRef.current(next);
    },
  });
  // Outside changes (reset, restore, reload) replace the text.
  useEffect(() => {
    if (!editor) return;
    const incoming = canonicalJson(value ?? []);
    if (incoming !== last.current) {
      last.current = incoming;
      editor.commands.setContent(toDoc(value), { emitUpdate: false });
    }
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e ? { bold: e.isActive('bold'), italic: e.isActive('italic'), link: e.isActive('link') } : null,
  });

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        invalid && 'border-destructive',
        disabled && 'opacity-60',
      )}
    >
      {editor && (marks || tokens.length > 0) && !disabled && (
        <div className="flex items-center gap-0.5 border-b px-1 py-0.5">
          {marks && (
            <>
              <MiniTool label="Bold" icon={Bold} active={s?.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
              <MiniTool label="Italic" icon={Italic} active={s?.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
              <MiniTool label="Link" icon={Link2} active={s?.link} onClick={() => setLinkOpen(true)} />
            </>
          )}
          {tokens.map((t) => (
            <Button
              key={t}
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().insertContent({ type: 'token', attrs: { name: t } }).run()}
            >
              <Variable className="size-3.5" /> {tokenLabel(t)}
            </Button>
          ))}
        </div>
      )}
      {editor ? <EditorContent editor={editor} /> : <div className="h-9" />}
      {editor && marks && <LinkEditDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />}
    </div>
  );
}

export function InlineField({ id, label, help, rule, disabled, error, locked, value, onChange, marks = true }: FieldBase & {
  value: unknown;
  onChange: (v: unknown[]) => void;
  marks?: boolean;
}) {
  const length = Array.isArray(value) ? inlineLength(value as { type: string; text?: unknown }[]) : 0;
  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      locked={locked}
      counter={<LengthCounter length={length} rule={rule} id={`${id}-count`} />}
    >
      <InlineEditor
        id={id}
        label={label}
        value={value}
        onChange={onChange}
        marks={marks}
        tokens={rule?.tokens ?? []}
        disabled={disabled || locked}
        invalid={!!error}
        describedBy={error ? `${id}-error` : `${id}-count`}
      />
    </FieldShell>
  );
}

/**
 * A `paras` field (About's founder letter): stacked one-paragraph editors,
 * each with its own length, added, moved and removed inside the count, with
 * the words in all beside the label.
 */
export function ParasField({ id, label, help, rule, disabled, error, locked, value, onChange }: FieldBase & {
  value: unknown;
  onChange: (v: unknown[][]) => void;
}) {
  const paras = Array.isArray(value) ? (value as unknown[][]).map((p) => (Array.isArray(p) ? p : [])) : [];
  const [min, max] = rule?.count ?? [1, 4];
  const off = disabled || locked;
  const each: FieldRule = { kind: 'inline', len: rule?.len };
  const words = paras.reduce((n, p) => {
    const text = (p as { type?: string; text?: unknown }[]).map((x) => (x?.type === 'text' && typeof x.text === 'string' ? x.text : ' ')).join('');
    return n + (text.trim() ? text.trim().split(/\s+/).length : 0);
  }, 0);
  const move = (i: number, d: -1 | 1) => {
    const next = paras.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      locked={locked}
      counter={
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {words} words · {paras.length} {min === max ? `(exactly ${min})` : `(${min}–${max})`}
        </span>
      }
    >
      <ol className="space-y-3">
        {paras.map((p, i) => (
          <li key={i} className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">Paragraph {i + 1}</span>
              <LengthCounter length={inlineLength(p as { type: string; text?: unknown }[])} rule={each} id={`${id}-${i}-count`} />
              {!off && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move paragraph ${i + 1} up`}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => move(i, 1)} disabled={i === paras.length - 1} aria-label={`Move paragraph ${i + 1} down`}>
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => onChange(paras.filter((_, j) => j !== i))}
                    disabled={paras.length <= min}
                    aria-label={`Remove paragraph ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
            <InlineEditor
              id={i === 0 ? id : `${id}-${i}`}
              label={`${label}, paragraph ${i + 1}`}
              value={p}
              onChange={(v) => onChange(paras.map((x, j) => (j === i ? v : x)))}
              marks
              tokens={rule?.tokens ?? []}
              disabled={off}
              invalid={!!error}
              describedBy={`${id}-${i}-count`}
            />
          </li>
        ))}
      </ol>
      {!off && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...paras, []])} disabled={paras.length >= max}>
          <Plus /> Add a paragraph
        </Button>
      )}
    </FieldShell>
  );
}

/* ── Facts (§1.4) ────────────────────────────────────────────────────────── */

const FACT_IDS = Object.keys(APP_FACTS) as FactId[];

function FactChip({ id, onRemove, disabled }: { id: FactId; onRemove: () => void; disabled?: boolean }) {
  const fact = APP_FACTS[id];
  const verify = fact?.status === 'verify';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn('gap-1 font-mono text-[11px]', verify && 'border-warning/50 bg-warning/10 text-warning')}
          tabIndex={0}
        >
          {id}
          {verify && <span className="font-sans">· unconfirmed</span>}
          {!disabled && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove fact ${id}`}
              className="-mr-1 rounded-sm hover:bg-accent"
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{fact?.text ?? 'Unknown fact'}</TooltipContent>
    </Tooltip>
  );
}

function ValueEditor({ of, id, label, value, onChange, disabled, rule, error }: {
  of: 'line' | 'text' | 'inline';
  id: string;
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
  rule?: FieldRule;
  error?: boolean;
}) {
  if (of === 'inline') {
    return (
      <InlineEditor id={id} label={label} value={value} onChange={onChange} marks tokens={rule?.tokens ?? []} disabled={disabled} invalid={error} />
    );
  }
  if (of === 'line') {
    return (
      <Input id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))} disabled={disabled} aria-invalid={error} />
    );
  }
  return (
    <Textarea id={id} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))} disabled={disabled} aria-invalid={error} />
  );
}

const lengthOf = (of: 'line' | 'text' | 'inline', v: unknown) =>
  of === 'inline'
    ? Array.isArray(v)
      ? inlineLength(v as { type: string; text?: unknown }[])
      : 0
    : textLength(String(v ?? ''));

/**
 * A `fact<K>` field: the text, its fact ids (chips, with the fact's own text
 * in a tooltip and beside the input), and the fallback shown while a fact is
 * unconfirmed (none = the line is dropped).
 */
export function FactField({ id, label, help, rule, disabled, error, locked, value, onChange }: FieldBase & {
  value: Fact<unknown>;
  onChange: (v: Fact<unknown>) => void;
}) {
  const of = (rule?.of === 'line' || rule?.of === 'inline' ? rule.of : 'text') as 'line' | 'text' | 'inline';
  const fact = value ?? { value: of === 'inline' ? [] : '', facts: [] };
  const facts = Array.isArray(fact.facts) ? fact.facts : [];
  const hasFallback = fact.fallback !== undefined && fact.fallback !== null;
  const off = disabled || locked;
  const [adding, setAdding] = useState('');
  const unconfirmed = facts.filter((f) => APP_FACTS[f]?.status === 'verify');
  return (
    <FieldShell
      id={id}
      label={label}
      help={help}
      error={error}
      locked={locked}
      counter={<LengthCounter length={lengthOf(of, fact.value)} rule={rule} id={`${id}-count`} />}
      aside={
        <div className="space-y-2 rounded-md bg-muted/40 p-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Facts:</span>
            {facts.length === 0 && <span className="text-xs text-muted-foreground">none</span>}
            {facts.map((f) => (
              <FactChip key={f} id={f} disabled={off} onRemove={() => onChange({ ...fact, facts: facts.filter((x) => x !== f) })} />
            ))}
            {!off && (
              <select
                aria-label={`Add a fact to ${label}`}
                value={adding}
                onChange={(e) => {
                  const f = e.target.value as FactId;
                  setAdding('');
                  if (f && !facts.includes(f)) onChange({ ...fact, facts: [...facts, f] });
                }}
                className="h-6 w-28 max-w-full rounded border border-input bg-background px-1 text-xs"
              >
                <option value="">+ Add fact</option>
                {FACT_IDS.filter((f) => !facts.includes(f)).map((f) => (
                  <option key={f} value={f}>
                    {f}: {APP_FACTS[f].text.slice(0, 60)}
                    {APP_FACTS[f].text.length > 60 ? '…' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {facts.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {facts.map((f) => (
                <li key={f}>
                  <span className="font-mono">{f}</span> {APP_FACTS[f]?.text}
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={hasFallback}
              disabled={off}
              onChange={(e) =>
                onChange({ ...fact, fallback: e.target.checked ? (of === 'inline' ? [] : '') : null })
              }
            />
            Show other words while a fact is unconfirmed
            {unconfirmed.length > 0 && (
              <span className="text-warning">({unconfirmed.join(', ')} unconfirmed: readers see {hasFallback ? 'these words' : 'nothing here'})</span>
            )}
          </label>
          {hasFallback && (
            <ValueEditor
              of={of}
              id={`${id}-fallback`}
              label={`${label}: words while a fact is unconfirmed`}
              value={fact.fallback}
              onChange={(v) => onChange({ ...fact, fallback: v })}
              disabled={off}
              rule={rule}
            />
          )}
        </div>
      }
    >
      <ValueEditor of={of} id={id} label={label} value={fact.value} onChange={(v) => onChange({ ...fact, value: v })} disabled={off} rule={rule} error={!!error} />
    </FieldShell>
  );
}

/* ── Media (§3.1 screen, photo) ──────────────────────────────────────────── */

type ScreenValue = { mediaId: string; alt: string; captured: string; theme: 'light' | 'dark'; noPersonalData: boolean; src?: string };

function Thumb({ src }: { src?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-24 w-auto rounded border object-contain" />
  ) : (
    <span className="grid h-24 w-16 place-items-center rounded border bg-muted text-muted-foreground">
      <ImageIcon className="size-5" aria-hidden />
    </span>
  );
}

/** An app screenshot: library image, alt text, capture date, theme, and the demo-account promise. */
export function ScreenField({ id, label, help, disabled, error, value, onChange }: FieldBase & {
  value: ScreenValue | null;
  onChange: (v: ScreenValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  useRefocusOnClose(open);
  const [src, setSrc] = useState<string | undefined>(value?.src);
  const v = value;
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      <div className="flex flex-wrap items-start gap-3 rounded-md border p-3">
        <Thumb src={src ?? v?.src} />
        <div className="min-w-0 flex-1 space-y-2">
          {v ? (
            <>
              <Input
                id={id}
                value={v.alt}
                onChange={(e) => onChange({ ...v, alt: e.target.value })}
                placeholder="Alt text: what the screen shows"
                disabled={disabled}
                aria-label={`${label}: alt text`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`${id}-captured`} className="text-xs">
                  Captured on
                </Label>
                <Input
                  id={`${id}-captured`}
                  type="date"
                  max={istToday()}
                  value={v.captured}
                  onChange={(e) => onChange({ ...v, captured: e.target.value })}
                  disabled={disabled}
                  className="h-8 w-40"
                />
                <select
                  aria-label={`${label}: theme`}
                  value={v.theme}
                  onChange={(e) => onChange({ ...v, theme: e.target.value as 'light' | 'dark' })}
                  disabled={disabled}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="dark">Dark theme</option>
                  <option value="light">Light theme</option>
                </select>
              </div>
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={v.noPersonalData === true}
                  onChange={(e) => onChange({ ...v, noPersonalData: e.target.checked })}
                  disabled={disabled}
                />
                Taken with the staff demo account: it shows no real person’s data.
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No screenshot: the page uses its text-only layout.</p>
          )}
          {!disabled && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Plus /> {v ? 'Replace' : 'Choose a screenshot'}
              </Button>
              {v && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        title="Choose an app screenshot"
        onPick={(asset) => {
          setSrc(asset.thumbUrl ?? asset.url ?? undefined);
          onChange({
            mediaId: asset.id,
            alt: v?.alt || asset.alt || '',
            captured: v?.captured || istToday(),
            theme: v?.theme ?? 'dark',
            noPersonalData: false,
          });
        }}
      />
    </FieldShell>
  );
}

/** A photo (About's founder letter): library image and alt text. */
export function PhotoField({ id, label, help, disabled, error, value, onChange }: FieldBase & {
  value: { mediaId: string; alt: string; src?: string } | null;
  onChange: (v: { mediaId: string; alt: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  useRefocusOnClose(open);
  const [src, setSrc] = useState<string | undefined>(value?.src);
  return (
    <FieldShell id={id} label={label} help={help} error={error}>
      <div className="flex flex-wrap items-start gap-3 rounded-md border p-3">
        <Thumb src={src ?? value?.src} />
        <div className="min-w-0 flex-1 space-y-2">
          {value && (
            <Input
              id={id}
              value={value.alt}
              onChange={(e) => onChange({ mediaId: value.mediaId, alt: e.target.value })}
              placeholder="Alt text"
              disabled={disabled}
              aria-label={`${label}: alt text`}
            />
          )}
          {!disabled && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Plus /> {value ? 'Replace' : 'Choose a photo'}
              </Button>
              {value && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        onPick={(asset) => {
          setSrc(asset.thumbUrl ?? asset.url ?? undefined);
          onChange({ mediaId: asset.id, alt: value?.alt || asset.alt || '' });
        }}
      />
    </FieldShell>
  );
}

export type { Editor };
