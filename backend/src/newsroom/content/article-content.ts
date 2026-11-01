/**
 * Article bodies are stored as TipTap/ProseMirror JSON and NEVER as HTML from
 * the client. Every save passes through `normalizeDoc`, which keeps only the
 * node types, marks and attributes listed here (anything else is refused),
 * and the only HTML ever served is what `renderHtml` builds from that clean
 * document. So no script, style, event handler or arbitrary iframe can reach
 * a reader, whatever the editor (or a forged request) sends.
 *
 * Widget blocks (market data) arrive in Phase 6 as their own node type.
 */

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  marks?: PmMark[];
  text?: string;
}

/** A content problem the writer can act on (→ 400). */
export class ContentError extends Error {}

const LIMITS = {
  jsonBytes: 1_000_000,
  nodes: 20_000,
  depth: 16,
  textChars: 200_000,
};

const BLOCK = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'horizontalRule',
  'image',
  'video',
  'callout',
  'relatedArticle',
  'table',
];
/** What may sit inside list items, callouts, quotes and table cells. */
const FLOW = ['paragraph', 'bulletList', 'orderedList'];

/** Allowed children of each node type ('inline' = text and line breaks). */
const CHILDREN: Record<string, readonly string[] | 'inline' | 'none'> = {
  doc: BLOCK,
  paragraph: 'inline',
  heading: 'inline',
  blockquote: FLOW,
  callout: FLOW,
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: FLOW,
  table: ['tableRow'],
  tableRow: ['tableHeader', 'tableCell'],
  tableHeader: FLOW,
  tableCell: FLOW,
  horizontalRule: 'none',
  image: 'none',
  video: 'none',
  relatedArticle: 'none',
};

/** Containers that must not be empty. */
const NON_EMPTY = new Set([
  'blockquote',
  'callout',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
]);

const MARKS = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
]);

