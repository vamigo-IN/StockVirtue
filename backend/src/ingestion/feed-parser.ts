import { XMLParser } from 'fast-xml-parser';

/** One item as the source delivered it, before clean-up. */
export interface RawItem {
  id: string | null;
  title: string;
  url: string | null;
  publishedAt: string | null;
  /** HTML or text, as the source sent it. */
  summary: string | null;
  content: string | null;
  /** The item's picture, as the source gave its address. */
  image: string | null;
  author: string | null;
  categories: string[];
}

export interface ParsedFeed {
  kind: 'rss' | 'atom' | 'rdf' | 'json';
  title: string | null;
  items: RawItem[];
}

/** The response isn't a usable feed. Messages are safe to show staff. */
export class FeedParseError extends Error {}

/** Items read from one fetch; feeds list newest first, so older ones wait. */
export const MAX_FEED_ITEMS = 100;

export const JSON_FIELDS = [
  'title',
  'url',
  'id',
  'publishedAt',
  'summary',
  'content',
  'image',
  'author',
  'categories',
] as const;
export type JsonField = (typeof JSON_FIELDS)[number];

/** Where a JSON API keeps its items and their fields (dot paths). */
export interface JsonMapping {
  itemsPath: string;
  fields: Partial<Record<JsonField, string>>;
}

const ARRAYS = new Set(['item', 'entry', 'link', 'category', 'dc:subject']);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ARRAYS.has(name),
});

// Entity declarations are never needed in a news feed and are how XML
// "billion laughs" attacks work, so the whole DOCTYPE goes before parsing.
const DOCTYPE = /<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>/gi;

type Node = Record<string, unknown>;

function text(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text((v as Node)['#text']);
  return null;
}

/** All text under a node, for XHTML content parsed into elements. */
function deepText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'object') return text(v);
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (n == null) return;
    if (typeof n === 'string' || typeof n === 'number') {
      parts.push(String(n));
    } else if (Array.isArray(n)) {
      n.forEach(walk);
    } else if (typeof n === 'object') {
      for (const [k, child] of Object.entries(n as Node)) {
        if (!k.startsWith('@_')) walk(child);
      }
    }
  };
  walk(v);
  return parts.length ? parts.join(' ') : null;
}

function list(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function categories(v: unknown): string[] {
  return list(v)
    .map((c) =>
      typeof c === 'object' && c !== null
        ? (text((c as Node)['@_term']) ??
          text((c as Node)['@_label']) ??
          text(c))
        : text(c),
    )
    .filter((c): c is string => !!c && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 12);
}

const IMAGE_FILE = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#]|$)/i;

/**
 * The address on a media:content, enclosure or Atom link element when it is
 * a picture (by medium, type or, failing both, file name). media:thumbnail is
 * always one (`typed` false).
 */
function imageAt(v: unknown, typed: boolean): string | null {
  if (typeof v !== 'object' || v === null) return null;
  const el = v as Node;
  const url = (text(el['@_url']) ?? text(el['@_href']))?.trim();
  if (!url) return null;
  if (!typed) return url;
  const medium = text(el['@_medium'])?.trim().toLowerCase();
  const type = text(el['@_type'])?.trim().toLowerCase();
  if (medium === 'image' || type?.startsWith('image/')) return url;
  return !medium && !type && IMAGE_FILE.test(url) ? url : null;
}

/** The first <img src> in HTML: a string, or XHTML the parser made into nodes. */
function firstImg(v: unknown, depth = 0): string | null {
  if (v == null || depth > 12) return null;
  if (typeof v === 'string') {
    return (
      /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(v)?.[1]?.trim() || null
    );
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const url = firstImg(x, depth + 1);
      if (url) return url;
    }
    return null;
  }
  if (typeof v !== 'object') return null;
  for (const [k, child] of Object.entries(v as Node)) {
    if (k === 'img') {
      for (const i of list(child)) {
        const src = typeof i === 'object' ? text((i as Node)?.['@_src']) : null;
        if (src?.trim()) return src.trim();
      }
    } else if (!k.startsWith('@_')) {
      const url = firstImg(child, depth + 1);
      if (url) return url;
    }
  }
  return null;
}

