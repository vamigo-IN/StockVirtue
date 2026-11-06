import type { FieldError } from '../errors';
import type { TokenName } from '../live-values';
import type { DocProfile } from '../registry';
import { checkHref } from '../rich/href';
import { graphemes, normalizeInline } from '../rich/inline';
import { normalizeDoc, type DocInfo } from '../rich/legal-doc';
import type { InlineNode, MarkName } from '../rich/types';
import {
  ID_MAX_LENGTH,
  ID_PATTERN,
  isReservedId,
  isValidId,
  RESERVED_ID_MESSAGE,
} from './reserved-ids';

/**
 * The schema DSL of the admin-managed site (W7 addendum §3.1): one field
 * kind per slot type, with the limits that keep the design intact. The same
 * kinds and numbers are mirrored on the web (web/src/content/site/limits.ts,
 * compared by W6, §10.5).
 *
 * `validateContent` walks a schema and a value together and returns the
 * normalised value (unknown keys dropped, strings trimmed, rich text through
 * its allowlist) with every problem as a field error with a path. What needs
 * the database (READY media, menu links to custom pages, categories, the
 * legal-locked baseline, published ids) is collected in the context for the
 * service to check.
 */

export type Range = readonly [number, number];

interface FieldBase {
  /** The portal's label; derived from the key when absent. */
  label?: string;
  /** One line of help under the input. */
  help?: string;
  /** An empty value is allowed ('' / null / []). */
  optional?: boolean;
  /** Needs legal.manage to change; renders with data-verbatim (§3.1). */
  legalLocked?: boolean;
  /** A rule a per-field limit can't express (shown in the portal). */
  note?: string;
  /** A check after the field's own validation (cross-field rules). */
  check?: (value: unknown, path: string, ctx: ValidationContext) => void;
}

export interface LineField extends FieldBase {
  kind: 'line';
  len: Range;
  pattern?: RegExp;
  patternMessage?: string;
}
export interface TextField extends FieldBase {
  kind: 'text';
  len: Range;
}
export interface InlineField extends FieldBase {
  kind: 'inline';
  len: Range;
  tokens?: readonly TokenName[];
  /** Default bold, italic, link. Legal heads allow none. */
  marks?: readonly MarkName[];
}
export interface ParasField extends FieldBase {
  kind: 'paras';
  count: Range;
  len: Range;
  tokens?: readonly TokenName[];
}
export interface FactField extends FieldBase {
  kind: 'fact';
  of: 'line' | 'text' | 'inline';
  len: Range;
  tokens?: readonly TokenName[];
}
export interface ScreenField extends FieldBase {
  kind: 'screen';
}
export interface PhotoField extends FieldBase {
  kind: 'photo';
}
export interface IdField extends FieldBase {
  kind: 'id';
  /** Ids are unique within their scope (and checked for renames there). */
  scope: string;
  /** Fixed ids, in order (the /features chapters): code-owned, never reserved-checked. */
  fixed?: readonly string[];
  /** A reference to an id elsewhere (download → FAQ): pattern only. */
  ref?: boolean;
  /** Published ids may not change without renameIds (default true). */
  immutable?: boolean;
}
export interface ListField extends FieldBase {
  kind: 'list';
  count: Range;
  of: Field;
}
export interface GroupField extends FieldBase {
  kind: 'group';
  fields: Readonly<Record<string, Field>>;
}
export interface MonthField extends FieldBase {
  kind: 'month';
}
export interface NumberField extends FieldBase {
  kind: 'number';
  range: Range;
}
export interface BooleanField extends FieldBase {
  kind: 'boolean';
  default: boolean;
}
export interface MenuLinkField extends FieldBase {
  kind: 'menuLink';
  /** Which menu list (id uniqueness, page links). */
  list: string;
  labelLen: Range;
  /** External links allowed (not in the header's primary items). */
  allowUrl: boolean;
  /** Primary items only: extra paths that make the item current (≤ 3). */
  alsoCurrentOn: boolean;
}
export interface DocField extends FieldBase {
  kind: 'doc';
  profile: DocProfile;
}

