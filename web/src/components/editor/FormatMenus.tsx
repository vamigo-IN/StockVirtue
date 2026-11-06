'use client';

import type { Editor } from '@tiptap/react';
import {
  Ban,
  ChevronDown,
  type LucideIcon,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useId } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  type Alignment,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  TEXT_COLORS,
  type TextColor,
} from './formatting';

/**
 * The toolbar's alignment and colour menus. Each is a menu of radio items
 * (the current choice is checked; arrow keys, Enter and type to select),
 * named in words, with the swatch beside the name. Closing a menu hands
 * focus back to the story (`onCloseAutoFocus`).
 *
 * The colour menu holds two sections, Text colour and Highlight, side by
 * side (one toolbar button instead of two keeps the toolbar on one row in
 * the workspace's story column). It carries `.sv-palette`, so its swatches
 * use the shades the editor itself shows on the current background
 * (article-prose.css).
 */

/** `null`: the selection holds more than one value. */
export type ColorState<T extends string> = T | 'default' | null;

const ALIGN: {
  value: Alignment;
  label: string;
  icon: LucideIcon;
  key: string;
}[] = [
  { value: 'left', label: 'Align left', icon: TextAlignStart, key: 'L' },
  { value: 'center', label: 'Centre', icon: TextAlignCenter, key: 'E' },
  { value: 'right', label: 'Align right', icon: TextAlignEnd, key: 'R' },
  { value: 'justify', label: 'Justify', icon: TextAlignJustify, key: 'J' },
];

const ALIGN_NAME: Record<Alignment, string> = {
  left: 'Left',
  center: 'Centre',
  right: 'Right',
  justify: 'Justified',
};

const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The shortcut as shown, and as `aria-keyshortcuts` announces it. */
function shortcut(key: string): { shown: string; aria: string } {
  return isMac()
    ? { shown: `⇧⌘${key}`, aria: `Meta+Shift+${key}` }
    : { shown: `Ctrl+Shift+${key}`, aria: `Control+Shift+${key}` };
}

/**
 * A toolbar button that opens a menu: same size and states as the tool
 * buttons, named by `label`, with `tip` in a tooltip. Place it inside a
 * `DropdownMenu` (the toolbar's Insert menu uses it too).
 */
