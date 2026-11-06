import type { FieldError } from '../errors';
import { isTokenName, type TokenName } from '../live-values';
import { checkHref } from './href';
import type { InlineNode, Mark, MarkName } from './types';

/**
 * Inline rich text: one paragraph's content (W7 addendum §3.1 `inline`, §4.1).
 * Allowlists of nodes, marks and attributes; links by the site-content href
 * rule; tokens only from the names the field allows. Unknown nodes and marks
 * are refused with a field error; unknown attributes and nulls are dropped.
 */

export interface InlineRules {
  marks: readonly MarkName[];
  tokens: readonly TokenName[];
  /** Tokens (and stops) may carry marks: a bold value. */
  tokenMarks?: boolean;
  /** stop / hardBreak / cookieSettings (documents only). */
  extras?: readonly ('stop' | 'hardBreak' | 'cookieSettings')[];
  siteUrl: string;
}

export interface InlineStats {
  /** Visible length: graphemes, a token counts as 10 (§3.1). */
  length: number;
  tokens: TokenName[];
  links: { href: string; lang?: string }[];
  cookieSettings: number;
  /** Plain text, tokens as nothing: for hooks and word counts. */
  text: string;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const MARK_ORDER: MarkName[] = ['bold', 'italic', 'code', 'link'];
const ATTR_MAX = 120;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Unicode characters as people see them (graphemes). */
export function graphemes(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

export const TOKEN_LENGTH = 10;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** A plain attribute string: absent/null → undefined; else trimmed of nothing, checked. */
function plainAttr(
  v: unknown,
  path: string,
  what: string,
  errors: FieldError[],
): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') {
    errors.push({ path, message: `${what} must be text.` });
    return undefined;
  }
  if (CONTROL.test(v)) {
    errors.push({ path, message: `${what} has a line break or a hidden character in it.` });
    return undefined;
  }
  if (v.length > ATTR_MAX) {
    errors.push({ path, message: `${what} can be at most ${ATTR_MAX} characters.` });
    return undefined;
  }
  return v;
}

function cleanMarks(
  input: unknown,
  rules: InlineRules,
  allowed: readonly MarkName[],
  path: string,
  errors: FieldError[],
  stats: InlineStats,
): Mark[] | undefined {
  if (input === undefined || input === null) return undefined;
  if (!Array.isArray(input)) {
    errors.push({ path, message: 'The text formatting is malformed.' });
    return undefined;
  }
  const byType = new Map<MarkName, Mark>();
  for (const m of input) {
    const type = isObj(m) ? m.type : undefined;
    if (typeof type !== 'string' || !(allowed as readonly string[]).includes(type)) {
      errors.push({
        path,
        message:
          type === 'link'
            ? 'Links aren’t allowed here.'
            : `This formatting isn’t allowed here${typeof type === 'string' ? ` (${type})` : ''}.`,
      });
      continue;
    }
    if (type === 'link') {
      const attrs = isObj((m as Record<string, unknown>).attrs) ? ((m as Record<string, unknown>).attrs as Record<string, unknown>) : {};
      const check = checkHref(attrs.href, rules.siteUrl);
      if (!check.ok) {
        errors.push({ path, message: check.message });
        continue;
      }
      const lang = attrs.lang;
      if (lang !== undefined && lang !== null && lang !== '' && lang !== 'en' && lang !== 'hi') {
        errors.push({ path, message: 'A link’s language is English (en) or Hindi (hi).' });
        continue;
      }
      const mark: Mark = { type: 'link', attrs: { href: check.href } };
      if (lang === 'en' || lang === 'hi') mark.attrs.lang = lang;
      byType.set('link', mark);
      stats.links.push({ href: check.href, ...(mark.attrs.lang ? { lang: mark.attrs.lang } : {}) });
    } else {
      byType.set(type as MarkName, { type } as Mark);
    }
  }
  const out = MARK_ORDER.filter((t) => byType.has(t)).map((t) => byType.get(t)!);
  return out.length ? out : undefined;
}

/**
 * Normalises one paragraph's inline content. Returns the clean nodes (adjacent
 * text runs with the same marks merged) and what they contain.
 */