export const CALLOUT_TONES = ['info', 'takeaway', 'warning', 'note'] as const;
export const VIDEO_PROVIDERS = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^\d{6,12}$/,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters other than tab never belong in article text.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface NormalizedDoc {
  doc: PmNode;
  /** Media library images the body shows (must exist and be ready). */
  mediaIds: string[];
  /** Other articles linked as "related" blocks. */
  relatedIds: string[];
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(CONTROL, '').trim().slice(0, max) : '';

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'number' ? Math.round(v) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/**
 * Accepts http(s) URLs, mailto: and site-relative paths. Anything else
 * (javascript:, data:, protocol-relative //host) is dropped.
 */
export function safeHref(raw: unknown): string | null {
  const href = str(raw, 2000);
  if (!href) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function cleanMarks(marks: unknown): PmMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: PmMark[] = [];
  const seen = new Set<string>();
  for (const m of marks as PmMark[]) {
    const type = m?.type;
    if (typeof type !== 'string' || !MARKS.has(type)) {
      throw new ContentError(`Unsupported text formatting: ${String(type)}.`);
    }
    if (seen.has(type)) continue;
    if (type === 'link') {
      const href = safeHref(m.attrs?.href);
      if (!href) continue; // an unsafe link becomes plain text
      out.push({ type, attrs: { href } });
    } else {
      out.push({ type });
    }
    seen.add(type);
  }
  return out.length ? out : undefined;
}

function cleanAttrs(type: string, a: Record<string, unknown> = {}) {
  switch (type) {
    case 'heading':
      return { level: int(a.level, 2, 4, 2) };
    case 'orderedList':
      return { start: int(a.start, 1, 100_000, 1) };
    case 'image': {
      const mediaId = str(a.mediaId, 64);
      if (!UUID.test(mediaId)) {
        throw new ContentError('Pick images from the media library.');
      }
      return {
        mediaId,
        alt: str(a.alt, 300),
        caption: str(a.caption, 500),
        credit: str(a.credit, 200),
      };
    }
    case 'video': {
      const provider = str(a.provider, 20) as keyof typeof VIDEO_PROVIDERS;
      const videoId = str(a.videoId, 40);
      if (
        !(provider in VIDEO_PROVIDERS) ||
        !VIDEO_PROVIDERS[provider].test(videoId)
      ) {
        throw new ContentError('Videos can only come from YouTube or Vimeo.');
      }
      return { provider, videoId, caption: str(a.caption, 500) };
    }
    case 'callout': {
      const tone = str(a.tone, 20);
      return {
        tone: (CALLOUT_TONES as readonly string[]).includes(tone)
          ? tone
          : 'info',
      };
    }
    case 'relatedArticle': {
      const articleId = str(a.articleId, 64);
      if (!UUID.test(articleId)) {
        throw new ContentError(
          'A related-article block is missing its article.',
        );
      }
      return { articleId };
    }
    case 'tableCell':
    case 'tableHeader': {
      const colspan = int(a.colspan, 1, 20, 1);
      const widths = Array.isArray(a.colwidth)
        ? a.colwidth.slice(0, colspan).map((w) => int(w, 0, 2000, 0))
        : null;
      return { colspan, rowspan: int(a.rowspan, 1, 50, 1), colwidth: widths };
    }
    default:
      return undefined;
  }
}

/**
 * Validates a document against the allowlist and returns a clean copy that
 * holds only known nodes, marks and attributes.
 */
export function normalizeDoc(input: unknown): NormalizedDoc {
  if (JSON.stringify(input ?? null).length > LIMITS.jsonBytes) {
    throw new ContentError('The article is too long to save.');
  }
  const mediaIds = new Set<string>();
  const relatedIds = new Set<string>();
  let nodes = 0;
  let chars = 0;

  const walk = (raw: unknown, parent: string, depth: number): PmNode | null => {
    if (depth > LIMITS.depth) {
      throw new ContentError('The article nests too deeply.');
    }
    if (++nodes > LIMITS.nodes) {
      throw new ContentError('The article is too long to save.');
    }
    const node = raw as PmNode;
    const type = node?.type;
    const allowed = CHILDREN[parent];
    if (typeof type !== 'string') {
      throw new ContentError('The article content is malformed.');
    }

    if (allowed === 'inline') {
      if (type === 'hardBreak') return { type };
      if (type !== 'text') {
        throw new ContentError(`"${type}" can't be placed inside text.`);
      }
      const text =
        typeof node.text === 'string' ? node.text.replace(CONTROL, '') : '';
      if (!text) return null; // ProseMirror never stores empty text
      chars += text.length;
      if (chars > LIMITS.textChars) {
        throw new ContentError('The article is too long to save.');
      }
      const marks = cleanMarks(node.marks);
      return marks ? { type, text, marks } : { type, text };
    }

    if (
      !Array.isArray(allowed) ||
      !allowed.includes(type) ||
      !(type in CHILDREN)
    ) {
      throw new ContentError(
        type in CHILDREN
          ? `"${type}" isn't allowed there.`
          : `Unsupported content block: ${type}.`,
      );
    }
    const attrs = cleanAttrs(type, node.attrs);
    if (type === 'image') mediaIds.add(attrs!.mediaId as string);
    if (type === 'relatedArticle') relatedIds.add(attrs!.articleId as string);

    const out: PmNode = attrs ? { type, attrs } : { type };
    if (CHILDREN[type] !== 'none') {
      const kids = (Array.isArray(node.content) ? node.content : [])
        .map((c) => walk(c, type, depth + 1))
        .filter((c): c is PmNode => c !== null);
      if (NON_EMPTY.has(type) && kids.length === 0) {
        throw new ContentError(`An empty ${type} can't be saved.`);
      }
      if (kids.length) out.content = kids;
    }
    return out;
  };

  const root = input as PmNode;
  if (!root || root.type !== 'doc') {
    throw new ContentError('The article content is malformed.');
  }
  const blocks = (Array.isArray(root.content) ? root.content : [])
    .map((c) => walk(c, 'doc', 1))
    .filter((c): c is PmNode => c !== null);
  return {
    doc: {
      type: 'doc',
      content: blocks.length ? blocks : [{ type: 'paragraph' }],
    },
    mediaIds: [...mediaIds],
    relatedIds: [...relatedIds],
  };
}

// ── Rendering ────────────────────────────────────────────────────────────

export interface RenderMedia {
  url: string;
  width: number | null;
  height: number | null;
  /** Smaller copies for srcset: [{ url, width }]. */
  variants: { url: string; width: number }[];
}

export interface RenderContext {
  media: Map<string, RenderMedia>;
  related: Map<string, { title: string; slug: string }>;
  /** Public URL prefix for articles, e.g. "/news". */
  articleBase: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const INTERNAL_HOST = /^https?:\/\/(www\.)?stockvirtue\.com(\/|$)/i;

/** An attribute value as text (non-strings become empty). */
const attr = (v: unknown): string => (typeof v === 'string' ? v : '');

function linkOpen(href: string): string {
  if (
    href.startsWith('/') ||
    href.startsWith('mailto:') ||
    INTERNAL_HOST.test(href)
  ) {
    return `<a href="${escapeHtml(href)}">`;
  }
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">`;
}

const MARK_TAGS: Record<string, [string, string]> = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strike: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
};

function renderText(node: PmNode): string {
  let html = escapeHtml(node.text ?? '');
  // Innermost first, so the first mark ends up outermost.
  for (const mark of [...(node.marks ?? [])].reverse()) {
    if (mark.type === 'link') {
      html = `${linkOpen(attr(mark.attrs?.href))}${html}</a>`;
    } else if (MARK_TAGS[mark.type]) {
      const [open, close] = MARK_TAGS[mark.type];
      html = `${open}${html}${close}`;
    }
  }
  return html;
}

function figcaption(caption: string, credit: string): string {
  if (!caption && !credit) return '';
  const c = caption ? escapeHtml(caption) : '';
  const cr = credit
    ? `<span class="sv-credit">${escapeHtml(credit)}</span>`
    : '';
  return `<figcaption>${c}${c && cr ? ' ' : ''}${cr}</figcaption>`;
}

function renderNode(node: PmNode, ctx: RenderContext): string {
  const kids = () =>
    (node.content ?? []).map((c) => renderNode(c, ctx)).join('');
  const a = node.attrs ?? {};
  switch (node.type) {
    case 'doc':
      return kids();
    case 'text':
      return renderText(node);
    case 'hardBreak':
      return '<br>';
    case 'paragraph':
      return `<p>${kids()}</p>`;
    case 'heading': {
      const level = Number(a.level) || 2;
      return `<h${level}>${kids()}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${kids()}</ul>`;
    case 'orderedList': {
      const start = Number(a.start) || 1;
      return start === 1
        ? `<ol>${kids()}</ol>`
        : `<ol start="${start}">${kids()}</ol>`;
    }
    case 'listItem':
      return `<li>${kids()}</li>`;
    case 'blockquote':
      return `<blockquote>${kids()}</blockquote>`;
    case 'horizontalRule':
      return '<hr>';
    case 'callout':
      return `<aside class="sv-callout sv-callout-${escapeHtml(attr(a.tone))}" role="note">${kids()}</aside>`;
    case 'image': {
      const media = ctx.media.get(attr(a.mediaId));
      if (!media) return '';
      const size =
        media.width && media.height
          ? ` width="${media.width}" height="${media.height}"`
          : '';
      const srcset = media.variants.length
        ? ` srcset="${media.variants
            .map((v) => `${escapeHtml(v.url)} ${v.width}w`)
            .join(
              ', ',
            )}${media.width ? `, ${escapeHtml(media.url)} ${media.width}w` : ''}" sizes="(min-width: 768px) 720px, 100vw"`
        : '';
      return `<figure class="sv-figure"><img src="${escapeHtml(media.url)}" alt="${escapeHtml(attr(a.alt))}"${size}${srcset} loading="lazy" decoding="async">${figcaption(attr(a.caption), attr(a.credit))}</figure>`;
    }
    case 'video': {
      const id = encodeURIComponent(attr(a.videoId));
      const src =
        a.provider === 'vimeo'
          ? `https://player.vimeo.com/video/${id}?dnt=1`
          : `https://www.youtube-nocookie.com/embed/${id}`;
      const title = escapeHtml(attr(a.caption) || 'Video');
      return `<figure class="sv-video"><div class="sv-video-frame"><iframe src="${src}" title="${title}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>${figcaption(attr(a.caption), '')}</figure>`;
    }
    case 'relatedArticle': {
      const rel = ctx.related.get(attr(a.articleId));
      if (!rel) return '';
      return `<aside class="sv-related"><span class="sv-related-label">Related</span><a href="${escapeHtml(`${ctx.articleBase}/${rel.slug}`)}">${escapeHtml(rel.title)}</a></aside>`;
    }
    case 'table':
      return `<div class="sv-table"><table><tbody>${kids()}</tbody></table></div>`;
    case 'tableRow':
      return `<tr>${kids()}</tr>`;
    case 'tableHeader':
    case 'tableCell': {
      const tag = node.type === 'tableHeader' ? 'th' : 'td';
      const colspan =
        Number(a.colspan) > 1 ? ` colspan="${Number(a.colspan)}"` : '';
      const rowspan =
        Number(a.rowspan) > 1 ? ` rowspan="${Number(a.rowspan)}"` : '';
      return `<${tag}${colspan}${rowspan}>${kids()}</${tag}>`;
    }
    default:
      return '';
  }
}

/** HTML for readers, built only from a normalized document. */
export function renderHtml(doc: PmNode, ctx: RenderContext): string {
  return renderNode(doc, ctx);
}

const BLOCK_BREAK = new Set([
  'paragraph',
  'heading',
  'listItem',
  'blockquote',
  'callout',
  'tableRow',
  'image',
  'video',
]);

/** Plain text of a document: search, reading time and version diffs. */
export function plainText(doc: PmNode): string {
  const out: string[] = [];
  const walk = (n: PmNode) => {
    if (n.type === 'text') out.push(n.text ?? '');
    else if (n.type === 'hardBreak') out.push('\n');
    else if (n.type === 'image' || n.type === 'video') {
      const caption = attr(n.attrs?.caption);
      if (caption) out.push(caption);
    } else if (n.type === 'tableHeader' || n.type === 'tableCell') {
      (n.content ?? []).forEach(walk);
      out.push(' ');
      return;
    }
    (n.content ?? []).forEach(walk);
    if (BLOCK_BREAK.has(n.type)) out.push('\n');
  };
  walk(doc);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** About 200 words a minute; never less than one minute. */
export function readingMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