export function MenuButton({
  label,
  tip,
  disabled,
  className,
  children,
}: {
  label: string;
  tip: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            aria-label={label}
            className={cn(
              // aria-expanded, not data-state: the tooltip's data-state wins on a shared trigger.
              'flex h-8 items-center gap-0.5 rounded-md pr-1 pl-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-accent aria-expanded:text-accent-foreground',
              className,
            )}
          >
            {children}
            <ChevronDown aria-hidden="true" className="size-3 opacity-70" />
          </button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function AlignMenu({
  editor,
  value,
  disabled,
  onCloseAutoFocus,
}: {
  editor: Editor;
  value: Alignment;
  disabled: boolean;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const current = ALIGN.find((a) => a.value === value) ?? ALIGN[0];
  const Icon = current.icon;
  const apply = (v: Alignment) => {
    const chain = editor.chain().focus();
    (v === 'left' ? chain.unsetTextAlign() : chain.setTextAlign(v)).run();
  };
  return (
    <DropdownMenu>
      <MenuButton
        label={`Alignment: ${ALIGN_NAME[value]}`}
        tip="Alignment"
        disabled={disabled}
      >
        <Icon aria-hidden="true" className="size-4" />
      </MenuButton>
      <DropdownMenuContent
        align="start"
        className="min-w-56"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuRadioGroup value={value}>
          {ALIGN.map((a) => {
            const keys = shortcut(a.key);
            return (
              <DropdownMenuRadioItem
                key={a.value}
                value={a.value}
                aria-keyshortcuts={keys.aria}
                onSelect={() => apply(a.value)}
                className="whitespace-nowrap"
              >
                <a.icon aria-hidden="true" />
                {a.label}
                <DropdownMenuShortcut aria-hidden="true" className="pl-6">
                  {keys.shown}
                </DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const textVar = (c: TextColor): CSSProperties => ({
  color: `var(--prose-text-${c})`,
});
const markVar = (c: HighlightColor): CSSProperties => ({
  backgroundColor: `var(--prose-mark-${c})`,
});

/** "A" in the colour, on the editor's own background. */
function TextSwatch({ color }: { color?: TextColor }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-[5px] border bg-card text-[14px] leading-none font-bold text-card-foreground"
      style={color ? textVar(color) : undefined}
    >
      A
    </span>
  );
}

/** "A" in the default text colour on the tint; "None" shows a slashed box. */
function HighlightSwatch({ color }: { color?: HighlightColor }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-[5px] border bg-card text-[14px] leading-none font-semibold text-card-foreground"
      style={color ? markVar(color) : undefined}
    >
      {color ? 'A' : <Ban className="size-3.5 text-muted-foreground" />}
    </span>
  );
}

/** A label from a palette list ("Blue"), or null for an unknown id. */
function labelOf(
  list: readonly { id: string; label: string }[],
  v: string,
): string | null {
  return list.find((c) => c.id === v)?.label ?? null;
}

/**
 * The Colour button's name, both values in words: "Colour: Blue text,
 * Yellow highlight", "Colour: Default text, no highlight", and "Mixed text"
 * or "mixed highlight" when the selection holds more than one value.
 */
function colourName(
  text: ColorState<TextColor>,
  highlight: ColorState<HighlightColor>,
): string {
  const t =
    text === null
      ? 'Mixed text'
      : text === 'default'
        ? 'Default text'
        : `${labelOf(TEXT_COLORS, text) ?? 'Default'} text`;
  const h =
    highlight === null
      ? 'mixed highlight'
      : highlight === 'default'
        ? 'no highlight'
        : `${labelOf(HIGHLIGHT_COLORS, highlight) ?? 'no'} highlight`;
  return `Colour: ${t}, ${h}`;
}

/**
 * Text colour and highlight in one menu: two labelled sections side by side
 * (Text colour: Default and the 7 colours; Highlight: None and the 5 tints).
 * Arrow keys walk down the Text colour list, then the Highlight list. The
 * button shows the selection's look: "A" in its text colour on its tint.
 */
export function ColourMenu({
  editor,
  text,
  highlight,
  disabled,
  onCloseAutoFocus,
}: {
  editor: Editor;
  text: ColorState<TextColor>;
  highlight: ColorState<HighlightColor>;
  disabled: boolean;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const textLabel = useId();
  const markLabel = useId();
  const colored = text && text !== 'default' ? text : null;
  const tinted = highlight && highlight !== 'default' ? highlight : null;
  return (
    <DropdownMenu>
      <MenuButton
        label={colourName(text, highlight)}
        tip="Colour"
        disabled={disabled}
        className="sv-palette"
      >
        <span
          aria-hidden="true"
          className={cn(
            'grid size-[18px] place-items-center rounded-[4px] text-[13px] leading-none font-bold',
            !tinted && 'border border-current/40',
          )}
          style={{
            ...(colored ? textVar(colored) : {}),
            ...(tinted ? markVar(tinted) : {}),
          }}
        >
          A
        </span>
      </MenuButton>
      <DropdownMenuContent
        align="start"
        className="sv-palette grid w-80 grid-cols-2 gap-x-1"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="min-w-0">
          <DropdownMenuLabel
            id={textLabel}
            className="text-xs font-medium text-muted-foreground"
          >
            Text colour
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-labelledby={textLabel}
            value={text ?? ''}
          >
            <DropdownMenuRadioItem
              value="default"
              onSelect={() => editor.chain().focus().unsetTextColor().run()}
            >
              <TextSwatch />
              Default
            </DropdownMenuRadioItem>
            {TEXT_COLORS.map((c) => (
              <DropdownMenuRadioItem
                key={c.id}
                value={c.id}
                onSelect={() =>
                  editor.chain().focus().setTextColor(c.id).run()
                }
              >
                <TextSwatch color={c.id} />
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
        <div className="min-w-0 border-l pl-1">
          <DropdownMenuLabel
            id={markLabel}
            className="text-xs font-medium text-muted-foreground"
          >
            Highlight
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-labelledby={markLabel}
            value={highlight ?? ''}
          >
            <DropdownMenuRadioItem
              value="default"
              onSelect={() => editor.chain().focus().unsetHighlight().run()}
            >
              <HighlightSwatch />
              None
            </DropdownMenuRadioItem>
            {HIGHLIGHT_COLORS.map((c) => (
              <DropdownMenuRadioItem
                key={c.id}
                value={c.id}
                onSelect={() =>
                  editor.chain().focus().setHighlight(c.id).run()
                }
              >
                <HighlightSwatch color={c.id} />
                {c.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The selection's palette value for a colour mark: the one colour covering
 * all of it, 'default' when none of it has the mark, or null when it mixes
 * colours (or coloured and uncoloured text).
 */
export function markValue<T extends string>(
  editor: Editor,
  name: 'textColor' | 'highlight',
  ids: readonly T[],
): ColorState<T> {
  const one = ids.find((id) => editor.isActive(name, { color: id }));
  if (one) return one;
  const type = editor.schema.marks[name];
  if (!type) return 'default';
  const { empty, from, to, $from } = editor.state.selection;
  const any = empty
    ? !!type.isInSet(editor.state.storedMarks ?? $from.marks())
    : editor.state.doc.rangeHasMark(from, to, type);
  return any ? null : 'default';
}
