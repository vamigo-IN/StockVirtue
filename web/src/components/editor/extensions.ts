import { Mark, mergeAttributes, Node } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { ListItem } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { TextAlign } from '@tiptap/extension-text-align';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { WIDGET_TYPES } from '@/components/widgets/meta';
import {
  type HighlightColor,
  isHighlightColor,
  isTextAlign,
  isTextColor,
  TEXT_ALIGNS,
  type TextColor,
} from './formatting';
import { CalloutView, FigureView, RelatedView, VideoView } from './node-views';
import { WidgetNodeView } from './WidgetNodeView';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textColor: {
      /** Colours the selection (or what is typed next) with a palette colour. */
      setTextColor: (color: TextColor) => ReturnType;
      /** Back to the default text colour. */
      unsetTextColor: () => ReturnType;
    };
    highlight: {
      /** Highlights the selection (or what is typed next) with a palette tint. */
      setHighlight: (color: HighlightColor) => ReturnType;
      /** Removes the highlight. */
      unsetHighlight: () => ReturnType;
    };
  }
}

/**
 * The editor's document model. It matches the server's content allowlist
 * (backend/src/newsroom/content/article-content.ts) node for node; the
 * server re-validates every save, so this is convenience, not security.
 */

/** Media-library image. Pasted images from other sites are not accepted. */
const Figure = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      mediaId: { default: null },
      src: { default: '' },
      alt: { default: '' },
      caption: { default: '' },
      credit: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-sv-image]',
        getAttrs: (el) => ({
          mediaId: el.getAttribute('data-media-id'),
          src: el.querySelector('img')?.getAttribute('src') ?? '',
          alt: el.querySelector('img')?.getAttribute('alt') ?? '',
          caption: el.getAttribute('data-caption') ?? '',
          credit: el.getAttribute('data-credit') ?? '',
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'figure',
      {
        'data-sv-image': '',
        'data-media-id': node.attrs.mediaId as string,
        'data-caption': node.attrs.caption as string,
        'data-credit': node.attrs.credit as string,
      },
      ['img', { src: node.attrs.src as string, alt: node.attrs.alt as string }],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: '(paragraph|bulletList|orderedList)+',
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-tone') ?? 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone as string }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'aside',
      mergeAttributes({ 'data-callout': '' }, HTMLAttributes),
      0,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});

const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      provider: { default: 'youtube' },
      videoId: { default: '' },
      caption: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-sv-video]',
        getAttrs: (el) => ({
          provider: el.getAttribute('data-provider'),
          videoId: el.getAttribute('data-video-id'),
          caption: el.getAttribute('data-caption') ?? '',
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'div',
      {
        'data-sv-video': '',
        'data-provider': node.attrs.provider as string,
        'data-video-id': node.attrs.videoId as string,
        'data-caption': node.attrs.caption as string,
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VideoView);
  },
});

const RelatedArticle = Node.create({
  name: 'relatedArticle',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      articleId: { default: null },
      title: { default: '' },
      slug: { default: '' },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-sv-related]',
        getAttrs: (el) => ({
          articleId: el.getAttribute('data-article-id'),
          title: el.textContent ?? '',
        }),
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'div',
      {
        'data-sv-related': '',
        'data-article-id': node.attrs.articleId as string,
      },
      node.attrs.title as string,
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(RelatedView);
  },
});

/**
 * A market or story widget: settings only (never HTML), drawn live in the
 * editor by the same components readers get. Its HTML form exists for copy
 * and paste inside the editor; the API validates every widget on save.
 */