export type Field =
  | LineField
  | TextField
  | InlineField
  | ParasField
  | FactField
  | ScreenField
  | PhotoField
  | IdField
  | ListField
  | GroupField
  | MonthField
  | NumberField
  | BooleanField
  | MenuLinkField
  | DocField;

/* ── Builders (the same names and numbers as web/src/content/site/limits.ts) ── */

type Extra<F> = Partial<Omit<F, 'kind'>>;
export const line = (min: number, max: number, extra: Extra<LineField> = {}): LineField => ({
  kind: 'line',
  len: [min, max],
  ...extra,
});
export const text = (min: number, max: number, extra: Extra<TextField> = {}): TextField => ({
  kind: 'text',
  len: [min, max],
  ...extra,
});
export const inline = (min: number, max: number, extra: Extra<InlineField> = {}): InlineField => ({
  kind: 'inline',
  len: [min, max],
  ...extra,
});
export const paras = (
  count: Range,
  len: Range,
  extra: Extra<ParasField> = {},
): ParasField => ({ kind: 'paras', count, len, ...extra });
export const fact = (
  of: FactField['of'],
  min: number,
  max: number,
  extra: Extra<FactField> = {},
): FactField => ({ kind: 'fact', of, len: [min, max], ...extra });
export const screen = (extra: Extra<ScreenField> = {}): ScreenField => ({
  kind: 'screen',
  optional: true,
  ...extra,
});
export const photo = (extra: Extra<PhotoField> = {}): PhotoField => ({ kind: 'photo', ...extra });
export const id = (scope: string, extra: Extra<IdField> = {}): IdField => ({
  kind: 'id',
  scope,
  ...extra,
});
export const list = (min: number, max: number, of: Field, extra: Extra<ListField> = {}): ListField => ({
  kind: 'list',
  count: [min, max],
  of,
  ...extra,
});
export const group = (
  fields: Readonly<Record<string, Field>>,
  extra: Extra<GroupField> = {},
): GroupField => ({ kind: 'group', fields, ...extra });
export const month = (extra: Extra<MonthField> = {}): MonthField => ({ kind: 'month', ...extra });
export const num = (min: number, max: number, extra: Extra<NumberField> = {}): NumberField => ({
  kind: 'number',
  range: [min, max],
  ...extra,
});
export const bool = (def: boolean, extra: Extra<BooleanField> = {}): BooleanField => ({
  kind: 'boolean',
  default: def,
  ...extra,
});
export const menuLink = (
  listName: string,
  labelLen: Range,
  o: { allowUrl?: boolean; alsoCurrentOn?: boolean } = {},
): MenuLinkField => ({
  kind: 'menuLink',
  list: listName,
  labelLen,
  allowUrl: o.allowUrl ?? true,
  alsoCurrentOn: o.alsoCurrentOn ?? false,
});
export const doc = (profile: DocProfile, extra: Extra<DocField> = {}): DocField => ({
  kind: 'doc',
  profile,
  ...extra,
});

/* ── Validation ───────────────────────────────────────────────────────────── */

/** A menu link's target, as stored (W7 addendum §6.1). */
export type MenuTarget =
  | { type: 'path'; path: string }
  | { type: 'page'; pageId: string }
  | { type: 'category'; slug: string }
  | { type: 'url'; url: string };

export interface StoredMenuLink {
  id: string;
  label: string;
  target: MenuTarget;
  lang?: 'hi' | 'en';
  alsoCurrentOn?: string[];
}

