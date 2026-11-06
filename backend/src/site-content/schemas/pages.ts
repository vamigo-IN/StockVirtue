import type { TokenName } from '../live-values';
import {
  bool,
  doc,
  fact,
  group,
  id,
  inline,
  inlinePlain,
  line,
  list,
  month,
  num,
  paras,
  photo,
  screen,
  text,
  type Field,
  type GroupField,
  type ValidationContext,
} from './fields';
import type { InlineNode } from '../rich/types';

/**
 * The schemas of the six designed pages, the shared block, the legal heads
 * and custom pages (W7 addendum §3.2–§3.9, §3.12), mirrored in
 * web/src/content/site/limits.ts (W6 compares the two, §10.5).
 *
 * Final since M7.2b (5 Nov 2026). The measured slots' maximums are W1's and
 * W2's measurements at the seed and at a maximum-length fixture: each keeps
 * its slot within one line of the seed (the hero H1 two lines from 1024 px).
 * Lowered from the addendum's provisional numbers: home hero.title 56 → 53;
 * features head.summary 200 → 160, chapters[].intro 320 → 285; about
 * why.paragraphs[] 420 → 340, principles.items[].body 200 → 170, notUs.body
 * 400 → 250, company.product 80 → 70, writeToUs.text 160 → 110; faq
 * question 80 → 60 and 24 → 18 questions in all; contact
 * form.collectionNotice 220 → 170, aside.privacy.text and aside.mistake.text
 * 160 → 120. Every other number is the addendum's.
 */

/** Tokens allowed in About's and the FAQ's rich text (§4.2). */
const CONTACT_EMAIL: readonly TokenName[] = ['contact.email'];

/** The designed pages' `seo` (every spec §9.5 description fits: 107–133 characters). */
const SEO = group(
  { title: line(1, 60, { label: 'Title' }), description: line(50, 160, { label: 'Description' }) },
  { label: 'Search and sharing' },
);

/** "Required with a screen; may be empty without one." */
function screenWhatRule(value: unknown, path: string, ctx: ValidationContext) {
  const v = value as { screen?: unknown; screenWhat?: unknown } | null;
  if (!v || ctx.lenient) return;
  if (v.screen && v.screenWhat === '') {
    ctx.errors.push({
      path: `${path}.screenWhat`,
      message: 'Say what the screen shows (5–60 characters), for its caption.',
    });
  }
}

/** The screen kind's rules in one line (§3.1), for the portal; the same note as the web's LIMITS. */
const SCREEN_NOTE =
  'A READY asset; alt 5–300; captured a real date (YYYY-MM-DD) not after today; theme light|dark; noPersonalData must be true.';

const SCREEN_WHAT = line(5, 60, {
  optional: true,
  label: 'What the screen shows',
  note: 'Required with a screen; may be empty without one.',
});

/* ── home (§3.2). Title and description come from Settings → General. ─────── */

/** The home page's fixed card ids (Emerald Terminal, 6 Nov 2026), as in web/src/content/site/types.ts. */
export const HOME_FACT_CARD_IDS = ['money', 'stamped', 'lessons', 'no-risk'] as const;
export const HOME_TRADE_CARD_IDS = ['equity', 'derivatives', 'commodities'] as const;
export const HOME_FEATURE_IDS = ['live-data', 'order-types', 'charges', 'fno-mcx', 'academy', 'rooms'] as const;

