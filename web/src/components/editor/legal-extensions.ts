import { mergeAttributes, Node } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Heading, type HeadingOptions } from '@tiptap/extension-heading';
import { Link } from '@tiptap/extension-link';
import { ListItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Text } from '@tiptap/extension-text';
import { Bold } from '@tiptap/extension-bold';
import { Italic } from '@tiptap/extension-italic';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  CookieSettingsView,
  HeadingView,
  RequestFormView,
  StopView,
  TokenView,
} from '@/components/portal/site-content/legal-node-views';
import { DOC_TOKENS } from '@/content/site/limits';
import type { DocProfile, TokenName } from '@/content/site/types';
import { checkContentHref } from '@/lib/site-content/href';
import { FigureView } from './node-views';

/**
 * The legal profile of the portal's TipTap editor (W7 addendum §4.1, §4.4,
 * §8.4): the document model of the five legal documents and of custom
 * pages, node for node what the API's normaliser accepts
 * (backend/src/site-content/rich/legal-doc.ts). The API re-validates every
 * save, so this is convenience, not security. Stored as TipTap JSON, never
 * HTML; the editor never shows HTML.
 *
 * Also the single-paragraph editor of `inline` fields (`inlineExtensions`).
 */

/* ── Live values, full stops and the two islands ─────────────────────────── */

export interface TokenOptions {
  /** The token names this editor may insert (§4.2's "Allowed in"). */
  allowed: readonly TokenName[];
}

/** A live value (§4.2): `before + value + after`, else `else`; shown as a grey chip. */
export const TokenNode = Node.create<TokenOptions>({
  name: 'token',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '_',
  addOptions() {
    return { allowed: [] };
  },
  addAttributes() {
    const attr = (name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`),
      renderHTML: (a: Record<string, unknown>) => (a[name] ? { [`data-${name}`]: String(a[name]) } : {}),
    });
    return {
      name: {
        default: 'site.name',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-name'),
        renderHTML: (a: Record<string, unknown>) => ({ 'data-name': String(a.name) }),
      },
      before: attr('before'),
      after: attr('after'),
      else: attr('else'),
      as: attr('as'),
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-sv-token]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-sv-token': '' }, HTMLAttributes), `{${String(node.attrs.name)}}`];
  },
  renderText({ node }) {
    return `{${String(node.attrs.name)}}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(TokenView, { as: 'span' });
  },
});

/** "." unless the text just before already ends with "." (withFullStop). */
export const StopNode = Node.create({
  name: 'stop',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  marks: '_',
  parseHTML() {
    return [{ tag: 'span[data-sv-stop]' }];
  },
  renderHTML() {
    return ['span', { 'data-sv-stop': '' }, '.'];
  },
  renderText() {
    return '.';
  },
  addNodeView() {
    return ReactNodeViewRenderer(StopView, { as: 'span' });
  },
});

/** privacy-en only: before + the Cookie settings button + after, while optional services are on. */
export const CookieSettingsNode = Node.create({
  name: 'cookieSettings',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      before: { default: null },
      after: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-sv-cookie-settings]' }];
  },
  renderHTML() {
    return ['span', { 'data-sv-cookie-settings': '' }, 'Cookie settings'];
  },
  renderText({ node }) {
    return `${String(node.attrs.before ?? '')}Cookie settings${String(node.attrs.after ?? '')}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(CookieSettingsView, { as: 'span' });
  },
});

/** requests profile only: the existing request form, exactly once (its ids and texts are code). */
export const RequestFormNode = Node.create({
  name: 'requestForm',
  group: 'block',
  atom: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-sv-request-form]' }];
  },
  renderHTML() {
    return ['div', { 'data-sv-request-form': '' }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RequestFormView);
  },
});

/** simple profile only: a media-library image (the media id is stored, never a URL). */
const LegalImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      alt: { default: '' },
      caption: { default: '' },
      credit: { default: '' },
      /** Display only: the API resolves the URL when it serves the page; stripped on save. */
      src: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'figure[data-sv-image]' }];
  },
  renderHTML({ node }) {
    return ['figure', { 'data-sv-image': '', 'data-media-id': String(node.attrs.mediaId ?? '') }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

/* ── Blocks ──────────────────────────────────────────────────────────────── */

/** `variant: 'note'`: the small muted style of the terms' template note. */
const LegalParagraph = Paragraph.extend({
  addAttributes() {
    return {
      variant: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-variant'),
        renderHTML: (a: Record<string, unknown>) =>
          a.variant === 'note' ? { 'data-variant': 'note', class: 'text-sm text-muted-foreground' } : {},
      },
    };
  },
});

export interface LegalHeadingOptions extends HeadingOptions {
  /** The anchors the profile requires and nobody may rename (`cookies`). */
  lockedAnchors: readonly string[];
}

/**
 * H2 and H3 with a stored `anchor` (the id the site renders and deep links
 * use). Text and live values only: no marks, no links (§4.1).
 */
const LegalHeading = Heading.extend<LegalHeadingOptions>({
  content: '(text|token)*',
  marks: '',
  addOptions() {
    return { ...(this.parent?.() as HeadingOptions), lockedAnchors: [] };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      anchor: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-anchor') || el.getAttribute('id'),
        renderHTML: (a: Record<string, unknown>) => (a.anchor ? { 'data-anchor': String(a.anchor) } : {}),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(HeadingView);
  },
});

/** A table with a caption (it names the region for screen readers; LegalTable renders it). */
const LegalTable = Table.extend({
  addAttributes() {
    return {
      caption: {
        default: '',
        parseHTML: (el: HTMLElement) => el.querySelector('caption')?.textContent ?? '',
        renderHTML: () => ({}),
      },
    };
  },
  renderHTML({ node, HTMLAttributes }) {
    const caption = String(node.attrs.caption ?? '').trim();
    return [
      'table',
      mergeAttributes(HTMLAttributes, { class: 'sv-legal-table' }),
      [
        'caption',
        {
          contenteditable: 'false',
          class: caption
            ? 'caption-top pb-1 text-left text-xs font-medium text-muted-foreground'
            : 'caption-top pb-1 text-left text-xs font-medium text-destructive',
        },
        caption ? `Table: ${caption}` : 'Table: no caption yet (Table caption in the toolbar)',
      ],
      ['tbody', 0],
    ];
  },
});

/** Header cells: one paragraph of plain text. Body cells: paragraphs. */
const LegalTableHeader = TableHeader.extend({ content: 'paragraph' });
const LegalTableCell = TableCell.extend({ content: 'paragraph+' });
/** List items hold paragraphs and lists. */
const LegalListItem = ListItem.extend({ content: 'paragraph (paragraph|bulletList|orderedList)*' });

/** Links by the site-content href rule (§3.1), with a `lang` attribute. */
const LegalLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      lang: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('lang'),
        renderHTML: (a: Record<string, unknown>) => (a.lang ? { lang: String(a.lang) } : {}),
      },
    };
  },
}).configure({
  openOnClick: false,
  autolink: false,
  linkOnPaste: false,
  isAllowedUri: (url) => !!checkContentHref(url),
  HTMLAttributes: { rel: null, target: null, class: null },
});

/** Whether a profile requires the `#cookies` anchor (the two privacy notices). */
export const profileHasCookiesAnchor = (p: DocProfile) => p === 'privacy-en' || p === 'privacy-hi';

/** The editor for a legal document or a custom page body. */
export function legalExtensions(profile: DocProfile) {
  const tokens = DOC_TOKENS[profile] ?? [];
  return [
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
      link: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      strike: false,
      underline: false,
    }),
    Document,
    LegalParagraph,
    LegalHeading.configure({
      levels: [2, 3],
      lockedAnchors: profileHasCookiesAnchor(profile) ? ['cookies'] : [],
    }),
    LegalListItem,
    LegalLink,
    Placeholder.configure({
      placeholder: ({ node }) => (node.type.name === 'heading' ? 'Section heading' : 'Write the page…'),
    }),
    LegalTable.configure({ resizable: false, View: null }),
    TableRow,
    LegalTableHeader,
    LegalTableCell,
    TokenNode.configure({ allowed: tokens }),
    StopNode,
    ...(profile === 'privacy-en' ? [CookieSettingsNode] : []),
    ...(profile === 'requests' ? [RequestFormNode] : []),
    ...(profile === 'simple' ? [LegalImage] : []),
  ];
}

