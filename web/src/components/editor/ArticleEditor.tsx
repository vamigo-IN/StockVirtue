'use client';

import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from '@tiptap/react';
import {
  Bold,
  ChartCandlestick,
  ChevronDown,
  Clapperboard,
  Code,
  Columns3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
  MessageSquareQuote,
  Minus,
  Newspaper,
  Plus,
  Redo2,
  Rows3,
  Sparkles,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MediaPicker } from '@/components/portal/MediaPicker';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { LinkDialog, RelatedDialog, VideoDialog } from './EditorDialogs';
import { articleExtensions } from './extensions';
import { emptyTable, insertBlock } from './insert';
import { WidgetDialog } from './WidgetDialog';

function ToolButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
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

type Block = 'paragraph' | 'h2' | 'h3' | 'h4';

function Toolbar({
  editor,
  disabled,
  articleId,
}: {
  editor: Editor;
  disabled: boolean;
  articleId: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const me = usePortalMe();
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: (e.isActive('heading', { level: 2 })
        ? 'h2'
        : e.isActive('heading', { level: 3 })
          ? 'h3'
          : e.isActive('heading', { level: 4 })
            ? 'h4'
            : 'paragraph') as Block,
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      callout: e.isActive('callout'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();
  // Menus hand focus back to the story, not to the button that opened them.
  const backToStory = (e: Event) => {
    e.preventDefault();
    editor.commands.focus();
  };

  function setBlock(b: Block) {
    if (b === 'paragraph') run().setParagraph().run();
    else
      run()
        .setHeading({ level: Number(b.slice(1)) as 2 | 3 | 4 })
        .run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-16 z-10 flex flex-wrap items-center gap-0.5 rounded-t-xl border-b bg-card/95 px-2 py-1.5 backdrop-blur"
    >
      <ToolButton
        icon={Undo2}
        label="Undo"
        onClick={() => run().undo().run()}
        disabled={disabled || !s.canUndo}
      />
      <ToolButton
        icon={Redo2}
        label="Redo"
        onClick={() => run().redo().run()}
        disabled={disabled || !s.canRedo}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <Select
        value={s.block}
        onValueChange={(v) => setBlock(v as Block)}
        disabled={disabled}
      >
        <SelectTrigger
          size="sm"
          className="h-8 w-32 border-0 shadow-none"
          aria-label="Text style"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={backToStory}>
          <SelectItem value="paragraph">Paragraph</SelectItem>
          <SelectItem value="h2">Heading</SelectItem>
          <SelectItem value="h3">Subheading</SelectItem>
          <SelectItem value="h4">Minor heading</SelectItem>
        </SelectContent>
      </Select>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton
        icon={Bold}
        label="Bold"
        active={s.bold}
        disabled={disabled}
        onClick={() => run().toggleBold().run()}
      />
      <ToolButton
        icon={Italic}
        label="Italic"
        active={s.italic}
        disabled={disabled}
        onClick={() => run().toggleItalic().run()}
      />
      <ToolButton
        icon={Underline}
        label="Underline"
        active={s.underline}
        disabled={disabled}
        onClick={() => run().toggleUnderline().run()}
      />
      <ToolButton
        icon={Strikethrough}
        label="Strikethrough"
        active={s.strike}
        disabled={disabled}
        onClick={() => run().toggleStrike().run()}
      />
      <ToolButton
        icon={Code}
        label="Inline code"
        active={s.code}
        disabled={disabled}
        onClick={() => run().toggleCode().run()}
      />
      <ToolButton
        icon={Link2}
        label="Link"
        active={s.link}
        disabled={disabled}
        onClick={() => setLinkOpen(true)}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton
        icon={List}
        label="Bulleted list"
        active={s.bullet}
        disabled={disabled}
        onClick={() => run().toggleBulletList().run()}
      />
      <ToolButton
        icon={ListOrdered}
        label="Numbered list"
        active={s.ordered}
        disabled={disabled}
        onClick={() => run().toggleOrderedList().run()}
      />
      <ToolButton
        icon={MessageSquareQuote}
        label="Quote"
        active={s.quote}
        disabled={disabled}
        onClick={() => run().toggleBlockquote().run()}
      />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-muted-foreground"
            onMouseDown={(e) => e.preventDefault()}
          >
            <Plus /> Insert <ChevronDown className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-60"
          onCloseAutoFocus={backToStory}
        >
          <DropdownMenuItem onSelect={() => setMediaOpen(true)}>
            <ImagePlus /> Image from the library
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setVideoOpen(true)}>
            <Clapperboard /> YouTube or Vimeo video
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRelatedOpen(true)}>
            <Newspaper /> Related article
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setWidgetOpen(true)}>
            <ChartCandlestick /> Market or story widget
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={s.table}
            onSelect={() => insertBlock(editor, emptyTable())}
          >
            <Table2 /> Table
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              s.callout
                ? run().lift('callout').run()
                : run().wrapIn('callout', { tone: 'takeaway' }).run()
            }
          >
            <Sparkles />{' '}
            {s.callout ? 'Remove callout box' : 'Callout box (key takeaway)'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => insertBlock(editor, { type: 'horizontalRule' })}
          >
            <Minus /> Divider
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {s.table && !disabled && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolButton
            icon={Rows3}
            label="Add row below"
            onClick={() => run().addRowAfter().run()}
          />
          <ToolButton
            icon={Columns3}
            label="Add column right"
            onClick={() => run().addColumnAfter().run()}
          />
          <ToolButton
            icon={Trash2}
            label="Delete row"
            onClick={() => run().deleteRow().run()}
          />
          <ToolButton
            icon={Table2}
            label="Delete table"
            onClick={() => run().deleteTable().run()}
          />
        </>
      )}
      <LinkDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
      <VideoDialog
        editor={editor}
        open={videoOpen}
        onOpenChange={setVideoOpen}
      />
      <RelatedDialog
        open={relatedOpen}
        onOpenChange={setRelatedOpen}
        excludeId={articleId}
        onPick={(a) =>
          insertBlock(editor, {
            type: 'relatedArticle',
            attrs: { articleId: a.id, title: a.title, slug: a.slug },
          })
        }
      />
      <WidgetDialog
        open={widgetOpen}
        onOpenChange={setWidgetOpen}
        allowSaved={can(me, 'widgets.read')}
        onSave={(c) => {
          insertBlock(editor, {
            type: 'marketWidget',
            attrs: {
              widget: c.widget,
              v: 1,
              config: c.config,
              widgetId: c.widgetId ?? null,
            },
          });
          setWidgetOpen(false);
        }}
      />
      <MediaPicker
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        title="Insert an image"
        onPick={(asset) =>
          insertBlock(editor, {
            type: 'image',
            attrs: {
              mediaId: asset.id,
              src: asset.url,
              alt: asset.alt,
              caption: asset.caption ?? '',
              credit: asset.credit ?? '',
            },
          })
        }
      />
    </div>
  );
}