export interface ValidationContext {
  siteUrl: string;
  /** Today in India (YYYY-MM-DD): screens can't be captured later. */
  today: string;
  /** Previews: skip length and count limits (half-typed text still previews). */
  lenient: boolean;
  errors: FieldError[];
  /** Screens, photos and document images to check READY, with their paths. */
  media: { path: string; mediaId: string }[];
  /** Ids by scope, in document order (uniqueness, renames). */
  ids: Map<string, { path: string; id: string; immutable: boolean }[]>;
  /** Legal-locked fields' normalised values by path. */
  locked: Map<string, unknown>;
  /** Documents' facts by path. */
  docs: Map<string, DocInfo>;
  /** Menu links (chrome): the targets the service resolves. */
  menuLinks: { path: string; list: string; link: StoredMenuLink }[];
  /** download.beforeInstall.faqIds: FAQ ids referenced, with their paths. */
  refs: { path: string; id: string }[];
}

export function newContext(siteUrl: string, today: string, lenient = false): ValidationContext {
  return {
    siteUrl,
    today,
    lenient,
    errors: [],
    media: [],
    ids: new Map(),
    locked: new Map(),
    docs: new Map(),
    menuLinks: [],
    refs: [],
  };
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FACT_ID = /^F([1-9]|[1-3]\d|4[0-2])$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_MARKS: readonly MarkName[] = ['bold', 'italic', 'link'];
const SCREEN_ALT: Range = [5, 300];
const PHOTO_ALT: Range = [5, 300];

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const present = (v: unknown) => v !== undefined && v !== null;

function lengthProblem(n: number, [min, max]: Range, what = 'This'): string | null {
  if (n < min) return `${what} needs at least ${min} characters (it has ${n}).`;
  if (n > max) return `${what} can be at most ${max} characters (it has ${n}).`;
  return null;
}

function checkLength(n: number, len: Range, path: string, ctx: ValidationContext, what?: string) {
  if (ctx.lenient) return;
  const p = lengthProblem(n, len, what);
  if (p) ctx.errors.push({ path, message: p });
}

function checkCount(n: number, [min, max]: Range, path: string, ctx: ValidationContext) {
  if (ctx.lenient) return;
  if (n < min) ctx.errors.push({ path, message: min === max ? `This needs exactly ${min}.` : `This needs at least ${min}.` });
  else if (n > max) ctx.errors.push({ path, message: min === max ? `This needs exactly ${max}.` : `This can have at most ${max}.` });
}

/** A plain string slot (line, text): trimmed, one line, no hidden characters. */
function plainString(
  f: LineField | TextField,
  input: unknown,
  path: string,
  ctx: ValidationContext,
): string {
  if (!present(input)) {
    if (!f.optional && f.len[0] > 0 && !ctx.lenient) {
      ctx.errors.push({ path, message: 'This is required.' });
    }
    return '';
  }
  if (typeof input !== 'string') {
    ctx.errors.push({ path, message: 'This must be text.' });
    return '';
  }
  const value = input.trim();
  if (/[\r\n]/.test(value)) {
    ctx.errors.push({ path, message: 'Keep this to one paragraph, with no line breaks.' });
    return value.replace(/\s*[\r\n]+\s*/g, ' ');
  }
  if (CONTROL.test(value)) {
    ctx.errors.push({ path, message: 'Remove the hidden character from this text.' });
    return value;
  }
  if (value === '' && f.optional) return '';
  checkLength(graphemes(value), f.len, path, ctx);
  if (f.kind === 'line' && f.pattern && value !== '' && !f.pattern.test(value)) {
    ctx.errors.push({ path, message: f.patternMessage ?? 'This isn’t in the expected format.' });
  }
  return value;
}

function inlineValue(
  f: { len: Range; tokens?: readonly TokenName[]; marks?: readonly MarkName[]; optional?: boolean },
  input: unknown,
  path: string,
  ctx: ValidationContext,
): InlineNode[] {
  if (!present(input) || (Array.isArray(input) && input.length === 0)) {
    if (!f.optional && f.len[0] > 0 && !ctx.lenient) {
      ctx.errors.push({ path, message: 'This is required.' });
    }
    return [];
  }
  const marks = f.marks ?? DEFAULT_MARKS;
  const { nodes, stats } = normalizeInline(
    input,
    {
      marks,
      tokens: f.tokens ?? [],
      tokenMarks: marks.length > 0,
      siteUrl: ctx.siteUrl,
    },
    path,
    ctx.errors,
  );
  if (nodes.length === 0 && f.optional) return nodes;
  checkLength(stats.length, f.len, path, ctx);
  return nodes;
}

function factValue(f: FactField, input: unknown, path: string, ctx: ValidationContext) {
  if (!isObj(input)) {
    ctx.errors.push({ path, message: 'This field is malformed (a text with its fact ids).' });
    return { value: f.of === 'inline' ? [] : '', facts: [] as string[] };
  }
  const one = (v: unknown, p: string) =>
    f.of === 'inline'
      ? inlineValue({ len: f.len, tokens: f.tokens }, v, p, ctx)
      : plainString(f.of === 'line' ? line(f.len[0], f.len[1]) : text(f.len[0], f.len[1]), v, p, ctx);
  const value = one(input.value, `${path}.value`);
  const facts: string[] = [];
  if (present(input.facts)) {
    if (!Array.isArray(input.facts)) {
      ctx.errors.push({ path: `${path}.facts`, message: 'Fact ids are a list, like ["F1", "F9"].' });
    } else {
      for (const fid of input.facts) {
        if (typeof fid !== 'string' || !FACT_ID.test(fid)) {
          ctx.errors.push({ path: `${path}.facts`, message: `"${String(fid)}" isn’t a fact id (F1–F42).` });
        } else if (!facts.includes(fid)) facts.push(fid);
      }
    }
  }
  const out: { value: unknown; facts: string[]; fallback?: unknown } = { value, facts };
  if ('fallback' in input) {
    out.fallback = input.fallback === null || input.fallback === undefined
      ? null
      : one(input.fallback, `${path}.fallback`);
  }
  return out;
}

/** 'YYYY-MM-DD', a real calendar day, not after `today`. */
function capturedProblem(v: unknown, today: string): string | null {
  if (typeof v !== 'string') return 'Give the date the screen was captured (YYYY-MM-DD).';
  const m = DAY.exec(v);
  if (!m) return 'Give the date the screen was captured (YYYY-MM-DD).';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    return 'That date doesn’t exist.';
  }
  if (v > today) return 'A screen can’t be captured after today.';
  return null;
}

