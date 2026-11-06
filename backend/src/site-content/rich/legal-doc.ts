import type { FieldError } from '../errors';
import type { TokenName } from '../live-values';
import type { DocProfile } from '../registry';
import { isReservedId, isValidId, RESERVED_ID_MESSAGE } from '../schemas/reserved-ids';
import { normalizeInline, type InlineRules } from './inline';
import type {
  BlockNode,
  HeadingNode,
  ListItemNode,
  ListNode,
  ParagraphNode,
  SiteDoc,
  TableCellNode,
  TableRowNode,
} from './types';

/**
 * The document normaliser for legal documents and custom pages (W7 addendum
 * §4.1, §4.4). Written like the newsroom's `normalizeDoc` (allowlists of
 * nodes, children, marks and attributes; limits; a path with every problem)
 * but separate from it: the newsroom file stays untouched. Hooks are checked
 * on publish only (`hookProblems`).
 */

const LEGAL_TOKENS: TokenName[] = [
  'site.name',
  'site.url',
  'site.company',
  'site.email',
  'contact.email',
  'company.legalName',
  'company.postalAddress',
  'officer.name',
  'officer.email',
  'officer.phone',
  'privacy.responseDays',
];

export interface ProfileRules {
  tokens: TokenName[];
  cookieSettings: boolean;
  images: boolean;
  requestForm: boolean;
  /** Anchors the profile requires, so they may take a reserved id. */
  requiredAnchors: string[];
}

export const PROFILES: Readonly<Record<DocProfile, ProfileRules>> = {
  'privacy-en': {
    tokens: [...LEGAL_TOKENS, 'notice.version', 'cookies.servicesInUse'],
    cookieSettings: true,
    images: false,
    requestForm: false,
    requiredAnchors: ['cookies'],
  },
  'privacy-hi': {
    tokens: [...LEGAL_TOKENS, 'notice.version'],
    cookieSettings: false,
    images: false,
    requestForm: false,
    requiredAnchors: ['cookies'],
  },
  terms: { tokens: LEGAL_TOKENS, cookieSettings: false, images: false, requestForm: false, requiredAnchors: [] },
  disclaimer: { tokens: LEGAL_TOKENS, cookieSettings: false, images: false, requestForm: false, requiredAnchors: [] },
  requests: { tokens: LEGAL_TOKENS, cookieSettings: false, images: false, requestForm: true, requiredAnchors: [] },
  simple: { tokens: ['site.name'], cookieSettings: false, images: true, requestForm: false, requiredAnchors: [] },
};

/** Heads (SEO description, summary) take text and `site.name` only (§3.1, §4.2). */
export const HEAD_TOKENS: TokenName[] = ['site.name'];

export const DOC_LIMITS = {
  h2: 60,
  tables: 10,
  tableColumns: 6,
  tableRows: 60,
  cellChars: 1000,
  captionChars: 120,
  headingChars: 200,
  listDepth: 3,
  nodes: 20_000,
} as const;