export const HOME: GroupField = group({
  hero: group({
    title: line(30, 53, {
      label: 'Headline (H1)',
      note: 'Up to three lines from 1024 px. The words after the last comma are underlined.',
    }),
    lead: fact('text', 120, 190, { label: 'Lead' }),
    howLink: line(8, 30, { label: 'Button to "How a trade works"' }),
    smallPrint: fact('text', 30, 80, { label: 'Small print' }),
    eyebrow: line(3, 40, { label: 'Label above the headline' }),
  }),
  facts: group({
    cards: list(
      4,
      4,
      group(
        {
          id: id('fact-cards', { fixed: HOME_FACT_CARD_IDS, label: 'Link name' }),
          figure: fact('line', 1, 18, { label: 'Figure' }),
          title: line(3, 30, { label: 'Name' }),
          body: fact('text', 20, 90, { label: 'Line' }),
        },
        { label: 'Card' },
      ),
      { label: 'Fact cards', note: 'Ids and order fixed: money, stamped, lessons, no-risk.' },
    ),
  }),
  market: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(10, 40, { label: 'Heading (prices on)' }),
    titleGateOff: line(10, 40, { label: 'News heading (prices off)' }),
    newsTitle: line(5, 30, { label: 'Newsroom heading' }),
    newsLabel: line(3, 20, { label: 'Newsroom side label' }),
    newsLink: line(5, 24, { label: 'Link to the news' }),
    lead: text(20, 160, { label: 'Line under the heading' }),
    allLink: line(5, 24, { label: 'Link to the markets hub' }),
  }),
  heatmap: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(10, 40, { label: 'Heading' }),
    lead: text(20, 160, { label: 'Line under the heading' }),
  }),
  trade: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(10, 50, { label: 'Heading' }),
    lead: fact('text', 20, 160, { label: 'Line under the heading' }),
    cards: list(
      3,
      3,
      group(
        {
          id: id('trade-cards', { fixed: HOME_TRADE_CARD_IDS, label: 'Link name' }),
          title: line(3, 30, { label: 'Heading' }),
          body: fact('text', 20, 160, { label: 'Text' }),
        },
        { label: 'Card' },
      ),
      { label: 'Cards', note: 'Ids and order fixed: equity, derivatives, commodities.' },
    ),
  }),
  features: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(10, 70, { label: 'Heading' }),
    items: list(
      6,
      6,
      group(
        {
          id: id('features', { fixed: HOME_FEATURE_IDS, label: 'Link name' }),
          title: line(3, 30, { label: 'Heading' }),
          body: fact('text', 20, 140, { label: 'Text' }),
        },
        { label: 'Feature' },
      ),
      { label: 'Features', note: 'Ids and order fixed: live-data, order-types, charges, fno-mcx, academy, rooms.' },
    ),
  }),
  ipos: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(5, 40, { label: 'Heading' }),
    lead: text(20, 160, { label: 'Line under the heading' }),
  }),
  stage: group({
    label: line(3, 20, { label: 'Side label' }),
    title: line(20, 70, { label: 'Heading' }),
    steps: list(
      3,
      3,
      group(
        {
          id: id('steps', { label: 'Link name' }),
          label: line(8, 32, { label: 'Tab label' }),
          body: fact('text', 80, 235, { label: 'Text' }),
          screen: screen({ label: 'Screenshot', note: SCREEN_NOTE }),
          callouts: list(
            0,
            3,
            group({
              x: num(0, 100, { label: 'Across (%)' }),
              y: num(0, 100, { label: 'Down (%)' }),
              label: line(3, 32, { label: 'Callout' }),
            }),
            { note: 'Shown only with a screen.' },
          ),
        },
        { label: 'Step' },
      ),
      { label: 'Steps' },
    ),
  }),
  learning: group({
    label: line(3, 20, { label: 'Side label' }),
    title: fact('line', 20, 70, { label: 'Heading' }),
    paragraphs: list(2, 2, fact('text', 60, 260), { label: 'Paragraphs' }),
    board: group({
      label: line(3, 30, { label: 'Side label' }),
      title: line(10, 50, { label: 'Heading' }),
      body: fact('text', 60, 220, { label: 'Text' }),
      phoneBody: fact('text', 40, 140, { label: 'Text on phones' }),
      linkLabel: line(5, 30, { label: 'Link to rooms' }),
    }),
    lessonScreen: screen({ label: 'Lesson screenshot', note: SCREEN_NOTE }),
  }),
  answers: group({
    pricesTitle: line(10, 50, { label: '"How to read a price" heading' }),
    label: line(3, 20, { label: 'Side label' }),
    title: line(5, 40, { label: 'Heading' }),
    items: list(
      3,
      8,
      group(
        {
          id: id('questions', { label: 'Link name' }),
          question: line(5, 60, { label: 'Question' }),
          answer: fact('text', 20, 300, { label: 'Answer' }),
        },
        { label: 'Question' },
      ),
      { label: 'Questions' },
    ),
  }),
  finalCta: group({
    title: fact('line', 20, 50, { label: 'Heading' }),
    line: fact('text', 30, 80, { label: 'Line under it' }),
  }),
  gateOff: group({ homeScreen: screen({ label: 'Home screenshot (prices off)', note: SCREEN_NOTE }) }),
});