function mediaId(v: unknown, path: string, ctx: ValidationContext): string | null {
  if (typeof v !== 'string' || !UUID.test(v)) {
    ctx.errors.push({ path, message: 'Pick an image from the media library.' });
    return null;
  }
  const idv = v.toLowerCase();
  ctx.media.push({ path, mediaId: idv });
  return idv;
}

function screenValue(f: ScreenField, input: unknown, path: string, ctx: ValidationContext) {
  if (!present(input)) {
    if (!f.optional) ctx.errors.push({ path, message: 'Pick a screenshot.' });
    return null;
  }
  if (!isObj(input)) {
    ctx.errors.push({ path, message: 'This screenshot is malformed.' });
    return null;
  }
  const mid = mediaId(input.mediaId, `${path}.mediaId`, ctx);
  const alt = typeof input.alt === 'string' ? input.alt.trim() : '';
  if (CONTROL.test(alt)) ctx.errors.push({ path: `${path}.alt`, message: 'Remove the hidden character from this text.' });
  checkLength(graphemes(alt), SCREEN_ALT, `${path}.alt`, ctx, 'The description');
  const captured = capturedProblem(input.captured, ctx.today);
  if (captured) ctx.errors.push({ path: `${path}.captured`, message: captured });
  if (input.theme !== 'light' && input.theme !== 'dark') {
    ctx.errors.push({ path: `${path}.theme`, message: 'Say whether the app was in its light or dark theme.' });
  }
  if (input.noPersonalData !== true) {
    ctx.errors.push({
      path: `${path}.noPersonalData`,
      message: 'Use screens from the staff demo account only, with no real person’s data, and tick the box that says so.',
    });
  }
  return {
    mediaId: mid ?? '',
    alt,
    captured: typeof input.captured === 'string' ? input.captured : '',
    theme: input.theme === 'dark' ? 'dark' : 'light',
    noPersonalData: true as const,
  };
}

