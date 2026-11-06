import { tokenLabel } from '@/portal/site-content';

/**
 * Plain text out of site content (W7 addendum §8.6, §5.1): what the history
 * compares, what the small-fix meter counts and what the copy lint reads.
 * Pure functions over the stored JSON; nothing here renders HTML.
 */

type J = { type?: string; text?: string; attrs?: Record<string, unknown>; content?: J[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * A token as text: its value when `values` are given (the page as readers
 * saw it), else a placeholder such as "{Officer name}".
 */
function tokenText(attrs: Record<string, unknown> | undefined, values?: Record<string, string> | null): string {
  const name = String(attrs?.name ?? '');
  if (!values) return `{${tokenLabel(name)}}`;
  const v = values[name];
  if (v) return `${String(attrs?.before ?? '')}${v}${String(attrs?.after ?? '')}`;
  return String(attrs?.else ?? '');
}

/** One paragraph's inline content as text. */
export function inlineText(nodes: unknown, values?: Record<string, string> | null): string {
  if (!Array.isArray(nodes)) return typeof nodes === 'string' ? nodes : '';
  let out = '';
  for (const n of nodes as J[]) {
    switch (n?.type) {
      case 'text':
        out += n.text ?? '';
        break;
      case 'token':
        out += tokenText(n.attrs, values);
        break;
      case 'stop':
        if (!out.trimEnd().endsWith('.')) out += '.';
        break;
      case 'hardBreak':
        out += '\n';
        break;
      case 'cookieSettings':
        out += `${String(n.attrs?.before ?? '')}Cookie settings${String(n.attrs?.after ?? '')}`;
        break;
      default:
        break;
    }
  }
  return out;
}

export type DocBlockKind = 'h2' | 'h3' | 'p' | 'note' | 'li' | 'caption' | 'row' | 'form' | 'image';

export interface DocBlock {
  kind: DocBlockKind;
  text: string;
  /** Headings: the stored link name. */
  anchor?: string;
  /** Where it sits, for links from the lint panel: "body.content[3]". */
  path: string;
}

function paragraphs(n: J): string {
  return (n.content ?? [])
    .map((c) => (c.type === 'paragraph' ? inlineText(c.content) : ''))
    .filter(Boolean)
    .join(' ');
}

/** The document as a flat list of blocks: headings, paragraphs, list items, table rows. */
export function docBlocks(doc: unknown, values?: Record<string, string> | null, base = 'body'): DocBlock[] {
  const out: DocBlock[] = [];
  const top = isObj(doc) && Array.isArray(doc.content) ? (doc.content as J[]) : [];
  const walkList = (list: J, path: string) => {
    (list.content ?? []).forEach((li, i) => {
      const p = `${path}.content[${i}]`;
      const own = (li.content ?? []).filter((c) => c.type === 'paragraph');
      out.push({ kind: 'li', text: own.map((c) => inlineText(c.content, values)).join(' '), path: p });
      (li.content ?? []).forEach((c, j) => {
        if (c.type === 'bulletList' || c.type === 'orderedList') walkList(c, `${p}.content[${j}]`);
      });
    });
  };
  top.forEach((n, i) => {
    const path = `${base}.content[${i}]`;
    switch (n.type) {
      case 'heading': {
        const level = Number(n.attrs?.level) === 3 ? 'h3' : 'h2';
        out.push({ kind: level, text: inlineText(n.content, values), anchor: String(n.attrs?.anchor ?? '') || undefined, path });
        break;
      }
      case 'paragraph':
        out.push({ kind: n.attrs?.variant === 'note' ? 'note' : 'p', text: inlineText(n.content, values), path });
        break;
      case 'bulletList':
      case 'orderedList':
        walkList(n, path);
        break;
      case 'table': {
        out.push({ kind: 'caption', text: String(n.attrs?.caption ?? ''), path });
        (n.content ?? []).forEach((row, r) => {
          const cells = (row.content ?? []).map((cell) =>
            (cell.content ?? []).map((c) => inlineText(c.content, values)).join(' '),
          );
          out.push({ kind: 'row', text: cells.join(' | '), path: `${path}.content[${r}]` });
        });
        break;
      }
      case 'requestForm':
        out.push({ kind: 'form', text: '[Privacy request form]', path });
        break;
      case 'image':
        out.push({ kind: 'image', text: `[Image: ${String(n.attrs?.alt ?? '')}]`, path });
        break;
      default:
        break;
    }
  });
  return out;
}

/** The whole document as text, one block per line (for word diffs). */
export function docText(doc: unknown, values?: Record<string, string> | null): string {
  return docBlocks(doc, values)
    .map((b) => (b.kind === 'h2' || b.kind === 'h3' ? `§ ${b.text}` : b.text))
    .join('\n');
}

export interface DocStats {
  h2: number;
  h3: number;
  tables: number;
  tableRows: number;
  listItems: number;
  anchors: string[];
  requestForms: number;
}

/** The block structure the small-fix rule compares (§5.1). */
export function docStats(doc: unknown): DocStats {
  const s: DocStats = { h2: 0, h3: 0, tables: 0, tableRows: 0, listItems: 0, anchors: [], requestForms: 0 };
  for (const b of docBlocks(doc)) {
    if (b.kind === 'h2') s.h2++;
    if (b.kind === 'h3') s.h3++;
    if (b.kind === 'caption') s.tables++;
    if (b.kind === 'row') s.tableRows++;
    if (b.kind === 'li') s.listItems++;
    if (b.kind === 'form') s.requestForms++;
    if (b.anchor) s.anchors.push(b.anchor);
  }
  return s;
}

/*
 * The small-fix meter (§5.1) is a port of the API's guard
 * (backend/src/site-content/small-fix.ts), so the dialog says what the API
 * will decide: the same block texts (every paragraph, including those in
 * lists and table cells, every heading and header cell; tokens left out),
 * the same word diff, and the same structure rules. The API still decides.
 */

const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);

/** Insertions plus deletions between two word lists (a longest common subsequence). */
function wordDiff(a: readonly string[], b: readonly string[]): number {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (!x.length) return y.length;
  if (!y.length) return x.length;
  let prev = new Int32Array(y.length + 1);
  let row = new Int32Array(y.length + 1);
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      row[j] = x[i - 1] === y[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
    [prev, row] = [row, prev];
  }
  return x.length + y.length - 2 * prev[y.length];
}

/** Words inserted plus words deleted between two texts. */
export function wordsChanged(before: string, after: string): number {
  return before === after ? 0 : wordDiff(splitWords(before), splitWords(after));
}

/** Equal blocks are matched first; the blocks between matches are paired in order and word-diffed. */
function blockWordDiff(a: readonly string[], b: readonly string[]): number {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const x = a.slice(start, endA);
  const y = b.slice(start, endB);
  if (!x.length || !y.length) return [...x, ...y].reduce((n, t) => n + splitWords(t).length, 0);
  const w = y.length + 1;
  const dp = new Int32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i * w + j] = x[i] === y[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let total = 0;
  let gapA: string[] = [];
  let gapB: string[] = [];
  const flush = () => {
    const n = Math.max(gapA.length, gapB.length);
    for (let k = 0; k < n; k++) total += wordDiff(splitWords(gapA[k] ?? ''), splitWords(gapB[k] ?? ''));
    gapA = [];
    gapB = [];
  };
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      flush();
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      gapA.push(x[i++]);
    } else {
      gapB.push(y[j++]);
    }
  }
  while (i < x.length) gapA.push(x[i++]);
  while (j < y.length) gapB.push(y[j++]);
  flush();
  return total;
}