/* ── features (§3.3) ──────────────────────────────────────────────────────── */

export const FEATURES_CHAPTER_IDS = ['prices', 'orders', 'fno', 'portfolio', 'learning', 'account'] as const;

export const FEATURES: GroupField = group({
  seo: SEO,
  head: group({
    title: line(5, 40, { label: 'Title (H1)' }),
    summary: fact('text', 60, 160, { label: 'Summary' }),
  }),
  factFile: group({
    caption: line(5, 40, { label: 'Caption' }),
    phoneSummary: line(10, 50, { label: 'Summary on phones' }),
  }),
  chapters: list(
    6,
    6,
    group(
      {
        id: id('chapters', { fixed: FEATURES_CHAPTER_IDS, label: 'Link name' }),
        title: line(5, 40, { label: 'Heading' }),
        tailName: line(5, 40, { label: 'Name in "Show more about …"' }),
        intro: fact('text', 60, 285, { label: 'Introduction' }),
        items: list(
          3,
          5,
          group({
            id: id('items', { label: 'Link name' }),
            title: line(5, 40, { label: 'Heading' }),
            body: fact('text', 30, 220, { label: 'Text' }),
          }),
          { label: 'Items' },
        ),
        screen: screen({ label: 'Screenshot', note: SCREEN_NOTE }),
        screenWhat: SCREEN_WHAT,
      },
      { label: 'Chapter', check: screenWhatRule },
    ),
    { label: 'Chapters', note: 'Ids and order fixed: prices, orders, fno, portfolio, learning, account.' },
  ),
  close: group({ faqLinkLabel: line(10, 40, { label: 'Link to the FAQ' }) }),
});

/* ── about (§3.4) ─────────────────────────────────────────────────────────── */

/** The founder letter: 150–250 words in all (§3.4). */
function founderWords(value: unknown, path: string, ctx: ValidationContext) {
  const v = value as { letter?: InlineNode[][] } | null;
  if (!v || ctx.lenient) return;
  const words = (v.letter ?? [])
    .map((p) => inlinePlain(p))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  if (words < 150 || words > 250) {
    ctx.errors.push({
      path: `${path}.letter`,
      message: `The letter is 150–250 words in all (it has ${words}).`,
    });
  }
}

export const ABOUT: GroupField = group({
  seo: SEO,
  head: group({
    title: line(5, 40, { label: 'Title (H1)' }),
    summary: text(30, 160, { label: 'Summary' }),
  }),
  why: group({
    title: line(5, 40, { label: 'Heading' }),
    paragraphs: list(1, 3, fact('inline', 60, 340, { tokens: CONTACT_EMAIL }), { label: 'Paragraphs' }),
  }),
  founder: group(
    {
      letter: paras([1, 4], [50, 900], { label: 'Letter' }),
      name: line(3, 60, { label: 'Name' }),
      role: line(3, 60, { label: 'Role' }),
      photo: photo({ label: 'Photo', note: 'A READY asset.' }),
    },
    { optional: true, label: 'Founder letter', note: 'All or nothing; 150–250 words in all.', check: founderWords },
  ),
  principles: group({
    title: line(5, 40, { label: 'Heading' }),
    items: list(
      3,
      6,
      group({
        id: id('principles', { label: 'Link name' }),
        // fact<line>, not the addendum table's line: the F40 seed needs a
        // fallback title as well as a fallback body (W7-W, 5 Nov 07:02).
        title: fact('line', 5, 50, {
          label: 'Heading',
          note: 'fact<line> on the web (the addendum table says line): the F40 seed needs a fallback title.',
        }),
        body: fact('inline', 20, 170, { tokens: CONTACT_EMAIL, label: 'Text' }),
      }),
      { label: 'Principles' },
    ),
  }),
  notUs: group({
    title: line(5, 40, { label: 'Heading' }),
    body: inline(80, 250, { legalLocked: true, label: 'Text (legal wording)' }),
  }),
  company: group({
    caption: line(5, 40, { label: 'Caption' }),
    product: line(5, 70, { label: 'Product' }),
    basedIn: line(0, 60, { optional: true, label: 'Based in', note: "'' omits the row." }),
  }),
  timeline: list(
    0,
    12,
    group({
      id: id('timeline', { label: 'Link name' }),
      month: month({ label: 'Month' }),
      event: line(10, 120, { label: 'What happened' }),
    }),
    { optional: true, label: 'Timeline' },
  ),
  writeToUs: group({
    title: line(5, 40, { label: 'Heading' }),
    text: inline(20, 110, { tokens: CONTACT_EMAIL, label: 'Text' }),
  }),
});