function photoValue(f: PhotoField, input: unknown, path: string, ctx: ValidationContext) {
  if (!present(input)) {
    if (!f.optional) ctx.errors.push({ path, message: 'Pick a photo.' });
    return null;
  }
  if (!isObj(input)) {
    ctx.errors.push({ path, message: 'This photo is malformed.' });
    return null;
  }
  const mid = mediaId(input.mediaId, `${path}.mediaId`, ctx);
  const alt = typeof input.alt === 'string' ? input.alt.trim() : '';
  if (CONTROL.test(alt)) ctx.errors.push({ path: `${path}.alt`, message: 'Remove the hidden character from this text.' });
  checkLength(graphemes(alt), PHOTO_ALT, `${path}.alt`, ctx, 'The description');
  return { mediaId: mid ?? '', alt };
}

function idValue(f: IdField, input: unknown, path: string, ctx: ValidationContext, index: number) {
  if (typeof input !== 'string' || input === '') {
    ctx.errors.push({ path, message: 'Give this a link name (lower-case letters, digits and hyphens).' });
    return '';
  }
  if (f.fixed) {
    const want = f.fixed[index];
    if (input !== want) {
      ctx.errors.push({ path, message: `This one is fixed: its link name is "${want}".` });
    }
    return want ?? input;
  }
  if (input.length > ID_MAX_LENGTH || !ID_PATTERN.test(input)) {
    ctx.errors.push({
      path,
      message: `A link name is lower-case letters, digits and single hyphens, at most ${ID_MAX_LENGTH} characters.`,
    });
    return input;
  }
  if (f.ref) {
    ctx.refs.push({ path, id: input });
    return input;
  }
  if (isReservedId(input)) {
    ctx.errors.push({ path, message: RESERVED_ID_MESSAGE });
    return input;
  }
  const scope = ctx.ids.get(f.scope) ?? [];
  if (scope.some((x) => x.id === input)) {
    ctx.errors.push({ path, message: `The link name "${input}" is used twice on this page.` });
  }
  scope.push({ path, id: input, immutable: f.immutable !== false });
  ctx.ids.set(f.scope, scope);
  return input;
}

/** web/src/content/site/limits.ts: never these labels in a menu (public-e2e, privacy-e2e). */
export const FORBIDDEN_MENU_LABELS = ['Get it on Google Play', 'English'] as const;
export const MENU_URL_MAX_LENGTH = 300;