export function normalizeInline(
  input: unknown,
  rules: InlineRules,
  path: string,
  errors: FieldError[],
): { nodes: InlineNode[]; stats: InlineStats } {
  const stats: InlineStats = { length: 0, tokens: [], links: [], cookieSettings: 0, text: '' };
  const nodes: InlineNode[] = [];
  if (input === undefined || input === null) return { nodes, stats };
  if (!Array.isArray(input)) {
    errors.push({ path, message: 'This text is malformed.' });
    return { nodes, stats };
  }
  const extras = rules.extras ?? [];
  input.forEach((raw, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(raw) || typeof raw.type !== 'string') {
      errors.push({ path: p, message: 'This text is malformed.' });
      return;
    }
    const attrs = isObj(raw.attrs) ? raw.attrs : {};
    switch (raw.type) {
      case 'text': {
        if (typeof raw.text !== 'string') {
          errors.push({ path: p, message: 'This text is malformed.' });
          return;
        }
        if (raw.text === '') return;
        if (CONTROL.test(raw.text)) {
          errors.push({ path: p, message: 'Remove the line break or hidden character from this text.' });
          return;
        }
        const marks = cleanMarks(raw.marks, rules, rules.marks, p, errors, stats);
        nodes.push(marks ? { type: 'text', text: raw.text, marks } : { type: 'text', text: raw.text });
        stats.length += graphemes(raw.text);
        stats.text += raw.text;
        return;
      }
      case 'token': {
        const name = attrs.name;
        if (!isTokenName(name) || !rules.tokens.includes(name)) {
          errors.push({
            path: p,
            message: isTokenName(name)
              ? `The live value "${name}" can’t be used here.`
              : 'Unknown live value.',
          });
          return;
        }
        const node: InlineNode = { type: 'token', attrs: { name } };
        const before = plainAttr(attrs.before, p, 'The text before the value', errors);
        const after = plainAttr(attrs.after, p, 'The text after the value', errors);
        const otherwise = plainAttr(attrs.else, p, 'The text without a value', errors);
        if (before !== undefined) node.attrs.before = before;
        if (after !== undefined) node.attrs.after = after;
        if (otherwise !== undefined) node.attrs.else = otherwise;
        if (attrs.as !== undefined && attrs.as !== null && attrs.as !== 'text') {
          if (attrs.as !== 'mailto') {
            errors.push({ path: p, message: 'A live value shows as text or as an email link.' });
            return;
          }
          if (!['officer.email', 'site.email', 'contact.email'].includes(name)) {
            errors.push({ path: p, message: 'Only an email address can show as an email link.' });
            return;
          }
          node.attrs.as = 'mailto';
        }
        if (raw.marks !== undefined && raw.marks !== null) {
          const marks = rules.tokenMarks
            ? cleanMarks(raw.marks, rules, rules.marks.filter((m) => m !== 'link'), p, errors, stats)
            : (errors.push({ path: p, message: 'A live value can’t be formatted here.' }), undefined);
          if (marks) node.marks = marks;
        }
        nodes.push(node);
        stats.length += TOKEN_LENGTH;
        stats.tokens.push(name);
        return;
      }
      case 'stop': {
        if (!extras.includes('stop')) break;
        const node: InlineNode = { type: 'stop' };
        if (raw.marks !== undefined && raw.marks !== null && rules.tokenMarks) {
          const marks = cleanMarks(raw.marks, rules, rules.marks.filter((m) => m !== 'link'), p, errors, stats);
          if (marks) node.marks = marks;
        }
        nodes.push(node);
        stats.length += 1;
        return;
      }
      case 'hardBreak': {
        if (!extras.includes('hardBreak')) break;
        nodes.push({ type: 'hardBreak' });
        stats.text += ' ';
        return;
      }
      case 'cookieSettings': {
        if (!extras.includes('cookieSettings')) break;
        const node: InlineNode = { type: 'cookieSettings' };
        const before = plainAttr(attrs.before, p, 'The text before the button', errors);
        const after = plainAttr(attrs.after, p, 'The text after the button', errors);
        if (before !== undefined || after !== undefined) {
          node.attrs = {};
          if (before !== undefined) node.attrs.before = before;
          if (after !== undefined) node.attrs.after = after;
        }
        nodes.push(node);
        stats.cookieSettings++;
        stats.length += graphemes((before ?? '') + 'Cookie settings' + (after ?? ''));
        return;
      }
    }
    errors.push({ path: p, message: `"${raw.type}" can’t be placed here.` });
  });
  return { nodes: mergeText(nodes), stats };
}

const sameMarks = (a?: Mark[], b?: Mark[]) =>
  JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Adjacent text runs with the same marks become one (as TipTap stores them). */
export function mergeText(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.type === 'text' && n.type === 'text' && sameMarks(prev.marks, n.marks)) {
      out[out.length - 1] = { ...prev, text: prev.text + n.text };
    } else {
      out.push(n);
    }
  }
  return out;
}