/** An inline run's text as the API counts it: text, and a space for a line break. */
function plainRun(nodes: unknown): string {
  if (typeof nodes === 'string') return nodes;
  if (!Array.isArray(nodes)) return '';
  let out = '';
  for (const n of nodes as J[]) {
    if (n?.type === 'text') out += String(n.text ?? '');
    else if (n?.type === 'hardBreak') out += ' ';
  }
  return out;
}

interface NoticeInfo {
  h2: number;
  h3: number;
  tables: number;
  tableRows: number[];
  listItems: number;
  anchors: string[];
  blocks: string[];
}

function noticeInfo(doc: unknown): NoticeInfo {
  const info: NoticeInfo = { h2: 0, h3: 0, tables: 0, tableRows: [], listItems: 0, anchors: [], blocks: [] };
  const para = (n: J) => info.blocks.push(plainRun(n.content));
  const list = (n: J) => {
    for (const item of (n.content ?? []) as J[]) {
      const kids = (item?.content ?? []) as J[];
      if (!kids.length) continue;
      for (const c of kids) {
        if (c?.type === 'paragraph') para(c);
        else if (c?.type === 'bulletList' || c?.type === 'orderedList') list(c);
      }
      info.listItems++;
    }
  };
  for (const n of ((doc as J | null)?.content ?? []) as J[]) {
    switch (n?.type) {
      case 'paragraph':
        para(n);
        break;
      case 'heading': {
        if (n.attrs?.anchor) info.anchors.push(String(n.attrs.anchor));
        if (Number(n.attrs?.level) === 2) info.h2++;
        else info.h3++;
        info.blocks.push(plainRun(n.content));
        break;
      }
      case 'bulletList':
      case 'orderedList':
        list(n);
        break;
      case 'table': {
        const rows = (n.content ?? []) as J[];
        for (const r of rows) {
          for (const cell of (r?.content ?? []) as J[]) {
            for (const p of (cell?.content ?? []) as J[]) if (p?.type === 'paragraph') para(p);
          }
        }
        info.tables++;
        info.tableRows.push(Math.max(0, rows.length - 1));
        break;
      }
      default:
        break;
    }
  }
  return info;
}