function menuLinkValue(f: MenuLinkField, input: unknown, path: string, ctx: ValidationContext): StoredMenuLink | null {
  if (!isObj(input)) {
    ctx.errors.push({ path, message: 'This link is malformed.' });
    return null;
  }
  // Unique per list (each footer column is its own list): the built-in menus
  // reuse an id such as "features" across the header, the drawer and the footer.
  const listPath = path.replace(/\[\d+\]$/, '');
  const lid = idValue(id(`menu:${listPath}`, { immutable: false }), input.id, `${path}.id`, ctx, 0);
  const label = plainString(line(f.labelLen[0], f.labelLen[1]), input.label, `${path}.label`, ctx);
  if (FORBIDDEN_MENU_LABELS.some((x) => x.toLowerCase() === label.toLowerCase())) {
    ctx.errors.push({ path: `${path}.label`, message: `"${label}" can’t be a menu label (the site uses it elsewhere).` });
  }
  const t = isObj(input.target) ? input.target : null;
  let target: MenuTarget | null = null;
  const tp = `${path}.target`;
  if (!t) {
    ctx.errors.push({ path: tp, message: 'Say where this link goes.' });
  } else if (t.type === 'path') {
    const check = checkHref(t.path, ctx.siteUrl, 300);
    if (!check.ok || check.kind !== 'path') {
      ctx.errors.push({ path: tp, message: check.ok ? 'A site link starts with "/".' : check.message });
    } else {
      target = { type: 'path', path: check.href };
    }
  } else if (t.type === 'page') {
    if (typeof t.pageId !== 'string' || !UUID.test(t.pageId)) {
      ctx.errors.push({ path: tp, message: 'Pick one of the site’s own pages.' });
    } else target = { type: 'page', pageId: t.pageId.toLowerCase() };
  } else if (t.type === 'category') {
    if (typeof t.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.slug) || t.slug.length > 100) {
      ctx.errors.push({ path: tp, message: 'Pick a news section.' });
    } else target = { type: 'category', slug: t.slug };
  } else if (t.type === 'url') {
    if (!f.allowUrl) {
      ctx.errors.push({ path: tp, message: 'The header’s links stay on this site. Put other sites in the footer.' });
    } else if (typeof t.url !== 'string' || t.url.length > MENU_URL_MAX_LENGTH) {
      ctx.errors.push({ path: tp, message: `A web address can be at most ${MENU_URL_MAX_LENGTH} characters.` });
    } else if (!/^https:\/\//i.test(t.url)) {
      ctx.errors.push({ path: tp, message: 'Links to other sites must start with https://.' });
    } else {
      const check = checkHref(t.url, ctx.siteUrl, MENU_URL_MAX_LENGTH);
      if (!check.ok) ctx.errors.push({ path: tp, message: check.message });
      else target = { type: 'url', url: check.href };
    }
  } else {
    ctx.errors.push({ path: tp, message: 'A link goes to a site page, one of the site’s own pages, a news section or another site.' });
  }
  const out: StoredMenuLink = { id: lid, label, target: target ?? { type: 'path', path: '/' } };
  if (input.lang === 'hi' || input.lang === 'en') out.lang = input.lang;
  else if (present(input.lang) && input.lang !== '') {
    ctx.errors.push({ path: `${path}.lang`, message: 'A label’s language is English (en) or Hindi (hi).' });
  }
  if (present(input.alsoCurrentOn)) {
    if (!f.alsoCurrentOn) {
      // Only primary items light up on other pages; dropped elsewhere.
    } else if (!Array.isArray(input.alsoCurrentOn)) {
      ctx.errors.push({ path: `${path}.alsoCurrentOn`, message: 'This is a list of site paths.' });
    } else {
      checkCount(input.alsoCurrentOn.length, [0, 3], `${path}.alsoCurrentOn`, ctx);
      const paths: string[] = [];
      input.alsoCurrentOn.forEach((p, i) => {
        const check = checkHref(p, ctx.siteUrl, 300);
        if (!check.ok || check.kind !== 'path') {
          ctx.errors.push({ path: `${path}.alsoCurrentOn[${i}]`, message: 'A site path starts with "/".' });
        } else if (!paths.includes(check.href)) paths.push(check.href);
      });
      if (paths.length) out.alsoCurrentOn = paths;
    }
  }
  if (target) ctx.menuLinks.push({ path, list: f.list, link: out });
  return out;
}