/**
 * An item's picture: Media RSS (media:content, then media:thumbnail, also
 * inside media:group), an image enclosure (RSS) or enclosure link (Atom),
 * else the first image in its HTML.
 */
function itemImage(item: Node, html: unknown[]): string | null {
  const holders = [
    item,
    ...list(item['media:group']).filter(
      (g): g is Node => typeof g === 'object' && g !== null,
    ),
  ];
  for (const h of holders) {
    for (const c of list(h['media:content'])) {
      const url = imageAt(c, true);
      if (url) return url;
    }
  }
  for (const h of holders) {
    for (const t of list(h['media:thumbnail'])) {
      const url = imageAt(t, false);
      if (url) return url;
    }
  }
  for (const e of list(item.enclosure)) {
    const url = imageAt(e, true);
    if (url) return url;
  }
  for (const l of list(item.link)) {
    if (typeof l === 'object' && text((l as Node)?.['@_rel']) === 'enclosure') {
      const url = imageAt(l, true);
      if (url) return url;
    }
  }
  for (const h of html) {
    const url = firstImg(h);
    if (url) return url;
  }
  return null;
}

/** RSS <link> is text; some feeds use atom:link elements instead. */
function rssLink(item: Node): string | null {
  for (const l of list(item.link)) {
    const href =
      typeof l === 'object' && l !== null
        ? (text((l as Node)['@_href']) ?? text(l))
        : text(l);
    if (href?.trim()) return href.trim();
  }
  for (const l of list(item['atom:link'])) {
    const href = text((l as Node)?.['@_href']);
    if (href?.trim()) return href.trim();
  }
  const guid = item.guid as Node | string | undefined;
  const permalink =
    typeof guid === 'object' && guid !== null
      ? text(guid['@_isPermaLink']) !== 'false'
      : true;
  const g = text(guid);
  return permalink && g && /^https?:\/\//i.test(g) ? g : null;
}

function atomLink(entry: Node): string | null {
  const links = list(entry.link).filter(
    (l): l is Node => typeof l === 'object' && l !== null,
  );
  const pick =
    links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
  return text(pick?.['@_href'])?.trim() || null;
}

function rssItem(item: Node): RawItem | null {
  const title = deepText(item.title)?.trim();
  if (!title) return null;
  return {
    id: text(item.guid)?.trim() || null,
    title,
    url: rssLink(item),
    publishedAt:
      text(item.pubDate) ??
      text(item['dc:date']) ??
      text(item.published) ??
      text(item.updated),
    summary: deepText(item.description),
    content: deepText(item['content:encoded']),
    image: itemImage(item, [item['content:encoded'], item.description]),
    author: text(item['dc:creator']) ?? text(item.author),
    categories: categories([
      ...list(item.category),
      ...list(item['dc:subject']),
    ]),
  };
}

function atomEntry(entry: Node): RawItem | null {
  const title = deepText(entry.title)?.trim();
  if (!title) return null;
  const author = list(entry.author)[0] as Node | undefined;
  return {
    id: text(entry.id)?.trim() || null,
    title,
    url: atomLink(entry),
    publishedAt: text(entry.published) ?? text(entry.updated),
    summary: deepText(entry.summary),
    content: deepText(entry.content),
    image: itemImage(entry, [entry.content, entry.summary]),
    author: author ? text(author.name) : null,
    categories: categories(entry.category),
  };
}