function counted(n: number, one: string, many: string): string {
  const verb = n > 0 ? 'added' : 'removed';
  const k = Math.abs(n);
  return k === 1 ? `a ${one} ${verb}` : `${k} ${many} ${verb}`;
}

/** The head's four texts: SEO title, SEO description, H1, summary. */
function headTexts(content: unknown): string[] {
  const c = (isObj(content) ? content : {}) as Record<string, unknown>;
  const seo = (isObj(c.seo) ? c.seo : {}) as Record<string, unknown>;
  return [plainRun(seo.title), plainRun(seo.description), plainRun(c.title), plainRun(c.summary)];
}

export interface SmallFix {
  /** Words inserted plus words deleted (blocks and the head's four texts). */
  words: number;
  /** What changed in the structure, in words ("a table row added"); empty when unchanged. */
  structure: string[];
}

/** One language's whole draft (head and body) against its live text (§5.1). */
export function smallFix(liveContent: unknown, draftContent: unknown): SmallFix {
  const bodyOf = (c: unknown) => (isObj(c) ? c.body : undefined);
  const a = noticeInfo(bodyOf(liveContent));
  const b = noticeInfo(bodyOf(draftContent));
  const structure: string[] = [];
  const headings = b.h2 + b.h3 - (a.h2 + a.h3);
  if (headings) structure.push(counted(headings, 'heading', 'headings'));
  else if (a.h2 !== b.h2) structure.push('a heading’s level changed');
  if (b.tables !== a.tables) structure.push(counted(b.tables - a.tables, 'table', 'tables'));
  const rowsA = a.tableRows.reduce((n, r) => n + r, 0);
  const rowsB = b.tableRows.reduce((n, r) => n + r, 0);
  if (rowsB !== rowsA) structure.push(counted(rowsB - rowsA, 'table row', 'table rows'));
  else if (b.tables === a.tables && a.tableRows.some((r, k) => r !== b.tableRows[k])) structure.push('table rows moved between tables');
  if (b.listItems !== a.listItems) structure.push(counted(b.listItems - a.listItems, 'list item', 'list items'));
  const sameAnchors = a.anchors.length === b.anchors.length && a.anchors.every((x, k) => x === b.anchors[k]);
  if (!sameAnchors) structure.push('a section’s link name changed');
  if (!structure.length && a.blocks.length !== b.blocks.length) {
    structure.push(counted(b.blocks.length - a.blocks.length, 'paragraph', 'paragraphs'));
  }
  let words = blockWordDiff(a.blocks, b.blocks);
  const ha = headTexts(liveContent);
  const hb = headTexts(draftContent);
  for (let k = 0; k < Math.max(ha.length, hb.length); k++) words += wordDiff(splitWords(ha[k] ?? ''), splitWords(hb[k] ?? ''));
  return { words, structure };
}

/** Every string inside a structured item, with its path (for the lint and field diffs). */
export function collectStrings(value: unknown, path = ''): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (v: unknown, p: string) => {
    if (typeof v === 'string') {
      out.push({ path: p, text: v });
    } else if (Array.isArray(v)) {
      // An inline value: an array of text/token nodes.
      if (v.length && v.every((x) => isObj(x) && typeof x.type === 'string' && (x.type === 'text' || x.type === 'token'))) {
        out.push({ path: p, text: inlineText(v) });
        return;
      }
      v.forEach((x, i) => walk(x, `${p}[${i}]`));
    } else if (isObj(v)) {
      if (v.type === 'doc') {
        for (const b of docBlocks(v, null, p)) out.push({ path: b.path, text: b.text });
        return;
      }
      for (const [k, x] of Object.entries(v)) {
        if (k === 'facts' || k === 'mediaId' || k === 'theme' || k === 'captured' || k === 'noPersonalData') continue;
        walk(x, p ? `${p}.${k}` : k);
      }
    }
  };
  walk(value, path);
  return out;
}