/** "titleGateOff" → "Title gate off". */
const humanize = (key: string) => {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function valueOf(f: Field, input: unknown, path: string, ctx: ValidationContext, index = 0): unknown {
  let out: unknown;
  switch (f.kind) {
    case 'line':
    case 'text':
      out = plainString(f, input, path, ctx);
      break;
    case 'inline':
      out = inlineValue(f, input, path, ctx);
      break;
    case 'paras': {
      if (!Array.isArray(input)) {
        if (present(input)) ctx.errors.push({ path, message: 'This is a list of paragraphs.' });
        checkCount(0, f.count, path, ctx);
        out = [];
        break;
      }
      checkCount(input.length, f.count, path, ctx);
      out = input.map((p, i) => inlineValue({ len: f.len, tokens: f.tokens }, p, `${path}[${i}]`, ctx));
      break;
    }
    case 'fact':
      out = factValue(f, input, path, ctx);
      break;
    case 'screen':
      out = screenValue(f, input, path, ctx);
      break;
    case 'photo':
      out = photoValue(f, input, path, ctx);
      break;
    case 'id':
      out = idValue(f, input, path, ctx, index);
      break;
    case 'month':
      if (typeof input !== 'string' || !MONTH.test(input)) {
        ctx.errors.push({ path, message: 'Give the month as YYYY-MM.' });
        out = typeof input === 'string' ? input : '';
      } else out = input;
      break;
    case 'number':
      if (typeof input !== 'number' || !Number.isFinite(input)) {
        ctx.errors.push({ path, message: 'This must be a number.' });
        out = f.range[0];
      } else {
        if (input < f.range[0] || input > f.range[1]) {
          ctx.errors.push({ path, message: `This is a number from ${f.range[0]} to ${f.range[1]}.` });
        }
        out = input;
      }
      break;
    case 'boolean':
      if (input === undefined || input === null) out = f.default;
      else if (typeof input !== 'boolean') {
        ctx.errors.push({ path, message: 'This is yes or no.' });
        out = f.default;
      } else out = input;
      break;
    case 'menuLink':
      out = menuLinkValue(f, input, path, ctx);
      break;
    case 'doc': {
      const { doc: d, info } = normalizeDoc(input, f.profile, ctx.siteUrl, path, ctx.errors);
      ctx.docs.set(path, info);
      for (const m of info.mediaIds) ctx.media.push({ path, mediaId: m });
      out = d ?? { type: 'doc', content: [] };
      break;
    }
    case 'list': {
      if (!Array.isArray(input)) {
        if (present(input)) ctx.errors.push({ path, message: 'This is a list.' });
        if (!f.optional) checkCount(0, f.count, path, ctx);
        out = [];
        break;
      }
      checkCount(input.length, f.count, path, ctx);
      out = input.slice(0, 200).map((item, i) => valueOf(f.of, item, `${path}[${i}]`, ctx, i));
      break;
    }
    case 'group': {
      if (!present(input)) {
        if (f.optional) {
          out = null;
          break;
        }
        ctx.errors.push({ path, message: 'This section is missing.' });
        input = {};
      } else if (!isObj(input)) {
        ctx.errors.push({ path, message: 'This section is malformed.' });
        input = {};
      }
      const src = input as Record<string, unknown>;
      const obj: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(f.fields)) {
        // The enclosing list's index reaches the group's fields (fixed ids).
        obj[k] = valueOf(child, src[k], path ? `${path}.${k}` : k, ctx, index);
      }
      out = obj;
      break;
    }
  }
  if (f.legalLocked) ctx.locked.set(path, out);
  if (f.check) f.check(out, path, ctx);
  return out;
}

/** Validates and normalises a value against a schema (a group at the root). */
export function validateContent(schema: GroupField, input: unknown, ctx: ValidationContext): Record<string, unknown> {
  return valueOf(schema, input, '', ctx) as Record<string, unknown>;
}

/* ── Describing a schema (GET staff/site/content/types; W6's comparison) ──── */

export interface FieldRule {
  kind: Field['kind'];
  of?: 'line' | 'text' | 'inline' | 'fact' | 'id';
  len?: Range;
  count?: Range;
  range?: Range;
  optional?: true;
  legalLocked?: true;
  tokens?: readonly TokenName[];
  pattern?: string;
  note?: string;
}

/**
 * The flat path → rule map, in the shape of web/src/content/site/limits.ts
 * (`[]` = each item of a list), so the two sides can be compared.
 */