/* ── faq (§3.5) ───────────────────────────────────────────────────────────── */

/** The most questions the FAQ may have in all (W2's measurement, M7.2b; the addendum's provisional 24). */
export const FAQ_MAX_QUESTIONS = 18;

/** 4–18 questions in all: each 56 px row lengthens the phone page (§3.5). */
function faqTotal(value: unknown, path: string, ctx: ValidationContext) {
  if (ctx.lenient || !Array.isArray(value)) return;
  const n = value.reduce((sum: number, g: { items?: unknown[] }) => sum + (Array.isArray(g?.items) ? g.items.length : 0), 0);
  if (n < 4 || n > FAQ_MAX_QUESTIONS) {
    ctx.errors.push({ path, message: `The FAQ has 4–${FAQ_MAX_QUESTIONS} questions in all (it has ${n}).` });
  }
}

export const FAQ: GroupField = group({
  seo: SEO,
  head: group({
    title: line(5, 50, { label: 'Title (H1)' }),
    summary: text(20, 120, { label: 'Summary' }),
  }),
  groups: list(
    2,
    5,
    group({
      // Group and question ids are both anchors on /faq: one scope.
      id: id('anchors', { label: 'Link name', note: 'Unique on the page.' }),
      title: line(5, 40, { label: 'Heading' }),
      items: list(
        1,
        10,
        group({
          id: id('anchors', { label: 'Link name', note: 'Unique page-wide.' }),
          question: line(10, 60, { label: 'Question' }),
          answer: list(1, 3, fact('inline', 20, 400, { tokens: CONTACT_EMAIL }), { label: 'Answer' }),
        }),
        { label: 'Questions' },
      ),
    }),
    { label: 'Groups', note: `4–${FAQ_MAX_QUESTIONS} items in all.`, check: faqTotal },
  ),
  notFound: inline(10, 60, { label: '"Didn’t find it?" line' }),
});

/* ── download (§3.6) ──────────────────────────────────────────────────────── */

export const DOWNLOAD: GroupField = group({
  seo: SEO,
  head: group({
    title: line(5, 40, { label: 'Title (H1)' }),
    lead: fact('text', 40, 110, { label: 'Lead' }),
  }),
  play: group({
    minAndroid: line(0, 12, { optional: true, label: 'Needs Android', note: "'' omits the row." }),
    sizeMb: line(0, 6, {
      optional: true,
      label: 'Size (MB)',
      pattern: /^\d{1,4}(\.\d)?$/,
      patternMessage: 'Give the size in MB as a number, like 24 or 24.5.',
      note: "'' omits the row.",
    }),
  }),
  panelScreen: screen({ label: 'Screenshot under the QR code', note: SCREEN_NOTE }),
  firstFive: group({
    title: line(5, 40, { label: 'Heading' }),
    items: list(
      3,
      3,
      group(
        {
          id: id('firstFive', { label: 'Link name' }),
          lead: line(8, 40, { label: 'Lead' }),
          body: fact('text', 30, 140, { label: 'Text' }),
          screen: screen({ label: 'Screenshot', note: SCREEN_NOTE }),
          screenWhat: SCREEN_WHAT,
        },
        { check: screenWhatRule },
      ),
      { label: 'Steps' },
    ),
  }),
  beforeInstall: group({
    title: line(5, 40, { label: 'Heading' }),
    faqIds: list(1, 4, id('faq-ref', { ref: true }), {
      label: 'FAQ answers to show',
      note: 'FAQ item ids that exist (published FAQ, or its default while built-in); a missing one is skipped.',
    }),
  }),
  iphoneNote: fact('inline', 30, 160, { label: 'iPhone note' }),
});