/**
 * One paragraph of rich text: an `inline` field (§3.1). `marks: false` is the
 * legal head's "text and tokens only" (SEO description, summary).
 */
export function inlineExtensions(o: { marks: boolean; tokens: readonly TokenName[]; placeholder?: string }) {
  return [
    Document.extend({ content: 'paragraph' }),
    Paragraph,
    Text,
    UndoRedo,
    ...(o.marks ? [Bold, Italic, LegalLink] : []),
    ...(o.tokens.length ? [TokenNode.configure({ allowed: o.tokens })] : []),
    ...(o.placeholder ? [Placeholder.configure({ placeholder: o.placeholder })] : []),
  ];
}

/* ── Saving: only the attributes the API stores ──────────────────────────── */

type J = { type?: string; attrs?: Record<string, unknown>; content?: J[]; marks?: J[]; text?: string };

const KEEP: Record<string, readonly string[]> = {
  paragraph: ['variant'],
  heading: ['level', 'anchor'],
  orderedList: ['start'],
  table: ['caption'],
  image: ['mediaId', 'alt', 'caption', 'credit'],
  token: ['name', 'before', 'after', 'else', 'as'],
  cookieSettings: ['before', 'after'],
  link: ['href', 'lang'],
};

function cleanAttrs(type: string, attrs: Record<string, unknown> | undefined) {
  const keep = KEEP[type];
  if (!keep || !attrs) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keep) {
    const v = attrs[k];
    if (v === null || v === undefined || v === '') continue;
    if (type === 'orderedList' && k === 'start' && v === 1) continue;
    out[k] = typeof v === 'string' && k !== 'before' && k !== 'after' && k !== 'else' ? v.trim() : v;
  }
  return Object.keys(out).length ? out : undefined;
}

function clean(n: J): J {
  const out: J = { type: n.type };
  if (n.type === 'text') out.text = n.text ?? '';
  const attrs = cleanAttrs(String(n.type), n.attrs);
  if (attrs) out.attrs = attrs;
  if (n.type === 'table') out.attrs = { caption: String(n.attrs?.caption ?? '').trim() };
  if (n.marks?.length) {
    out.marks = n.marks.map((m) => {
      const mm: J = { type: m.type };
      const a = cleanAttrs(String(m.type), m.attrs);
      if (a) mm.attrs = a;
      return mm;
    });
  }
  if (n.content) out.content = n.content.map(clean);
  return out;
}

/** The editor's JSON as the API stores it: unknown and empty attributes dropped. */
export function toStoredDoc(json: unknown): { type: 'doc'; content: unknown[] } {
  const doc = clean((json ?? { type: 'doc' }) as J);
  return { type: 'doc', content: (doc.content ?? []) as unknown[] };
}

/** A paragraph's content, cleaned (inline fields). */
export function toStoredInline(json: unknown): unknown[] {
  const doc = clean((json ?? { type: 'doc' }) as J);
  const para = doc.content?.[0];
  return (para?.content ?? []) as unknown[];
}
