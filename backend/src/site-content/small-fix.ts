import type { DocInfo } from './rich/legal-doc';

/**
 * The small-fix guard of the privacy notice (W7 decision 1, addendum §5.1):
 * an Admin (`legal.manage` without `legal.material`) may publish a MINOR
 * change only when, per language against its live revision, the block
 * structure is the same (the same H2s and H3s, tables, table rows, list
 * items, paragraphs and anchors) and at most 40 words changed (insertions
 * plus deletions, by a word diff of each aligned block's plain text). The
 * structure check aligns the blocks one to one, so no diff package is needed.
 */
export const SMALL_FIX_MAX_WORDS = 40;

/** A notice text, as the guard compares it. */
export interface NoticeShape {
  /** The document's facts (from normalizeDoc): counts, anchors, block texts. */
  info: DocInfo;
  /** The head's texts: SEO title, SEO description, H1, summary. */
  head: string[];
}

export interface SmallFixResult {
  /** Words inserted plus words deleted. */
  words: number;
  /** What changed in the structure, in words ("a table row added"). */
  structure: string[];
  /** Whether it is a small fix. */
  ok: boolean;
}

const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);

/** Insertions plus deletions between two word lists (a longest common subsequence). */
export function wordDiff(a: readonly string[], b: readonly string[]): number {
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
  const common = prev[y.length];
  return x.length + y.length - 2 * common;
}

/**
 * Word changes between two lists of block texts: equal blocks are matched
 * first (a longest common subsequence over whole blocks), the blocks left
 * between two matches are paired in order and word-diffed, and a block left
 * without a partner counts all its words.
 */
export function blockWordDiff(a: readonly string[], b: readonly string[]): number {
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
  if (!x.length || !y.length) {
    return [...x, ...y].reduce((n, t) => n + splitWords(t).length, 0);
  }
  // Full table: the middle part is small (most blocks are equal and trimmed).
  const w = y.length + 1;
  const dp = new Int32Array((x.length + 1) * w);
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i * w + j] =
        x[i] === y[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  let total = 0;
  let gapA: string[] = [];
  let gapB: string[] = [];
  const flush = () => {
    const n = Math.max(gapA.length, gapB.length);
    for (let k = 0; k < n; k++) {
      total += wordDiff(splitWords(gapA[k] ?? ''), splitWords(gapB[k] ?? ''));
    }
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

function counted(n: number, one: string, many: string): string {
  const verb = n > 0 ? 'added' : 'removed';
  const k = Math.abs(n);
  return k === 1 ? `a ${one} ${verb}` : `${k} ${many} ${verb}`;
}

/** Compares a draft with the live text of one language (§5.1). */
export function smallFix(live: NoticeShape, draft: NoticeShape): SmallFixResult {
  const a = live.info;
  const b = draft.info;
  const structure: string[] = [];
  const headings = b.h2 + b.h3 - (a.h2 + a.h3);
  if (headings) structure.push(counted(headings, 'heading', 'headings'));
  else if (a.h2 !== b.h2) structure.push('a heading’s level changed');
  if (b.tables !== a.tables) structure.push(counted(b.tables - a.tables, 'table', 'tables'));
  const rowsA = a.tableRows.reduce((n, r) => n + r, 0);
  const rowsB = b.tableRows.reduce((n, r) => n + r, 0);
  if (rowsB !== rowsA) structure.push(counted(rowsB - rowsA, 'table row', 'table rows'));
  else if (b.tables === a.tables && a.tableRows.some((r, k) => r !== b.tableRows[k])) {
    structure.push('table rows moved between tables');
  }
  if (b.listItems !== a.listItems) {
    structure.push(counted(b.listItems - a.listItems, 'list item', 'list items'));
  }
  const sameAnchors = a.anchors.length === b.anchors.length && a.anchors.every((x, k) => x === b.anchors[k]);
  if (!sameAnchors) structure.push('a section’s link name changed');
  if (!structure.length && a.blocks.length !== b.blocks.length) {
    structure.push(counted(b.blocks.length - a.blocks.length, 'paragraph', 'paragraphs'));
  }
  let words = blockWordDiff(a.blocks, b.blocks);
  const n = Math.max(live.head.length, draft.head.length);
  for (let k = 0; k < n; k++) {
    words += wordDiff(splitWords(live.head[k] ?? ''), splitWords(draft.head[k] ?? ''));
  }
  return { words, structure, ok: !structure.length && words <= SMALL_FIX_MAX_WORDS };
}

/** "52 words changed, a table row added". */
export function smallFixReasons(r: SmallFixResult): string {
  const parts = [...(r.words > SMALL_FIX_MAX_WORDS ? [`${r.words} words changed`] : []), ...r.structure];
  return parts.join(', ');
}

/** The plain text of a head field (a line, or an inline field's nodes). */
export function plainOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (!Array.isArray(v)) return '';
  return v
    .map((n) => {
      const node = (n ?? {}) as { type?: string; text?: unknown };
      if (node.type === 'text') return String(node.text ?? '');
      if (node.type === 'hardBreak') return ' ';
      return '';
    })
    .join('');
}

/** The head texts of a legal document: SEO title, SEO description, H1, summary. */
export function headTexts(content: Record<string, unknown>): string[] {
  const seo = (content.seo ?? {}) as Record<string, unknown>;
  return [plainOf(seo.title), plainOf(seo.description), plainOf(content.title), plainOf(content.summary)];
}
