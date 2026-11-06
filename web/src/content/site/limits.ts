/**
 * Field kinds and limits of every editable item (W7 addendum §3.1–§3.12,
 * §4.1, §6.3), mirrored from the backend schemas
 * (backend/src/site-content/schemas/**). W6 compares the two (§10.5).
 *
 * Final since M7.2b (5 Nov 2026). The measured slots' maximums are W1's and
 * W2's measurements at the seed and at a maximum-length fixture (§11.3):
 * each keeps its slot within one line of the seed (the hero H1 two lines
 * from 1024 px). Lowered from the addendum's provisional numbers: home
 * hero.title 56 → 53; features head.summary 200 → 160, chapters[].intro
 * 320 → 285; about why.paragraphs[] 420 → 340, principles.items[].body
 * 200 → 170, notUs.body 400 → 250, company.product 80 → 70, writeToUs.text
 * 160 → 110; faq question 80 → 60 and 24 → 18 questions in all; contact
 * form.collectionNotice 220 → 170, aside.privacy.text and aside.mistake.text
 * 160 → 120. Every other number is the addendum's.
 *
 * Paths are dot paths into the item's content; `[]` is "each item of the
 * list" (e.g. `stage.steps[].label`). Lengths count Unicode graphemes of
 * the visible text, a token counting as 10 (`textLength`, `inlineLength`).
 * Every field is required unless `optional`. A `legalLocked` field needs
 * legal.manage and renders with data-verbatim.
 */

import type { DocProfile, FixedKey, TokenName } from './types';

export type FieldKindName =
  | 'line'
  | 'text'
  | 'inline'
  | 'paras'
  | 'fact'
  | 'screen'
  | 'photo'
  | 'id'
  | 'list'
  | 'group'
  | 'month'
  | 'number'
  | 'boolean'
  | 'menuLink'
  | 'doc';

export interface FieldRule {
  kind: FieldKindName;
  /** `fact`: the kind of its value. `list`: the kind of each item when the items aren't objects. */
  of?: 'line' | 'text' | 'inline' | 'fact' | 'id';
  /** Visible length [min, max] (per paragraph for `paras`). */
  len?: readonly [number, number];
  /** Number of items [min, max] (`list`, `paras`). */
  count?: readonly [number, number];
  /** `number`: the value's range. */
  range?: readonly [number, number];
  optional?: true;
  legalLocked?: true;
  /** The token names an inline field allows (none when absent). */
  tokens?: readonly TokenName[];
  /** A regular expression the value must match (source text). */
  pattern?: string;
  /** Rules a per-field limit can't express. */
  note?: string;
}

export type ItemLimits = Readonly<Record<string, FieldRule>>;

/** A token counts as this many characters. */
export const TOKEN_LENGTH = 10;