const MarketWidget = Node.create({
  name: 'marketWidget',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      widget: { default: null },
      v: { default: 1 },
      config: { default: {} },
      widgetId: { default: null },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'div[data-sv-widget-node]',
        getAttrs: (el) => {
          const widget = el.getAttribute('data-widget') ?? '';
          if (!(WIDGET_TYPES as readonly string[]).includes(widget)) {
            return false;
          }
          let config: unknown;
          try {
            config = JSON.parse(el.getAttribute('data-config') ?? '{}');
          } catch {
            return false;
          }
          if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return false;
          }
          return {
            widget,
            v: Number(el.getAttribute('data-v')) || 1,
            config,
            widgetId: el.getAttribute('data-widget-id') || null,
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      'div',
      {
        'data-sv-widget-node': '',
        'data-widget': node.attrs.widget as string,
        'data-v': String(node.attrs.v),
        'data-config': JSON.stringify(node.attrs.config ?? {}),
        ...(node.attrs.widgetId
          ? { 'data-widget-id': node.attrs.widgetId as string }
          : {}),
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(WidgetNodeView);
  },
});

/**
 * Quotes, list items and table cells hold text and lists only, exactly as
 * the server allows; images, videos and tables belong at the top level.
 */
const FLOW = '(paragraph|bulletList|orderedList)+';
const FlowBlockquote = Blockquote.extend({ content: FLOW });
const FlowListItem = ListItem.extend({
  content: 'paragraph (paragraph|bulletList|orderedList)*',
});
const FlowTableCell = TableCell.extend({ content: FLOW });
const FlowTableHeader = TableHeader.extend({ content: FLOW });

/** Links: http(s), mailto and site paths only (the server enforces the same). */
const ALLOWED_LINK = /^(https?:\/\/|mailto:|\/(?!\/))/i;

/**
 * Text colour and highlight: a palette NAME on a mark (formatting.ts), drawn
 * as `<span data-text-color>` / `<mark data-highlight>` and coloured by
 * article-prose.css. They only parse from that same markup, so text pasted
 * from Word, Google Docs or a web page arrives in the default colour: its
 * inline colours (style="color…", background-color, a bare <mark>) match no
 * rule and are dropped. Copy and paste inside the editor keeps them.
 */
const TextColorMark = Mark.create({
  name: 'textColor',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-text-color');
          return isTextColor(v) ? v : null;
        },
        renderHTML: (attrs) =>
          isTextColor(attrs.color) ? { 'data-text-color': attrs.color } : {},
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-text-color]',
        getAttrs: (el) =>
          isTextColor(el.getAttribute('data-text-color')) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          isTextColor(color) && commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

const HighlightMark = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-highlight');
          return isHighlightColor(v) ? v : null;
        },
        renderHTML: (attrs) =>
          isHighlightColor(attrs.color) ? { 'data-highlight': attrs.color } : {},
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'mark[data-highlight]',
        getAttrs: (el) =>
          isHighlightColor(el.getAttribute('data-highlight')) ? null : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      setHighlight:
        (color) =>
        ({ commands }) =>
          isHighlightColor(color) && commands.setMark(this.name, { color }),
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/**
 * Paragraph and heading alignment (Tiptap's TextAlign: setTextAlign,
 * unsetTextAlign, toggleTextAlign; Mod-Shift-L/E/R/J). Centre, right and
 * justify are stored as `attrs.textAlign`; left is the default and is never
 * stored (Mod-Shift-L and the menu's "Align left" unset it). Like the
 * colours, it parses only from the editor's own `data-text-align`, so a
 * pasted Word document's justified or centred paragraphs come in left
 * aligned (house style), while copy and paste inside the editor keeps it.
 */
const StoryTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (el) => {
              const v = el.getAttribute('data-text-align');
              return isTextAlign(v) ? v : null;
            },
            renderHTML: (attrs) =>
              isTextAlign(attrs.textAlign)
                ? { 'data-text-align': attrs.textAlign }
                : {},
          },
        },
      },
    ];
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      'Mod-Shift-l': () => this.editor.commands.unsetTextAlign(),
    };
  },
}).configure({
  types: ['heading', 'paragraph'],
  alignments: [...TEXT_ALIGNS],
  defaultAlignment: null,
});

export function articleExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      codeBlock: false,
      blockquote: false,
      listItem: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => ALLOWED_LINK.test(url),
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null },
      },
    }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading' ? 'Section heading' : 'Write the story…',
    }),
    CharacterCount,
    TableKit.configure({
      table: { resizable: false },
      tableCell: false,
      tableHeader: false,
    }),
    FlowTableCell,
    FlowTableHeader,
    FlowBlockquote,
    FlowListItem,
    TextColorMark,
    HighlightMark,
    StoryTextAlign,
    Figure,
    Callout,
    Video,
    RelatedArticle,
    MarketWidget,
  ];
}