/* ── contact (§3.7) ───────────────────────────────────────────────────────── */

export const CONTACT: GroupField = group({
  seo: SEO,
  head: group({
    title: line(5, 40, { label: 'Title (H1)' }),
    summary: text(20, 120, { label: 'Summary' }),
  }),
  form: group({
    collectionNotice: inline(60, 170, { legalLocked: true, label: 'Collection notice (legal wording)' }),
  }),
  aside: group({
    title: line(5, 30, { label: 'Heading' }),
    privacy: group({
      title: line(5, 40, { label: 'Heading' }),
      text: fact('text', 20, 120, { label: 'Text' }),
      linkLabel: line(5, 30, { label: 'Link to privacy requests' }),
    }),
    mistake: group({
      title: line(5, 40, { label: 'Heading' }),
      text: text(20, 120, { label: 'Text' }),
    }),
  }),
});

/* ── wont-do (§3.9; shared by the home page and /features) ────────────────── */

export const WONT_DO: GroupField = group({
  heading: line(5, 30, { label: 'Heading' }),
  intro: text(30, 120, { label: 'Introduction' }),
  items: list(
    3,
    5,
    group({
      id: id('items', { label: 'Link name' }),
      lead: line(10, 40, { label: 'Lead', note: 'One line at 292 px.' }),
      body: fact('text', 20, 140, { label: 'Text', note: 'A null fallback leaves the lead alone.' }),
    }),
    { label: 'Items' },
  ),
  moreLabel: line(5, 30, { label: 'Link to /features#wont-do' }),
});

/* ── Legal documents (§3.1 legalHead, §3.8, §4) ───────────────────────────── */

/** Heads take text and the site name only (§3.1, §4.2). */
export const HEAD_TOKENS: readonly TokenName[] = ['site.name'];

export function legalSchema(profile: 'privacy-en' | 'privacy-hi' | 'terms' | 'disclaimer' | 'requests'): GroupField {
  return group({
    seo: group(
      {
        title: line(3, 70, { label: 'Title' }),
        description: inline(50, 200, { tokens: HEAD_TOKENS, marks: [], label: 'Description', note: 'Text and tokens only.' }),
      },
      { label: 'Search and sharing' },
    ),
    title: line(3, 80, { label: 'Title (H1)' }),
    summary: inline(20, 240, { tokens: HEAD_TOKENS, marks: [], label: 'Summary', note: 'Text and tokens only.' }),
    body: doc(profile, { label: 'Document', note: 'The profile of the key; DOC_LIMITS.' }),
  });
}

/* ── Custom pages (§3.12) ─────────────────────────────────────────────────── */

export const CUSTOM: GroupField = group({
  title: line(3, 80, { label: 'Title (H1)' }),
  intro: text(0, 300, { optional: true, label: 'Introduction' }),
  body: doc('simple', { label: 'Page text', note: "Profile 'simple'; DOC_LIMITS." }),
  seo: group(
    {
      title: line(0, 60, { optional: true, label: 'Title', note: 'Empty falls back to title.' }),
      description: line(0, 160, { optional: true, label: 'Description', note: 'Empty falls back to intro, then title.' }),
      noindex: bool(false, { label: 'Hide from search engines' }),
    },
    { label: 'Search and sharing' },
  ),
  showUpdated: bool(true, { label: 'Show "Updated" date' }),
});

/** Every field kind used above, for the types endpoint. */
export type AnyField = Field;
