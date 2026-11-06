'use client';

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  Bold,
  ChevronDown,
  Code,
  Columns3,
  Cookie,
  FileLock2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
  Plus,
  Redo2,
  Rows3,
  StickyNote,
  Table2,
  Trash2,
  Type,
  Undo2,
  Variable,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { emptyTable, insertBlock } from '@/components/editor/insert';
import { legalExtensions, toStoredDoc } from '@/components/editor/legal-extensions';
import { MediaPicker } from '@/components/portal/MediaPicker';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DOC_LIMITS, DOC_TOKENS } from '@/content/site/limits';
import type { DocProfile } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { canonicalJson, tokenLabel } from '@/portal/site-content';
import { LinkEditDialog } from './LinkEditDialog';

/**
 * The body of a legal document or a custom page (W7 addendum §8.4): TipTap
 * with the legal profile. Headings carry their link name under them, live
 * values are grey chips, tables have a header row and a caption, and the
 * profile adds its islands (Cookie settings on the privacy notice, the
 * request form on the requests page, images on custom pages). The editor
 * never shows HTML; the preview pane shows the real page.
 */

function ToolButton({ icon: Icon, label, onClick, active, disabled }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
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
            'grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
            active && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type Block = 'paragraph' | 'note' | 'h2' | 'h3';

function CaptionTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const max = DOC_LIMITS.tableCaption[1];
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(String(editor.getAttributes('table').caption ?? ''));
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onMouseDown={(e) => e.preventDefault()}>
          <Type /> Table caption
        </Button>
      </PopoverTrigger>
      <PopoverContent className="space-y-2" align="start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            editor.chain().focus().updateAttributes('table', { caption: value.trim() }).run();
            setOpen(false);
          }}
          className="space-y-2"
        >
          <Label htmlFor="table-caption">Caption</Label>
          <Input id="table-caption" value={value} maxLength={max} onChange={(e) => setValue(e.target.value)} autoFocus />
          <p className="text-xs text-muted-foreground">Names the table for screen readers, e.g. “What we collect”.</p>
          <div className="flex justify-end">
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Toolbar({ editor, profile, disabled }: { editor: Editor; profile: DocProfile; disabled: boolean }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 2 })
        ? 'h2'
        : e.isActive('heading', { level: 3 })
          ? 'h3'
          : e.isActive('paragraph', { variant: 'note' })
            ? 'note'
            : 'paragraph') as Block,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      table: e.isActive('table'),
      heading: e.isActive('heading'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();
  const back = (e: Event) => {
    e.preventDefault();
    editor.commands.focus();
  };
  const tokens = DOC_TOKENS[profile] ?? [];

  function setBlock(b: Block) {
    if (b === 'paragraph') run().setParagraph().updateAttributes('paragraph', { variant: null }).run();
    else if (b === 'note') run().setParagraph().updateAttributes('paragraph', { variant: 'note' }).run();
    else run().setHeading({ level: b === 'h2' ? 2 : 3 }).run();
  }

  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-16 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-card/95 px-2 py-1.5 backdrop-blur">
      <ToolButton icon={Undo2} label="Undo" onClick={() => run().undo().run()} disabled={disabled || !s.canUndo} />
      <ToolButton icon={Redo2} label="Redo" onClick={() => run().redo().run()} disabled={disabled || !s.canRedo} />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Select value={s.block} onValueChange={(v) => setBlock(v as Block)} disabled={disabled}>
        <SelectTrigger size="sm" className="h-8 w-36 border-0 shadow-none" aria-label="Text style">
          <SelectValue />
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={back}>
          <SelectItem value="paragraph">Paragraph</SelectItem>
          <SelectItem value="h2">Heading</SelectItem>
          <SelectItem value="h3">Subheading</SelectItem>
          <SelectItem value="note">Note (small)</SelectItem>
        </SelectContent>
      </Select>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton icon={Bold} label="Bold" active={s.bold} disabled={disabled || s.heading} onClick={() => run().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic" active={s.italic} disabled={disabled || s.heading} onClick={() => run().toggleItalic().run()} />
      <ToolButton icon={Code} label="Code (cookie names)" active={s.code} disabled={disabled || s.heading} onClick={() => run().toggleCode().run()} />
      <ToolButton icon={Link2} label="Link" active={s.link} disabled={disabled || s.heading} onClick={() => setLinkOpen(true)} />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton icon={List} label="Bulleted list" active={s.bullet} disabled={disabled} onClick={() => run().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="Numbered list" active={s.ordered} disabled={disabled} onClick={() => run().toggleOrderedList().run()} />
      <ToolButton
        icon={StickyNote}
        label="Note paragraph"
        active={s.block === 'note'}
        disabled={disabled || s.heading}
        onClick={() => setBlock(s.block === 'note' ? 'paragraph' : 'note')}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" onMouseDown={(e) => e.preventDefault()}>
            <Plus /> Insert <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto" onCloseAutoFocus={back}>
          <DropdownMenuItem disabled={s.table} onSelect={() => insertBlock(editor, { ...emptyTable(), attrs: { caption: '' } })}>
            <Table2 /> Table
          </DropdownMenuItem>
          {profile === 'privacy-en' && (
            <DropdownMenuItem onSelect={() => run().insertContent({ type: 'cookieSettings', attrs: { before: ' (or ', after: ' now)' } }).run()}>
              <Cookie /> Cookie settings button
            </DropdownMenuItem>
          )}
          {profile === 'requests' && (
            <DropdownMenuItem onSelect={() => insertBlock(editor, { type: 'requestForm' })}>
              <FileLock2 /> Request form
            </DropdownMenuItem>
          )}
          {profile === 'simple' && (
            <DropdownMenuItem onSelect={() => setMediaOpen(true)}>
              <ImagePlus /> Image from the library
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => run().insertContent({ type: 'stop' }).run()}>
            <span className="grid size-4 place-items-center font-mono">.</span> Full stop (only if needed)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
            <Variable className="size-3.5" /> Live value from Site settings
          </DropdownMenuLabel>
          {tokens.map((t) => (
            <DropdownMenuItem key={t} onSelect={() => run().insertContent({ type: 'token', attrs: { name: t } }).run()}>
              {tokenLabel(t)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {s.table && !disabled && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolButton icon={Rows3} label="Add row below" onClick={() => run().addRowAfter().run()} />
          <ToolButton icon={Columns3} label="Add column right" onClick={() => run().addColumnAfter().run()} />
          <ToolButton icon={Trash2} label="Delete row" onClick={() => run().deleteRow().run()} />
          <ToolButton icon={Table2} label="Delete table" onClick={() => run().deleteTable().run()} />
          <CaptionTool editor={editor} />
        </>
      )}
      <LinkEditDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      {profile === 'simple' && (
        <MediaPicker
          open={mediaOpen}
          onOpenChange={setMediaOpen}
          title="Insert an image"
          onPick={(asset) =>
            insertBlock(editor, {
              type: 'image',
              attrs: { mediaId: asset.id, src: asset.url ?? '', alt: asset.alt, caption: asset.caption ?? '', credit: asset.credit ?? '' },
            })
          }
        />
      )}
    </div>
  );
}

export function LegalDocEditor({ profile, value, onChange, editable, lang, label }: {
  profile: DocProfile;
  value: unknown;
  onChange: (doc: { type: 'doc'; content: unknown[] }) => void;
  editable: boolean;
  lang: 'en' | 'hi';
  label: string;
}) {
  const last = useRef(canonicalJson(value ?? null));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: legalExtensions(profile),
    content: (value as object) ?? undefined,
    editorProps: {
      attributes: {
        class: 'sv-prose prose prose-neutral dark:prose-invert max-w-none min-h-[45vh] focus:outline-none',
        'aria-label': label,
        lang,
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = toStoredDoc(e.getJSON());
      last.current = canonicalJson(doc);
      onChangeRef.current(doc);
    },
  });
  // Outside changes (reset, restore, reload) replace the document.
  useEffect(() => {
    if (!editor) return;
    const incoming = canonicalJson(value ?? null);
    if (incoming !== last.current) {
      last.current = incoming;
      editor.commands.setContent((value as object) ?? { type: 'doc', content: [] }, { emitUpdate: false });
    }
  }, [editor, value]);
  useEffect(() => {
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  if (!editor) return <div className="min-h-[50vh] animate-pulse rounded-xl border bg-card" />;
  return (
    <div className="rounded-xl border bg-card">
      <Toolbar editor={editor} profile={profile} disabled={!editable} />
      <div className="px-5 py-5 sm:px-8 sm:py-7 [&_.sv-legal-table]:w-full [&_.sv-legal-table_td]:border [&_.sv-legal-table_td]:p-2 [&_.sv-legal-table_th]:border [&_.sv-legal-table_th]:bg-muted/50 [&_.sv-legal-table_th]:p-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
