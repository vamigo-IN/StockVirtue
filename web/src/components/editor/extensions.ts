import { mergeAttributes, Node } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { ListItem } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { WIDGET_TYPES } from '@/components/widgets/meta';
import { CalloutView, FigureView, RelatedView, VideoView } from './node-views';
import { WidgetNodeView } from './WidgetNodeView';

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
    Figure,
    Callout,
    Video,
    RelatedArticle,
    MarketWidget,
  ];
}
