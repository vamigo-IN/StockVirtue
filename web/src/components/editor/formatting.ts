/**
 * Text colour, highlight and alignment in the story editor.
 *
 * A story stores only these NAMES, never colour values: the API keeps the
 * same lists (backend/src/newsroom/content/article-content.ts TEXT_COLORS,
 * HIGHLIGHT_COLORS, TEXT_ALIGNS) and drops any other value on save.
 * article-prose.css turns a name into a shade for each surface (the white
 * story page and the portal's light mode; the portal's dark editor and
 * preview), and the app does the same for its light and dark themes
 * (mobile/lib/features/news/reader/doc_view.dart). Change a list in all
 * four places at once.
 *
 * Stored shapes:
 * - `{ type: 'textColor', attrs: { color: 'blue' } }` → `<span data-text-color="blue">`
 * - `{ type: 'highlight', attrs: { color: 'yellow' } }` → `<mark data-highlight="yellow">`
 * - a paragraph's or heading's `attrs.textAlign`: 'center' | 'right' |
 *   'justify' → `data-text-align`. Left is the default: no attribute.
 */
export const TEXT_COLORS = [
  { id: 'gray', label: 'Grey' },
  { id: 'green', label: 'Green' },
  { id: 'red', label: 'Red' },
  { id: 'orange', label: 'Orange' },
  { id: 'blue', label: 'Blue' },
  { id: 'purple', label: 'Purple' },
  { id: 'pink', label: 'Pink' },
] as const;
export type TextColor = (typeof TEXT_COLORS)[number]['id'];

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'green', label: 'Green' },
  { id: 'blue', label: 'Blue' },
  { id: 'red', label: 'Red' },
  { id: 'purple', label: 'Purple' },
] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]['id'];

/** Stored alignments; 'left' is the default and is never stored. */
export const TEXT_ALIGNS = ['center', 'right', 'justify'] as const;
export type TextAlignValue = (typeof TEXT_ALIGNS)[number];
export type Alignment = 'left' | TextAlignValue;

export const TEXT_COLOR_IDS: readonly TextColor[] = TEXT_COLORS.map(
  (c) => c.id,
);
export const HIGHLIGHT_IDS: readonly HighlightColor[] = HIGHLIGHT_COLORS.map(
  (c) => c.id,
);

const oneOf = (list: readonly string[], v: unknown) =>
  typeof v === 'string' && list.includes(v);
export const isTextColor = (v: unknown): v is TextColor =>
  oneOf(TEXT_COLOR_IDS, v);
export const isHighlightColor = (v: unknown): v is HighlightColor =>
  oneOf(HIGHLIGHT_IDS, v);
export const isTextAlign = (v: unknown): v is TextAlignValue =>
  oneOf(TEXT_ALIGNS, v);
