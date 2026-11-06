import type { TokenName } from '../live-values';

/**
 * Stored shapes of rich text (W7 addendum §3.1, §4.1), the same as
 * web/src/content/site/types.ts: TipTap/ProseMirror JSON, never HTML.
 * Unset attributes are omitted here (TipTap sends them as null; the
 * normalisers drop nulls).
 */

export type MarkName = 'bold' | 'italic' | 'code' | 'link';

export type LinkMark = { type: 'link'; attrs: { href: string; lang?: 'en' | 'hi' } };
export type Mark = { type: 'bold' } | { type: 'italic' } | { type: 'code' } | LinkMark;

export type TokenAttrs = {
  name: TokenName;
  before?: string;
  after?: string;
  else?: string;
  as?: 'text' | 'mailto';
};

export type TextNode = { type: 'text'; text: string; marks?: Mark[] };
export type TokenNode = { type: 'token'; attrs: TokenAttrs; marks?: Mark[] };
export type StopNode = { type: 'stop'; marks?: Mark[] };
export type HardBreakNode = { type: 'hardBreak' };
export type CookieSettingsNode = {
  type: 'cookieSettings';
  attrs?: { before?: string; after?: string };
};
export type InlineNode =
  | TextNode
  | TokenNode
  | StopNode
  | HardBreakNode
  | CookieSettingsNode;

export type ParagraphNode = {
  type: 'paragraph';
  attrs?: { variant?: 'note' };
  content?: InlineNode[];
};
export type HeadingNode = {
  type: 'heading';
  attrs: { level: 2 | 3; anchor?: string };
  content: (TextNode | TokenNode)[];
};
export type ListItemNode = { type: 'listItem'; content: (ParagraphNode | ListNode)[] };
export type ListNode =
  | { type: 'bulletList'; content: ListItemNode[] }
  | { type: 'orderedList'; attrs?: { start?: number }; content: ListItemNode[] };
export type TableCellNode = { type: 'tableHeader' | 'tableCell'; content: ParagraphNode[] };
export type TableRowNode = { type: 'tableRow'; content: TableCellNode[] };
export type TableNode = { type: 'table'; attrs: { caption: string }; content: TableRowNode[] };
export type ImageNode = {
  type: 'image';
  attrs: { mediaId: string; alt: string; caption?: string; credit?: string };
};
export type RequestFormNode = { type: 'requestForm' };

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | ListNode
  | TableNode
  | ImageNode
  | RequestFormNode;

export type SiteDoc = { type: 'doc'; content: BlockNode[] };
