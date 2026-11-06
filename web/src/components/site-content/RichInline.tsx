import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type { DocInlineNode, LiveValues } from '@/content/site/types';
import {
  checkContentHref,
  isFilePath,
  isStockPath,
  type ContentHref,
} from '@/lib/site-content/href';
import { tokenValue } from '@/lib/site-content/tokens';

/**
 * Inline rich text from site content (TipTap JSON, W7 addendum §3.1, §4.1)
 * as React elements. Never an HTML string: text goes through React's
 * escaping, and only the nodes and marks below produce elements.
 *
 * - `text`: marks `bold` → <strong>, `italic` → <em>, `code` → <code>,
 *   `link` → a link when its href passes the site-content href rule, else
 *   plain text. Site paths render with next/link (stock pages with
 *   prefetch={false}; files such as /news/feed.xml as a plain <a>), mailto:
 *   as <a>, other sites as <a rel="noopener noreferrer"> in the same tab.
 *   A link's `lang` goes on the element. Consecutive runs with the same link
 *   become one link element; consecutive runs with the same marks are joined.
 * - `token`: `before + value + after` when its value is non-empty, else
 *   `else` (or nothing); `as: 'mailto'` makes the value a mailto: link.
 *   Values come from `values` (designed pages: resolveLiveValues(settings);
 *   legal documents: the revision's liveValues); without them only the four
 *   SITE tokens (site.name, site.url, site.company, site.email) resolve.
 * - `stop`: withFullStop on the text so far: its trailing whitespace is
 *   dropped, then "." is added unless it already ends with "." ("Ltd." stays
 *   "Ltd.", "Mumbai " becomes "Mumbai.").
 * - `hardBreak`: <br />.
 * - `cookieSettings` (the privacy notice only): `before` + the
 *   `cookieSettings` element you pass + `after`; nothing when you pass none.
 * - any other node renders nothing; unknown marks are ignored.
 *
 * Renders a fragment (no wrapper): put it in the element the slot needs.
 *   <p className="t-body"><RichInline value={content.writeToUs.text} /></p>
 *
 * Server-safe (no hooks, no 'use client'); next/link is its only client
 * piece. Don't use it in the root 404's tree (src/app/not-found.tsx imports
 * no client module).
 */

type LinkInfo = ContentHref & { lang?: 'en' | 'hi' };
type Marks = { bold: boolean; italic: boolean; code: boolean; link: LinkInfo | null };
type Segment =
  | { t: 'text'; text: string; m: Marks }
  | { t: 'br' }
  | { t: 'node'; node: ReactNode };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const NO_MARKS: Marks = { bold: false, italic: false, code: false, link: null };

function readMarks(raw: unknown): Marks {
  if (!Array.isArray(raw)) return NO_MARKS;
  const m: Marks = { ...NO_MARKS };
  for (const mark of raw) {
    if (!isRec(mark)) continue;
    if (mark.type === 'bold') m.bold = true;
    else if (mark.type === 'italic') m.italic = true;
    else if (mark.type === 'code') m.code = true;
    else if (mark.type === 'link' && !m.link) {
      const attrs = isRec(mark.attrs) ? mark.attrs : {};
      const checked = checkContentHref(attrs.href);
      if (checked) {
        m.link = attrs.lang === 'en' || attrs.lang === 'hi' ? { ...checked, lang: attrs.lang } : checked;
      }
    }
  }
  return m;
}

const sameLink = (a: LinkInfo | null, b: LinkInfo | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.href === b.href && a.lang === b.lang);

const sameMarks = (a: Marks, b: Marks) =>
  a.bold === b.bold && a.italic === b.italic && a.code === b.code && sameLink(a.link, b.link);