export interface DocInfo {
  tokens: TokenName[];
  anchors: string[];
  h2: number;
  h3: number;
  tables: number;
  /** Body rows per table, in order. */
  tableRows: number[];
  listItems: number;
  links: { href: string; lang?: string }[];
  mediaIds: string[];
  requestForms: number;
  cookieSettings: number;
  /** Plain text of every block, tokens as nothing (hooks, word counts). */
  blocks: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates and normalises a document. Problems go into `errors` (with a
 * path); the result is the clean document, or null when it is unusable.
 */
export function normalizeDoc(
  input: unknown,
  profile: DocProfile,
  siteUrl: string,
  path: string,
  errors: FieldError[],
): { doc: SiteDoc | null; info: DocInfo } {
  const rules = PROFILES[profile];
  const info: DocInfo = {
    tokens: [],
    anchors: [],
    h2: 0,
    h3: 0,
    tables: 0,
    tableRows: [],
    listItems: 0,
    links: [],
    mediaIds: [],
    requestForms: 0,
    cookieSettings: 0,
    blocks: [],
  };
  if (!isObj(input) || input.type !== 'doc' || !Array.isArray(input.content)) {
    errors.push({ path, message: 'The document is malformed.' });
    return { doc: null, info };
  }
  let nodeCount = 0;
  const inlineRules = (cookieSettings: boolean): InlineRules => ({
    marks: ['bold', 'italic', 'code', 'link'],
    tokens: rules.tokens,
    tokenMarks: true,
    extras: cookieSettings ? ['stop', 'hardBreak', 'cookieSettings'] : ['stop', 'hardBreak'],
    siteUrl,
  });
  const record = (stats: ReturnType<typeof normalizeInline>['stats']) => {
    info.tokens.push(...stats.tokens);
    info.links.push(...stats.links);
    info.cookieSettings += stats.cookieSettings;
  };

  const paragraph = (raw: Record<string, unknown>, p: string, cookieSettings: boolean): ParagraphNode | null => {
    const attrs = isObj(raw.attrs) ? raw.attrs : {};
    const node: ParagraphNode = { type: 'paragraph' };
    if (attrs.variant !== undefined && attrs.variant !== null) {
      if (attrs.variant !== 'note') {
        errors.push({ path: p, message: 'A paragraph is normal or a small note.' });
      } else node.attrs = { variant: 'note' };
    }
    const { nodes, stats } = normalizeInline(raw.content, inlineRules(cookieSettings), `${p}.content`, errors);
    record(stats);
    nodeCount += nodes.length;
    if (nodes.length) node.content = nodes;
    info.blocks.push(stats.text);
    return node;
  };

  const heading = (raw: Record<string, unknown>, p: string): HeadingNode | null => {
    const attrs = isObj(raw.attrs) ? raw.attrs : {};
    const level = attrs.level;
    if (level !== 2 && level !== 3) {
      errors.push({ path: p, message: 'Headings are level 2 or 3 (the page title is level 1).' });
      return null;
    }
    const { nodes, stats } = normalizeInline(
      raw.content,
      { marks: [], tokens: rules.tokens, tokenMarks: false, siteUrl },
      `${p}.content`,
      errors,
    );
    info.tokens.push(...stats.tokens);
    if (!stats.text.trim()) {
      errors.push({ path: p, message: 'A heading needs some text.' });
      return null;
    }
    if (stats.length > DOC_LIMITS.headingChars) {
      errors.push({ path: p, message: `A heading can be at most ${DOC_LIMITS.headingChars} characters.` });
    }
    const node: HeadingNode = { type: 'heading', attrs: { level }, content: nodes as HeadingNode['content'] };
    const anchor = attrs.anchor;
    if (anchor === undefined || anchor === null || anchor === '') {
      if (level === 2) errors.push({ path: p, message: 'Every section heading needs a link name (anchor).' });
    } else if (!isValidId(anchor)) {
      errors.push({
        path: p,
        message: 'A link name is lower-case letters, digits and single hyphens, at most 60 characters.',
      });
    } else if (isReservedId(anchor, { allow: rules.requiredAnchors })) {
      errors.push({ path: p, message: RESERVED_ID_MESSAGE });
    } else if (info.anchors.includes(anchor)) {
      errors.push({ path: p, message: `The link name "${anchor}" is used twice in this document.` });
    } else {
      node.attrs.anchor = anchor;
      info.anchors.push(anchor);
    }
    if (level === 2) info.h2++;
    else info.h3++;
    nodeCount += nodes.length;
    info.blocks.push(stats.text);
    return node;
  };

  const list = (raw: Record<string, unknown>, p: string, depth: number): ListNode | null => {
    if (depth > DOC_LIMITS.listDepth) {
      errors.push({ path: p, message: `Lists can be nested at most ${DOC_LIMITS.listDepth} deep.` });
      return null;
    }
    if (!Array.isArray(raw.content)) {
      errors.push({ path: p, message: 'This list is malformed.' });
      return null;
    }
    const items: ListItemNode[] = [];
    raw.content.forEach((li, i) => {
      const lp = `${p}.content[${i}]`;
      if (!isObj(li) || li.type !== 'listItem' || !Array.isArray(li.content)) {
        errors.push({ path: lp, message: 'A list holds list items only.' });
        return;
      }
      const children: ListItemNode['content'] = [];
      li.content.forEach((c, j) => {
        const cp = `${lp}.content[${j}]`;
        if (!isObj(c)) return void errors.push({ path: cp, message: 'This list item is malformed.' });
        if (c.type === 'paragraph') {
          const para = paragraph(c, cp, rules.cookieSettings);
          if (para?.content?.length) children.push(para);
        } else if (c.type === 'bulletList' || c.type === 'orderedList') {
          if (children.length === 0) {
            errors.push({ path: cp, message: 'A list item starts with text.' });
            return;
          }
          const sub = list(c, cp, depth + 1);
          if (sub) children.push(sub);
        } else {
          errors.push({ path: cp, message: `"${String(c.type)}" can’t be placed in a list.` });
        }
      });
      if (children.length) {
        items.push({ type: 'listItem', content: children });
        info.listItems++;
      }
    });
    if (!items.length) return null;
    if (raw.type === 'orderedList') {
      const attrs = isObj(raw.attrs) ? raw.attrs : {};
      const node: ListNode = { type: 'orderedList', content: items };
      const start = attrs.start;
      if (start !== undefined && start !== null && start !== 1) {
        if (!Number.isInteger(start) || (start as number) < 1 || (start as number) > 1000) {
          errors.push({ path: p, message: 'A numbered list starts at a number from 1 to 1000.' });
        } else node.attrs = { start: start as number };
      }
      return node;
    }
    return { type: 'bulletList', content: items };
  };

  const table = (raw: Record<string, unknown>, p: string) => {
    const attrs = isObj(raw.attrs) ? raw.attrs : {};
    const caption = typeof attrs.caption === 'string' ? attrs.caption.trim() : '';
    if (!caption || caption.length > DOC_LIMITS.captionChars) {
      errors.push({
        path: p,
        message: `A table needs a short name that says what it lists (1–${DOC_LIMITS.captionChars} characters).`,
      });
    }
    if (!Array.isArray(raw.content) || raw.content.length < 2) {
      errors.push({ path: p, message: 'A table needs a header row and at least one row.' });
      return null;
    }
    let columns = -1;
    const rows: TableRowNode[] = [];
    raw.content.forEach((row, r) => {
      const rp = `${p}.content[${r}]`;
      if (!isObj(row) || row.type !== 'tableRow' || !Array.isArray(row.content)) {
        errors.push({ path: rp, message: 'This table row is malformed.' });
        return;
      }
      const want = r === 0 ? 'tableHeader' : 'tableCell';
      if (columns === -1) columns = row.content.length;
      if (row.content.length !== columns) {
        errors.push({ path: rp, message: 'Every row of a table has the same number of cells.' });
      }
      const cells: TableCellNode[] = [];
      row.content.forEach((cell, c) => {
        const cp = `${rp}.content[${c}]`;
        if (!isObj(cell) || cell.type !== want) {
          errors.push({
            path: cp,
            message: r === 0 ? 'The first row of a table holds the column names.' : 'Only the first row of a table holds column names.',
          });
          return;
        }
        const ca = isObj(cell.attrs) ? cell.attrs : {};
        if ((ca.colspan ?? 1) !== 1 || (ca.rowspan ?? 1) !== 1) {
          errors.push({ path: cp, message: 'Merged table cells aren’t supported.' });
        }
        const paras = Array.isArray(cell.content) ? cell.content : [];
        const out: ParagraphNode[] = [];
        let chars = 0;
        paras.forEach((para, k) => {
          const pp = `${cp}.content[${k}]`;
          if (!isObj(para) || para.type !== 'paragraph') {
            errors.push({ path: pp, message: 'A table cell holds text only.' });
            return;
          }
          if (r === 0) {
            const { nodes, stats } = normalizeInline(
              para.content,
              { marks: [], tokens: [], tokenMarks: false, siteUrl },
              `${pp}.content`,
              errors,
            );
            chars += stats.length;
            info.blocks.push(stats.text);
            out.push(nodes.length ? { type: 'paragraph', content: nodes } : { type: 'paragraph' });
          } else {
            const node = paragraph(para, pp, rules.cookieSettings);
            if (node) {
              chars += (node.content ?? []).reduce((n, x) => n + (x.type === 'text' ? x.text.length : x.type === 'token' ? 10 : 1), 0);
              out.push(node);
            }
          }
        });
        if (r === 0 && out.length !== 1) {
          errors.push({ path: cp, message: 'A column name is one line of plain text.' });
        }
        if (chars > DOC_LIMITS.cellChars) {
          errors.push({ path: cp, message: `A table cell can be at most ${DOC_LIMITS.cellChars} characters.` });
        }
        cells.push({ type: want, content: out.length ? out : [{ type: 'paragraph' }] });
      });
      rows.push({ type: 'tableRow', content: cells });
    });
    if (columns < 1 || columns > DOC_LIMITS.tableColumns) {
      errors.push({ path: p, message: `A table has 1–${DOC_LIMITS.tableColumns} columns.` });
    }
    if (rows.length - 1 > DOC_LIMITS.tableRows) {
      errors.push({ path: p, message: `A table can have at most ${DOC_LIMITS.tableRows} rows.` });
    }
    info.tables++;
    info.tableRows.push(rows.length - 1);
    return { type: 'table' as const, attrs: { caption }, content: rows };
  };

  const blocks: BlockNode[] = [];
  input.content.forEach((raw, i) => {
    const p = `${path}.content[${i}]`;
    nodeCount++;
    if (!isObj(raw) || typeof raw.type !== 'string') {
      errors.push({ path: p, message: 'This part of the document is malformed.' });
      return;
    }
    switch (raw.type) {
      case 'paragraph': {
        const node = paragraph(raw, p, rules.cookieSettings);
        // An empty paragraph (an editor's trailing line) is dropped.
        if (node?.content?.length) blocks.push(node);
        return;
      }
      case 'heading': {
        const node = heading(raw, p);
        if (node) blocks.push(node);
        return;
      }
      case 'bulletList':
      case 'orderedList': {
        const node = list(raw, p, 1);
        if (node) blocks.push(node);
        return;
      }
      case 'table': {
        const node = table(raw, p);
        if (node) blocks.push(node);
        return;
      }
      case 'image': {
        if (!rules.images) break;
        const a = isObj(raw.attrs) ? raw.attrs : {};
        if (typeof a.mediaId !== 'string' || !UUID.test(a.mediaId)) {
          errors.push({ path: p, message: 'Pick images from the media library.' });
          return;
        }
        const alt = typeof a.alt === 'string' ? a.alt.trim() : '';
        if (alt.length > 300) errors.push({ path: p, message: 'Image text can be at most 300 characters.' });
        const node: BlockNode = { type: 'image', attrs: { mediaId: a.mediaId.toLowerCase(), alt } };
        for (const k of ['caption', 'credit'] as const) {
          const v = a[k];
          if (typeof v === 'string' && v.trim()) {
            if (v.length > 300) errors.push({ path: p, message: `The image ${k} can be at most 300 characters.` });
            node.attrs[k] = v.trim();
          }
        }
        info.mediaIds.push(node.attrs.mediaId);
        blocks.push(node);
        return;
      }
      case 'requestForm': {
        if (!rules.requestForm) break;
        info.requestForms++;
        blocks.push({ type: 'requestForm' });
        return;
      }
    }
    errors.push({ path: p, message: `"${raw.type}" can’t be placed in this document.` });
  });
  if (info.h2 > DOC_LIMITS.h2) {
    errors.push({ path, message: `A document can have at most ${DOC_LIMITS.h2} section headings.` });
  }
  if (info.tables > DOC_LIMITS.tables) {
    errors.push({ path, message: `A document can have at most ${DOC_LIMITS.tables} tables.` });
  }
  if (nodeCount > DOC_LIMITS.nodes) {
    errors.push({ path, message: 'This document is too long to save.' });
  }
  if (!blocks.length) errors.push({ path, message: 'The document is empty.' });
  return { doc: { type: 'doc', content: blocks }, info };
}

const linksTo = (info: DocInfo, path: string, lang?: string) =>
  info.links.some(
    (l) => l.href.replace(/#.*$/, '') === path && (lang === undefined || l.lang === lang),
  );
const count = (info: DocInfo, name: TokenName) =>
  info.tokens.filter((t) => t === name).length;
const hasText = (info: DocInfo, text: string) =>
  info.blocks.join(' ').replace(/\s+/g, ' ').includes(text);

/**
 * The hooks a publish must keep (§4.4): tests, the cookie banner, the app and
 * the law rely on them. [] = every hook is there. Nobody can override them.
 */
export function hookProblems(profile: DocProfile, info: DocInfo): string[] {
  const out: string[] = [];
  const cookies = info.anchors.filter((a) => a === 'cookies').length;
  if (profile === 'privacy-en' || profile === 'privacy-hi') {
    if (cookies !== 1) {
      out.push('The notice must keep exactly one section heading with the link name "cookies" (the cookie banner links to it).');
    }
    if (count(info, 'notice.version') !== 1) {
      out.push('The notice must show its version once (the "notice version" live value).');
    }
    if (count(info, 'officer.email') < 1) {
      out.push('The notice must give the grievance officer’s email (the "officer email" live value).');
    }
  }
  if (profile === 'privacy-en') {
    if (info.tables < 2) out.push('The notice must keep its two tables (what we collect, and how long we keep it).');
    if (!linksTo(info, '/privacy/hi', 'hi')) out.push('The notice must link to the Hindi notice (/privacy/hi, marked as Hindi).');
    if (!linksTo(info, '/privacy/requests')) out.push('The notice must link to the privacy requests page (/privacy/requests).');
    for (const t of ['Digital Personal Data Protection Act, 2023', 'Data Protection Board of India']) {
      if (!hasText(info, t)) out.push(`The notice must name the "${t}".`);
    }
  }
  if (profile === 'privacy-hi') {
    if (!linksTo(info, '/privacy', 'en')) out.push('The Hindi notice must link to the English notice (/privacy, marked as English).');
    for (const t of ['गोपनीयता', 'डेटा संरक्षण बोर्ड']) {
      if (!hasText(info, t)) out.push(`The Hindi notice must contain "${t}".`);
    }
  }
  if (profile === 'terms') {
    if (info.h2 < 1) out.push('The terms need at least one section heading.');
    if (!linksTo(info, '/privacy')) out.push('The terms must link to the privacy notice (/privacy).');
  }
  if (profile === 'disclaimer' && info.h2 < 1) {
    out.push('The disclaimer needs at least one section heading.');
  }
  if (profile === 'requests') {
    if (info.requestForms !== 1) out.push('The page must keep exactly one request form.');
    if (count(info, 'privacy.responseDays') < 1) out.push('The page must say how many days we take to answer (the "response days" live value).');
    if (!linksTo(info, '/privacy')) out.push('The page must link to the privacy notice (/privacy).');
    if (!hasText(info, 'Data Protection Board of India')) out.push('The page must name the "Data Protection Board of India".');
  }
  return out;
}