export function flatRules(schema: GroupField): Record<string, FieldRule> {
  const out: Record<string, FieldRule> = {};
  const walk = (f: Field, path: string) => {
    const r: FieldRule = { kind: f.kind };
    if (f.optional) r.optional = true;
    if (f.legalLocked) r.legalLocked = true;
    if (f.note) r.note = f.note;
    switch (f.kind) {
      case 'line':
        r.len = f.len;
        if (f.pattern) r.pattern = f.pattern.source;
        break;
      case 'text':
        r.len = f.len;
        break;
      case 'inline':
        r.len = f.len;
        if (f.tokens?.length) r.tokens = f.tokens;
        break;
      case 'paras':
        r.count = f.count;
        r.len = f.len;
        break;
      case 'fact':
        r.of = f.of;
        r.len = f.len;
        if (f.tokens?.length) r.tokens = f.tokens;
        break;
      case 'id':
        r.pattern = ID_PATTERN.source;
        r.len = [1, ID_MAX_LENGTH];
        break;
      case 'number':
        r.range = f.range;
        break;
      case 'month':
        r.pattern = MONTH.source;
        break;
      case 'list':
        r.count = f.count;
        if (f.of.kind === 'fact' || f.of.kind === 'id') r.of = f.of.kind;
        break;
    }
    // Like the web's LIMITS: groups only when optional, no code-owned fixed ids.
    const listed = f.kind === 'group' ? !!f.optional : !(f.kind === 'id' && f.fixed);
    if (path && listed) out[path] = r;
    if (f.kind === 'group') {
      for (const [k, child] of Object.entries(f.fields)) walk(child, path ? `${path}.${k}` : k);
    } else if (f.kind === 'list') {
      if (f.of.kind === 'group') {
        for (const [k, child] of Object.entries(f.of.fields)) walk(child, `${path}[].${k}`);
      } else if (f.of.kind !== 'id') {
        walk(f.of, `${path}[]`);
      }
    } else if (f.kind === 'menuLink') {
      out[`${path}.label`] = { kind: 'line', len: f.labelLen };
      if (f.alsoCurrentOn) out[`${path}.alsoCurrentOn`] = { kind: 'list', count: [0, 3], optional: true };
    }
  };
  walk(schema, '');
  return out;
}

/** The schema as JSON for the portal's SchemaForm: kinds, labels, help, limits. */
export function describe(f: Field, key = ''): Record<string, unknown> {
  const base: Record<string, unknown> = {
    kind: f.kind,
    label: f.label ?? (key ? humanize(key) : ''),
  };
  if (f.help) base.help = f.help;
  if (f.note) base.note = f.note;
  if (f.optional) base.optional = true;
  if (f.legalLocked) base.legalLocked = true;
  switch (f.kind) {
    case 'line':
      return { ...base, len: f.len, ...(f.pattern ? { pattern: f.pattern.source, patternMessage: f.patternMessage } : {}) };
    case 'text':
      return { ...base, len: f.len };
    case 'inline':
      return { ...base, len: f.len, tokens: f.tokens ?? [], marks: f.marks ?? DEFAULT_MARKS };
    case 'paras':
      return { ...base, count: f.count, len: f.len, tokens: f.tokens ?? [] };
    case 'fact':
      return { ...base, of: f.of, len: f.len, tokens: f.tokens ?? [] };
    case 'screen':
      return { ...base, alt: SCREEN_ALT };
    case 'photo':
      return { ...base, alt: PHOTO_ALT };
    case 'id':
      return {
        ...base,
        pattern: ID_PATTERN.source,
        maxLength: ID_MAX_LENGTH,
        ...(f.fixed ? { fixed: f.fixed } : {}),
        ...(f.ref ? { ref: true } : {}),
      };
    case 'month':
      return { ...base, pattern: MONTH.source };
    case 'number':
      return { ...base, range: f.range };
    case 'boolean':
      return { ...base, default: f.default };
    case 'menuLink':
      return { ...base, labelLen: f.labelLen, allowUrl: f.allowUrl, alsoCurrentOn: f.alsoCurrentOn };
    case 'doc':
      return { ...base, profile: f.profile };
    case 'list':
      return { ...base, count: f.count, of: describe(f.of) };
    case 'group':
      return {
        ...base,
        fields: Object.fromEntries(Object.entries(f.fields).map(([k, c]) => [k, describe(c, k)])),
      };
  }
}

/** Plain text of inline content (word counts). */
export function inlinePlain(nodes: readonly InlineNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.text : '')).join('');
}

export const isValidMediaId = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
export { isValidId };