/** RSS 2.0, Atom or RSS 1.0 (RDF), detected from the document. */
export function parseFeed(body: string): ParsedFeed {
  const xml = body
    .replace(/^\uFEFF/, '')
    .replace(DOCTYPE, '')
    .trim();
  if (/^<html[\s>]/i.test(xml)) {
    throw new FeedParseError(
      'This address returned a web page, not a feed. Look on the page for its RSS link.',
    );
  }
  if (!xml.startsWith('<')) {
    throw new FeedParseError(
      'This address didn’t return a feed (RSS or Atom).',
    );
  }
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new FeedParseError('The feed isn’t valid XML.');
  }
  const take = (raw: unknown[], read: (n: Node) => RawItem | null) =>
    raw
      .slice(0, MAX_FEED_ITEMS)
      .map((n) =>
        typeof n === 'object' && n !== null ? read(n as Node) : null,
      )
      .filter((i): i is RawItem => i !== null);

  if (doc.rss && typeof doc.rss === 'object') {
    const channel = list((doc.rss as Node).channel)[0] as Node | undefined;
    return {
      kind: 'rss',
      title: deepText(channel?.title)?.trim() || null,
      items: take(list(channel?.item), rssItem),
    };
  }
  if (doc.feed && typeof doc.feed === 'object') {
    const feed = doc.feed as Node;
    return {
      kind: 'atom',
      title: deepText(feed.title)?.trim() || null,
      items: take(list(feed.entry), atomEntry),
    };
  }
  const rdf = (doc['rdf:RDF'] ?? doc.RDF) as Node | undefined;
  if (rdf && typeof rdf === 'object') {
    const channel = list(rdf.channel)[0] as Node | undefined;
    return {
      kind: 'rdf',
      title: deepText(channel?.title)?.trim() || null,
      items: take(list(rdf.item), rssItem),
    };
  }
  if (doc.html) {
    throw new FeedParseError(
      'This address returned a web page, not a feed. Look on the page for its RSS link.',
    );
  }
  throw new FeedParseError(
    'This address returned XML, but not an RSS or Atom feed.',
  );
}

/** "data.items" / "results.0.title" → the value there, or undefined. */
export function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.').filter(Boolean)) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Node)[key];
  }
  return cur;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** ISO strings stay as sent; epoch numbers (seconds or ms) become ISO. */
function when(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  return str(v);
}

const DEFAULT_PATHS: Record<JsonField, string> = {
  title: 'title',
  url: 'url',
  id: 'id',
  publishedAt: 'publishedAt',
  summary: 'summary',
  content: 'content',
  image: 'image',
  author: 'author',
  categories: 'categories',
};

/** A licensed news API's JSON, read through the source's field mapping. */
export function parseJsonApi(body: string, mapping: JsonMapping): ParsedFeed {
  let data: unknown;
  try {
    data = JSON.parse(body.replace(/^\uFEFF/, ''));
  } catch {
    throw new FeedParseError('The API didn’t return JSON.');
  }
  const items = mapping.itemsPath ? pick(data, mapping.itemsPath) : data;
  if (!Array.isArray(items)) {
    throw new FeedParseError(
      `There’s no list of items at “${mapping.itemsPath || 'the top level'}”. Check the items path.`,
    );
  }
  const path = (f: JsonField) => mapping.fields[f] || DEFAULT_PATHS[f];
  const out: RawItem[] = [];
  for (const it of items.slice(0, MAX_FEED_ITEMS)) {
    const title = str(pick(it, path('title')));
    if (!title) continue;
    const cats = pick(it, path('categories'));
    out.push({
      id: str(pick(it, path('id'))),
      title,
      url: str(pick(it, path('url'))),
      publishedAt: when(pick(it, path('publishedAt'))),
      summary: str(pick(it, path('summary'))),
      content: str(pick(it, path('content'))),
      image: str(pick(it, path('image'))),
      author: str(pick(it, path('author'))),
      categories: Array.isArray(cats)
        ? cats
            .map(str)
            .filter((c): c is string => !!c)
            .slice(0, 12)
        : [],
    });
  }
  if (items.length > 0 && out.length === 0) {
    throw new FeedParseError(
      `None of the items has a title at “${path('title')}”. Check the field mapping.`,
    );
  }
  return { kind: 'json', title: null, items: out };
}