/** The story body: TipTap with the newsroom's allowed blocks only. */
export function ArticleEditor({
  articleId,
  initialContent,
  editable,
  onChange,
  onReady,
}: {
  articleId: string;
  initialContent: Record<string, unknown>;
  editable: boolean;
  onChange: (doc: Record<string, unknown>) => void;
  /** The TipTap editor once it exists (null when it goes), for tools beside it. */
  onReady?: (editor: Editor | null) => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: articleExtensions(),
    content:
      initialContent && Object.keys(initialContent).length
        ? initialContent
        : undefined,
    editorProps: {
      attributes: {
        class:
          'sv-prose prose prose-neutral dark:prose-invert max-w-none min-h-[45vh] focus:outline-none',
        'aria-label': 'Story text',
      },
    },
    onUpdate: ({ editor: e }) =>
      onChangeRef.current(e.getJSON() as Record<string, unknown>),
  });
  // Re-render whenever the document changes, and count from the editor's
  // current document: a selected value would read 0 for a story just opened
  // (the first one is taken before the editor exists).
  useEditorState({
    editor,
    selector: ({ editor: e }) => e?.state.doc ?? null,
    equalityFn: (a, b) => a === b,
  });
  const words = editor
    ? editor.state.doc
        .textBetween(0, editor.state.doc.content.size, ' ', ' ')
        .split(/\s+/)
        .filter(Boolean).length
    : 0;

  useEffect(() => {
    // false: switching to read-only is not an edit, so no autosave.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    onReadyRef.current?.(editor);
    return () => onReadyRef.current?.(null);
  }, [editor]);

  if (!editor) {
    return (
      <div className="min-h-[50vh] animate-pulse rounded-xl border bg-card" />
    );
  }
  return (
    <div className="rounded-xl border bg-card">
      <Toolbar editor={editor} disabled={!editable} articleId={articleId} />
      <div className="px-5 py-5 sm:px-8 sm:py-7">
        <EditorContent editor={editor} />
      </div>
      <div className="flex justify-end border-t px-4 py-2 text-xs text-muted-foreground tabular-nums">
        {(words ?? 0).toLocaleString('en-IN')} words · about{' '}
        {Math.max(1, Math.round((words ?? 0) / 200))} min read
      </div>
    </div>
  );
}