const line = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'line',
  len: [min, max],
  ...extra,
});
const text = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'text',
  len: [min, max],
  ...extra,
});
const inline = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'inline',
  len: [min, max],
  ...extra,
});
const fact = (of: 'line' | 'text' | 'inline', min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'fact',
  of,
  len: [min, max],
  ...extra,
});
const list = (min: number, max: number, extra: Partial<FieldRule> = {}): FieldRule => ({
  kind: 'list',
  count: [min, max],
  ...extra,
});
const ID: FieldRule = { kind: 'id', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', len: [1, 60] };
const SCREEN: FieldRule = {
  kind: 'screen',
  optional: true,
  note: 'A READY asset; alt 5–300; captured a real date (YYYY-MM-DD) not after today; theme light|dark; noPersonalData must be true.',
};
/** The designed pages' `seo` (every spec §9.5 description fits: 107–133 characters). */
const SEO: ItemLimits = {
  'seo.title': line(1, 60),
  'seo.description': line(50, 160),
};
/** Tokens allowed in About's and the FAQ's rich text. */
const CONTACT_EMAIL: readonly TokenName[] = ['contact.email'];

/* ── Designed pages ───────────────────────────────────────────────────────── */

const HOME: ItemLimits = {
  'hero.title': line(30, 53, { note: 'Up to three lines from 1024 px. The words after the last comma are underlined.' }),
  'hero.lead': fact('text', 120, 190),
  'hero.howLink': line(8, 30),
  'hero.smallPrint': fact('text', 30, 80),
  'hero.eyebrow': line(3, 40),
  'facts.cards': list(4, 4, { note: 'Ids and order fixed: money, stamped, lessons, no-risk.' }),
  'facts.cards[].figure': fact('line', 1, 18),
  'facts.cards[].title': line(3, 30),
  'facts.cards[].body': fact('text', 20, 90),
  'market.label': line(3, 20),
  'market.title': line(10, 40),
  'market.titleGateOff': line(10, 40),
  'market.newsTitle': line(5, 30),
  'market.newsLabel': line(3, 20),
  'market.newsLink': line(5, 24),
  'market.lead': text(20, 160),
  'market.allLink': line(5, 24),
  'heatmap.label': line(3, 20),
  'heatmap.title': line(10, 40),
  'heatmap.lead': text(20, 160),
  'trade.label': line(3, 20),
  'trade.title': line(10, 50),
  'trade.lead': fact('text', 20, 160),
  'trade.cards': list(3, 3, { note: 'Ids and order fixed: equity, derivatives, commodities.' }),
  'trade.cards[].title': line(3, 30),
  'trade.cards[].body': fact('text', 20, 160),
  'features.label': line(3, 20),
  'features.title': line(10, 70),
  'features.items': list(6, 6, { note: 'Ids and order fixed: live-data, order-types, charges, fno-mcx, academy, rooms.' }),
  'features.items[].title': line(3, 30),
  'features.items[].body': fact('text', 20, 140),
  'ipos.label': line(3, 20),
  'ipos.title': line(5, 40),
  'ipos.lead': text(20, 160),
  'stage.label': line(3, 20),
  'stage.title': line(20, 70),
  'stage.steps': list(3, 3),
  'stage.steps[].id': ID,
  'stage.steps[].label': line(8, 32),
  'stage.steps[].body': fact('text', 80, 235),
  'stage.steps[].screen': SCREEN,
  'stage.steps[].callouts': list(0, 3, { note: 'Shown only with a screen.' }),
  'stage.steps[].callouts[].x': { kind: 'number', range: [0, 100] },
  'stage.steps[].callouts[].y': { kind: 'number', range: [0, 100] },
  'stage.steps[].callouts[].label': line(3, 32),
  'learning.label': line(3, 20),
  'learning.title': fact('line', 20, 70),
  'learning.paragraphs': list(2, 2, { of: 'fact' }),
  'learning.paragraphs[]': fact('text', 60, 260),
  'learning.board.label': line(3, 30),
  'learning.board.title': line(10, 50),
  'learning.board.body': fact('text', 60, 220),
  'learning.board.phoneBody': fact('text', 40, 140),
  'learning.board.linkLabel': line(5, 30),
  'learning.lessonScreen': SCREEN,
  'answers.pricesTitle': line(10, 50),
  'answers.label': line(3, 20),
  'answers.title': line(5, 40),
  'answers.items': list(3, 8),
  'answers.items[].id': ID,
  'answers.items[].question': line(5, 60),
  'answers.items[].answer': fact('text', 20, 300),
  'finalCta.title': fact('line', 20, 50),
  'finalCta.line': fact('text', 30, 80),
  'gateOff.homeScreen': SCREEN,
};

const FEATURES: ItemLimits = {
  ...SEO,
  'head.title': line(5, 40),
  'head.summary': fact('text', 60, 160),
  'factFile.caption': line(5, 40),
  'factFile.phoneSummary': line(10, 50),
  chapters: list(6, 6, { note: 'Ids and order fixed: prices, orders, fno, portfolio, learning, account.' }),
  'chapters[].title': line(5, 40),
  'chapters[].tailName': line(5, 40),
  'chapters[].intro': fact('text', 60, 285),
  'chapters[].items': list(3, 5),
  'chapters[].items[].id': ID,
  'chapters[].items[].title': line(5, 40),
  'chapters[].items[].body': fact('text', 30, 220),
  'chapters[].screen': SCREEN,
  'chapters[].screenWhat': line(5, 60, { optional: true, note: 'Required with a screen; may be empty without one.' }),
  'close.faqLinkLabel': line(10, 40),
};

const ABOUT: ItemLimits = {
  ...SEO,
  'head.title': line(5, 40),
  'head.summary': text(30, 160),
  'why.title': line(5, 40),
  'why.paragraphs': list(1, 3, { of: 'fact' }),
  'why.paragraphs[]': fact('inline', 60, 340, { tokens: CONTACT_EMAIL }),
  founder: { kind: 'group', optional: true, note: 'All or nothing; 150–250 words in all.' },
  'founder.letter': { kind: 'paras', count: [1, 4], len: [50, 900] },
  'founder.name': line(3, 60),
  'founder.role': line(3, 60),
  'founder.photo': { kind: 'photo', note: 'A READY asset.' },
  'principles.title': line(5, 40),
  'principles.items': list(3, 6),
  'principles.items[].id': ID,
  'principles.items[].title': fact('line', 5, 50, {
    note: 'fact<line> on the web (the addendum table says line): the F40 seed needs a fallback title.',
  }),
  'principles.items[].body': fact('inline', 20, 170, { tokens: CONTACT_EMAIL }),
  'notUs.title': line(5, 40),
  'notUs.body': inline(80, 250, { legalLocked: true }),
  'company.caption': line(5, 40),
  'company.product': line(5, 70),
  'company.basedIn': line(0, 60, { optional: true, note: "'' omits the row." }),
  timeline: list(0, 12, { optional: true }),
  'timeline[].id': ID,
  'timeline[].month': { kind: 'month', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  'timeline[].event': line(10, 120),
  'writeToUs.title': line(5, 40),
  'writeToUs.text': inline(20, 110, { tokens: CONTACT_EMAIL }),
};

/** The most questions the FAQ may have in all (W2's measurement, M7.2b; the addendum's provisional 24). */
export const FAQ_MAX_QUESTIONS = 18;

const FAQ: ItemLimits = {
  ...SEO,
  'head.title': line(5, 50),
  'head.summary': text(20, 120),
  groups: list(2, 5, { note: `4–${FAQ_MAX_QUESTIONS} items in all.` }),
  'groups[].id': { ...ID, note: 'Unique on the page.' },
  'groups[].title': line(5, 40),
  'groups[].items': list(1, 10),
  'groups[].items[].id': { ...ID, note: 'Unique page-wide.' },
  'groups[].items[].question': line(10, 60),
  'groups[].items[].answer': list(1, 3, { of: 'fact' }),
  'groups[].items[].answer[]': fact('inline', 20, 400, { tokens: CONTACT_EMAIL }),
  notFound: inline(10, 60),
};

const DOWNLOAD: ItemLimits = {
  ...SEO,
  'head.title': line(5, 40),
  'head.lead': fact('text', 40, 110),
  'play.minAndroid': line(0, 12, { optional: true, note: "'' omits the row." }),
  'play.sizeMb': line(0, 6, { optional: true, pattern: '^\\d{1,4}(\\.\\d)?$', note: "'' omits the row." }),
  panelScreen: SCREEN,
  'firstFive.title': line(5, 40),
  'firstFive.items': list(3, 3),
  'firstFive.items[].id': ID,
  'firstFive.items[].lead': line(8, 40),
  'firstFive.items[].body': fact('text', 30, 140),
  'firstFive.items[].screen': SCREEN,
  'firstFive.items[].screenWhat': line(5, 60, { optional: true, note: 'Required with a screen; may be empty without one.' }),
  'beforeInstall.title': line(5, 40),
  'beforeInstall.faqIds': list(1, 4, {
    of: 'id',
    note: 'FAQ item ids that exist (published FAQ, or its default while built-in); a missing one is skipped.',
  }),
  iphoneNote: fact('inline', 30, 160),
};

const CONTACT: ItemLimits = {
  ...SEO,
  'head.title': line(5, 40),
  'head.summary': text(20, 120),
  'form.collectionNotice': inline(60, 170, { legalLocked: true }),
  'aside.title': line(5, 30),
  'aside.privacy.title': line(5, 40),
  'aside.privacy.text': fact('text', 20, 120),
  'aside.privacy.linkLabel': line(5, 30),
  'aside.mistake.title': line(5, 40),
  'aside.mistake.text': text(20, 120),
};

/* ── The shared block ─────────────────────────────────────────────────────── */

const WONT_DO: ItemLimits = {
  heading: line(5, 30),
  intro: text(30, 120),
  items: list(3, 5),
  'items[].id': ID,
  'items[].lead': line(10, 40, { note: 'One line at 292 px.' }),
  'items[].body': fact('text', 20, 140, { note: 'A null fallback leaves the lead alone.' }),
  moreLabel: line(5, 30),
};

/* ── Menus and footer (§6.3) ──────────────────────────────────────────────── */

/** Σ label widths + n × 20 px + (n − 1) × 4 px at 768 px, Archivo 560 / 15 px. */
export const PRIMARY_WIDTH_BUDGET_PX = 394;
/** An external menu link: https only, at most this long. */
export const MENU_URL_MAX_LENGTH = 300;
/** Labels no menu may use (public-e2e and privacy-e2e hooks). */
export const FORBIDDEN_MENU_LABELS = ['Get it on Google Play', 'English'] as const;

const CHROME: ItemLimits = {
  primary: list(3, 5, {
    note: `Exactly one link to /news; no duplicate targets; no url targets; width budget ${PRIMARY_WIDTH_BUDGET_PX} px at 768 px.`,
  }),
  'primary[]': { kind: 'menuLink' },
  'primary[].label': line(2, 14),
  'primary[].alsoCurrentOn': list(0, 3, { optional: true }),
  drawerMore: list(0, 6),
  'drawerMore[]': { kind: 'menuLink' },
  'drawerMore[].label': line(2, 24),
  drawerLegal: list(1, 4),
  'drawerLegal[]': { kind: 'menuLink' },
  'drawerLegal[].label': line(2, 16),
  'footer.columns': list(4, 4, { note: 'Keys news, app, company, legal, in this order.' }),
  'footer.columns[].title': line(3, 20),
  'footer.columns[].links': list(1, 8, { note: 'The legal column must link /privacy and /terms.' }),
  'footer.columns[].links[]': { kind: 'menuLink' },
  'footer.columns[].links[].label': line(2, 32),
  'footer.legalLine': line(60, 200, { legalLocked: true }),
  'footer.newsLine': line(60, 200, { legalLocked: true }),
  'footer.notBrokerLine': line(30, 120, { legalLocked: true }),
  'footer.companyTail': line(0, 40, { optional: true }),
  'notFound.title': line(10, 50),
  'notFound.line': line(20, 120),
};

/* ── Legal documents and custom pages (§3.1 legalHead, §3.12, §4.1) ───────── */

const LEGAL: ItemLimits = {
  'seo.title': line(3, 70),
  'seo.description': inline(50, 200, { tokens: ['site.name'], note: 'Text and tokens only.' }),
  title: line(3, 80),
  summary: inline(20, 240, { tokens: ['site.name'], note: 'Text and tokens only.' }),
  body: { kind: 'doc', note: 'The profile of the key; DOC_LIMITS.' },
};

const CUSTOM: ItemLimits = {
  title: line(3, 80),
  intro: text(0, 300, { optional: true }),
  body: { kind: 'doc', note: "Profile 'simple'; DOC_LIMITS." },
  'seo.title': line(0, 60, { optional: true, note: 'Empty falls back to title.' }),
  'seo.description': line(0, 160, { optional: true, note: 'Empty falls back to intro, then title.' }),
  'seo.noindex': { kind: 'boolean' },
  showUpdated: { kind: 'boolean' },
};

/** Every item's rules. `legal` applies to each of the five legal keys; `custom` to custom pages. */
export const LIMITS: Readonly<Record<Exclude<FixedKey, 'privacy' | 'privacy-hi' | 'terms' | 'disclaimer' | 'privacy-requests'> | 'legal' | 'custom', ItemLimits>> = {
  home: HOME,
  features: FEATURES,
  about: ABOUT,
  faq: FAQ,
  download: DOWNLOAD,
  contact: CONTACT,
  'wont-do': WONT_DO,
  chrome: CHROME,
  legal: LEGAL,
  custom: CUSTOM,
};

/** Limits of every rich document (§4.1). */
export const DOC_LIMITS = {
  /** The canonical JSON, in UTF-8 bytes (the API's JSON body limit is 100 KB). */
  maxBytes: 90 * 1024,
  maxH2: 60,
  maxTables: 10,
  maxTableColumns: 6,
  maxTableRows: 60,
  maxCellLength: 1000,
  tableCaption: [1, 120] as const,
  /** A token's before / after / else strings. */
  maxTokenAttrLength: 120,
} as const;

/** The tokens each document profile allows (§4.2's "Allowed in" column). */
export const DOC_TOKENS: Readonly<Record<DocProfile, readonly TokenName[]>> = {
  'privacy-en': [
    'site.name', 'site.url', 'site.company', 'site.email', 'contact.email', 'company.legalName',
    'company.postalAddress', 'officer.name', 'officer.email', 'officer.phone', 'privacy.responseDays',
    'notice.version', 'cookies.servicesInUse',
  ],
  'privacy-hi': [
    'site.name', 'site.url', 'site.company', 'site.email', 'contact.email', 'company.legalName',
    'company.postalAddress', 'officer.name', 'officer.email', 'officer.phone', 'privacy.responseDays',
    'notice.version',
  ],
  terms: [
    'site.name', 'site.url', 'site.company', 'site.email', 'contact.email', 'company.legalName',
    'company.postalAddress', 'officer.name', 'officer.email', 'officer.phone', 'privacy.responseDays',
  ],
  disclaimer: [
    'site.name', 'site.url', 'site.company', 'site.email', 'contact.email', 'company.legalName',
    'company.postalAddress', 'officer.name', 'officer.email', 'officer.phone', 'privacy.responseDays',
  ],
  requests: [
    'site.name', 'site.url', 'site.company', 'site.email', 'contact.email', 'company.legalName',
    'company.postalAddress', 'officer.name', 'officer.email', 'officer.phone', 'privacy.responseDays',
  ],
  simple: ['site.name'],
};

/* ── Measuring ────────────────────────────────────────────────────────────── */

let segmenter: Intl.Segmenter | null = null;

/** Length in graphemes, as the API counts it. */
export function textLength(s: string): number {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return Array.from(segmenter.segment(s)).length;
}

/** Visible length of inline content: its text in graphemes, plus TOKEN_LENGTH per token. */
export function inlineLength(value: readonly { type: string; text?: unknown }[]): number {
  let n = 0;
  for (const node of value) {
    if (node.type === 'text' && typeof node.text === 'string') n += textLength(node.text);
    else if (node.type === 'token') n += TOKEN_LENGTH;
  }
  return n;
}