/** The inline content as a flat list of runs, with tokens and stops resolved. */
function flatten(
  value: readonly unknown[] | null | undefined,
  values: LiveValues | null | undefined,
  cookieSettings: ReactNode,
): Segment[] {
  const out: Segment[] = [];
  if (!Array.isArray(value)) return out;
  const push = (text: string, m: Marks) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last?.t === 'text' && sameMarks(last.m, m)) last.text += text;
    else out.push({ t: 'text', text, m });
  };
  /** The text rendered so far (a hard break as "\n"). */
  const textSoFar = () => out.map((s) => (s.t === 'text' ? s.text : s.t === 'br' ? '\n' : '')).join('');
  /** withFullStop (src/lib/text.ts) on the text so far: its trailing whitespace goes, then "." unless it already ends with one. */
  const fullStop = (m: Marks) => {
    for (let k = out.length - 1; k >= 0; k -= 1) {
      const s = out[k];
      if (s.t !== 'text') break;
      const trimmed = s.text.trimEnd();
      if (trimmed) {
        s.text = trimmed;
        break;
      }
      out.splice(k, 1);
    }
    if (!textSoFar().trimEnd().endsWith('.')) push('.', m);
  };

  for (const node of value) {
    if (!isRec(node)) continue;
    switch (node.type) {
      case 'text':
        push(str(node.text), readMarks(node.marks));
        break;
      case 'token': {
        const attrs = isRec(node.attrs) ? node.attrs : {};
        const m = readMarks(node.marks);
        const v = tokenValue(values, attrs.name);
        if (!v) {
          push(str(attrs.else), m);
          break;
        }
        push(str(attrs.before), m);
        const mail = attrs.as === 'mailto' ? checkContentHref(`mailto:${v}`) : null;
        push(v, mail ? { ...m, link: mail } : m);
        push(str(attrs.after), m);
        break;
      }
      case 'stop':
        fullStop(readMarks(node.marks));
        break;
      case 'hardBreak':
        out.push({ t: 'br' });
        break;
      case 'cookieSettings': {
        if (cookieSettings === undefined || cookieSettings === null || cookieSettings === false) break;
        const attrs = isRec(node.attrs) ? node.attrs : {};
        push(str(attrs.before), NO_MARKS);
        out.push({ t: 'node', node: cookieSettings });
        push(str(attrs.after), NO_MARKS);
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** One run with its marks: <strong><em><code>text</code></em></strong>. */
function run(text: string, m: Marks, key: number): ReactNode {
  let el: ReactNode = text;
  if (m.code) el = <code>{el}</code>;
  if (m.italic) el = <em>{el}</em>;
  if (m.bold) el = <strong>{el}</strong>;
  return <Fragment key={key}>{el}</Fragment>;
}

function LinkElement({
  link,
  className,
  children,
}: {
  link: LinkInfo;
  className?: string;
  children: ReactNode;
}) {
  const { kind, href, lang } = link;
  if (kind === 'path' && !isFilePath(href)) {
    return (
      <Link
        href={href}
        className={className}
        lang={lang}
        prefetch={isStockPath(href) ? false : undefined}
      >
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className={className}
      lang={lang}
      rel={kind === 'external' ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}

function render(segments: Segment[], linkClassName?: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < segments.length) {
    const s = segments[i];
    if (s.t === 'br') {
      out.push(<br key={i} />);
      i += 1;
    } else if (s.t === 'node') {
      out.push(<Fragment key={i}>{s.node}</Fragment>);
      i += 1;
    } else if (!s.m.link) {
      out.push(run(s.text, s.m, i));
      i += 1;
    } else {
      const link = s.m.link;
      const runs: ReactNode[] = [];
      let j = i;
      for (; j < segments.length; j += 1) {
        const r = segments[j];
        if (r.t !== 'text' || !sameLink(r.m.link, link)) break;
        runs.push(run(r.text, r.m, j));
      }
      out.push(
        <LinkElement key={i} link={link} className={linkClassName}>
          {runs}
        </LinkElement>,
      );
      i = j;
    }
  }
  return out;
}

export function RichInline({
  value,
  values,
  linkClassName,
  cookieSettings,
}: {
  /** An `inline` field, a `PlainInline`, or a paragraph's content in a document. */
  value: readonly DocInlineNode[] | null | undefined;
  /** Token values: resolveLiveValues(settings), or a revision's liveValues. */
  values?: LiveValues | null;
  /** A class for every link (e.g. "inline-link"). */
  linkClassName?: string;
  /** The Cookie settings button, for a `cookieSettings` node (the privacy notice). */
  cookieSettings?: ReactNode;
}) {
  const segments = flatten(value, values, cookieSettings);
  return segments.length === 0 ? null : <>{render(segments, linkClassName)}</>;
}

/**
 * The plain text RichInline shows (tokens and stops resolved, links as their
 * text, a hard break as "\n"), for metadata, JSON-LD (visible text = schema
 * text) and lengths.
 */
export function inlineText(
  value: readonly DocInlineNode[] | null | undefined,
  values?: LiveValues | null,
): string {
  return flatten(value, values, null)
    .map((s) => (s.t === 'text' ? s.text : s.t === 'br' ? '\n' : ''))
    .join('');
}
