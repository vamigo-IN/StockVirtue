import type { DesignedKey } from '@/content/site/types';
import { FaqIdsField } from './FaqIdsField';
import type { FormNode, FormSchema } from './SchemaForm';

/**
 * The forms of the six designed pages (W7 addendum §3.2–§3.7, §8.3): their
 * sections in page order, each with its one-line "where this shows" help,
 * and every field's label. Kinds and limits come from
 * src/content/site/limits.ts (the API's own rules win, GET …/types). What
 * the addendum keeps in code (the readout, the fact file's rows, the chapter
 * ids, the form's labels …) has no field here.
 */

const newId = (items: unknown[], base: string) => {
  const taken = new Set(items.map((i) => (i as { id?: string })?.id));
  let n = items.length + 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

const emptyFact = (inline = false) => ({ value: inline ? [] : '', facts: [], fallback: null });
const title = (key: string) => (it: unknown) => {
  const v = (it as Record<string, unknown> | null)?.[key];
  if (typeof v === 'string') return v;
  const f = (v as { value?: unknown } | null)?.value;
  return typeof f === 'string' ? f : '';
};

const ID_HELP = 'Used for the page’s keys; never shown.';
const SCREEN_HELP = 'Optional. Without a screenshot this part uses its text-only layout.';

/** Search and sharing (the designed pages' `seo`); Home's comes from Settings → General. */
const SEO_SECTION = {
  id: 'seo',
  title: 'Search and sharing',
  help: 'What search engines and link previews show. Not on the page itself.',
  nodes: [
    { node: 'field', path: 'seo.title', label: 'Page title', help: 'Shown in the browser tab as “{title} · StockVirtue”.' },
    { node: 'field', path: 'seo.description', label: 'Description', rows: 3 },
  ] as FormNode[],
};

/* ── home (§3.2) ──────────────────────────────────────────────────────────── */

export const HOME_FORM: FormSchema = {
  limitsKey: 'home',
  sectionPrefix: true,
  sections: [
    {
      id: 'hero',
      title: 'Hero',
      help: 'The emerald band at the top of the home page: the label, the headline, the lead, the two buttons and the small print. The desk beside it is fixed. The page title and description come from Settings → General.',
      nodes: [
        { node: 'field', path: 'hero.eyebrow', label: 'Label above the headline', help: 'Small capitals in a pill.' },
        {
          node: 'field',
          path: 'hero.title',
          label: 'Headline (H1)',
          help: 'Up to three lines from 1024 px, as in the design. The words after the last comma are underlined in green.',
        },
        { node: 'field', path: 'hero.lead', label: 'Lead', help: 'Under the headline: 3 or 4 lines from 1024 px.' },
        {
          node: 'field',
          path: 'hero.howLink',
          label: 'Second button',
          help: 'The outline button to “How a trade works” (#inside-the-app; the target is fixed).',
        },
        { node: 'field', path: 'hero.smallPrint', label: 'Small print', help: 'One or two lines under the buttons, with a shield.' },
      ],
    },
    {
      id: 'facts',
      title: 'Fact cards',
      help: 'The four white cards over the bottom edge of the hero. Their order is fixed, and each keeps its small extra (the balance, the price labels, the modules bar, the shield).',
      nodes: [
        {
          node: 'list',
          path: 'facts.cards',
          label: 'Cards',
          itemName: 'card',
          itemTitle: title('title'),
          fixed: true,
          newItem: () => ({}),
          children: [
            { node: 'field', path: 'figure', label: 'Figure', help: 'The big number or words, such as “₹10 lakh”.' },
            { node: 'field', path: 'title', label: 'Name' },
            { node: 'field', path: 'body', label: 'Line' },
          ],
        },
      ],
    },
    {
      id: 'market',
      title: 'Market overview',
      help: 'Indices, MCX and the rupee, sectors, and gainers and losers. Shown only while the site shows prices.',
      nodes: [
        { node: 'field', path: 'market.label', label: 'Side label' },
        { node: 'field', path: 'market.title', label: 'Heading' },
        { node: 'field', path: 'market.lead', label: 'Line under the heading' },
        { node: 'field', path: 'market.allLink', label: 'Markets link label', help: 'A link to /news/markets (the target is fixed).' },
      ],
    },
    {
      id: 'heatmap',
      title: 'Nifty 50 heatmap',
      help: 'The dark band with the heatmap, its legend and the breadth bar. Shown only under a live data licence.',
      nodes: [
        { node: 'field', path: 'heatmap.label', label: 'Side label' },
        { node: 'field', path: 'heatmap.title', label: 'Heading' },
        { node: 'field', path: 'heatmap.lead', label: 'Line under the heading' },
      ],
    },
    {
      id: 'trade',
      title: 'What you can trade',
      help: 'Equity, F&O and MCX, in three cards. Their order is fixed, and so are the panels in them: real prices while the site shows them (three shares, the NIFTY option chain, the MCX commodities), otherwise the order types, the contracts and the commodities.',
      nodes: [
        { node: 'field', path: 'trade.label', label: 'Side label' },
        { node: 'field', path: 'trade.title', label: 'Heading' },
        { node: 'field', path: 'trade.lead', label: 'Line under the heading' },
        {
          node: 'list',
          path: 'trade.cards',
          label: 'Cards',
          itemName: 'card',
          itemTitle: title('title'),
          fixed: true,
          newItem: () => ({}),
          children: [
            { node: 'field', path: 'title', label: 'Heading' },
            { node: 'field', path: 'body', label: 'Text' },
          ],
        },
      ],
    },
    {
      id: 'features',
      title: 'Features',
      help: 'The grid of six features. Their order is fixed, and each keeps its icon.',
      nodes: [
        { node: 'field', path: 'features.label', label: 'Side label' },
        { node: 'field', path: 'features.title', label: 'Heading' },
        {
          node: 'list',
          path: 'features.items',
          label: 'Features',
          itemName: 'feature',
          itemTitle: title('title'),
          fixed: true,
          newItem: () => ({}),
          children: [
            { node: 'field', path: 'title', label: 'Heading' },
            { node: 'field', path: 'body', label: 'Text' },
          ],
        },
      ],
    },
    {
      id: 'stage',
      title: 'How a trade works',
      help: 'One practice trade in three numbered steps (#inside-the-app), beside a contract note (fixed): worked out with the app’s own charges on today’s prices while the site shows prices, otherwise the lines it lists and when each is charged.',
      nodes: [
        { node: 'field', path: 'stage.label', label: 'Side label' },
        { node: 'field', path: 'stage.title', label: 'Heading', help: 'Three lines on phones.' },
        {
          node: 'list',
          path: 'stage.steps',
          label: 'Steps',
          help: 'Exactly three, in this order.',
          itemName: 'step',
          itemTitle: title('label'),
          newItem: (items) => ({ id: newId(items, 'step'), label: '', body: emptyFact(), screen: null, callouts: [] }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
            { node: 'field', path: 'label', label: 'Step heading' },
            { node: 'field', path: 'body', label: 'Text', help: 'At most five lines on phones.' },
            { node: 'field', path: 'screen', label: 'Screenshot', help: `A small phone frame under the step’s text. ${SCREEN_HELP}` },
            {
              node: 'list',
              path: 'callouts',
              label: 'Callouts',
              help: 'Numbered marks on the screenshot, in % from its top left corner. Shown only with a screenshot.',
              itemName: 'callout',
              itemTitle: title('label'),
              newItem: () => ({ x: 50, y: 50, label: '' }),
              children: [
                { node: 'field', path: 'label', label: 'Label' },
                { node: 'field', path: 'x', label: 'Across (%)' },
                { node: 'field', path: 'y', label: 'Down (%)' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'ipos',
      title: 'IPO watch',
      help: 'The heading over the IPO cards. The issues come from the IPO calendar.',
      nodes: [
        { node: 'field', path: 'ipos.label', label: 'Side label' },
        { node: 'field', path: 'ipos.title', label: 'Heading' },
        { node: 'field', path: 'ipos.lead', label: 'Line under the heading' },
      ],
    },
    {
      id: 'news',
      title: 'News',
      help: 'The lead story and the four after it, from the newsroom.',
      nodes: [
        { node: 'field', path: 'market.newsLabel', label: 'Side label' },
        { node: 'field', path: 'market.newsTitle', label: 'Heading', help: 'While the site shows prices.' },
        {
          node: 'field',
          path: 'market.titleGateOff',
          label: 'Heading without prices',
          help: 'When the site shows no prices. See it with “Gate off” in the preview.',
        },
        { node: 'field', path: 'market.newsLink', label: 'News link label', help: 'A link to /news (the target is fixed).' },
      ],
    },
    {
      id: 'learning',
      title: 'Trading Academy and rooms',
      help: 'The Academy with its seven modules (fixed, from the app), then rooms, beside four fixed steps on how a room works.',
      nodes: [
        { node: 'field', path: 'learning.label', label: 'Side label' },
        { node: 'field', path: 'learning.title', label: 'Heading' },
        {
          node: 'list',
          path: 'learning.paragraphs',
          label: 'Paragraphs',
          help: 'Two, beside the modules.',
          itemName: 'paragraph',
          fixed: true,
          newItem: () => emptyFact(),
          children: [{ node: 'field', path: '', label: 'Text' }],
        },
        { node: 'field', path: 'learning.lessonScreen', label: 'Lesson screenshot', help: `Beside the modules from 1024 px. ${SCREEN_HELP}` },
        { node: 'field', path: 'learning.board.label', label: 'Rooms side label' },
        { node: 'field', path: 'learning.board.title', label: 'Rooms heading' },
        { node: 'field', path: 'learning.board.body', label: 'Rooms text', help: 'From 768 px.' },
        { node: 'field', path: 'learning.board.phoneBody', label: 'Rooms text on phones', help: 'One sentence, below 768 px.' },
        {
          node: 'field',
          path: 'learning.board.linkLabel',
          label: 'Link label',
          help: 'A link to /features#learning (the target is fixed).',
        },
      ],
    },
    {
      id: 'answers',
      title: 'Questions',
      help: 'The questions (the first one starts open), “What it won’t do” (a shared block, edited on its own page) and “How to read a price” (#prices).',
      nodes: [
        { node: 'field', path: 'answers.label', label: 'Side label' },
        { node: 'field', path: 'answers.title', label: 'Heading' },
        {
          node: 'list',
          path: 'answers.items',
          label: 'Questions',
          help: 'Three to eight. The first one starts open.',
          itemName: 'question',
          itemTitle: title('question'),
          newItem: (items) => ({ id: newId(items, 'question'), question: '', answer: emptyFact() }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
            { node: 'field', path: 'question', label: 'Question' },
            { node: 'field', path: 'answer', label: 'Answer', rows: 3 },
          ],
        },
        {
          node: 'field',
          path: 'answers.pricesTitle',
          label: 'Prices heading',
          help: 'The #prices heading, and the summary of its disclosure on phones. Its rows are fixed.',
        },
      ],
    },
    {
      id: 'final',
      title: 'Download band',
      help: 'The emerald band before the footer, with the Google Play badge and the QR code (from 768 px).',
      nodes: [
        { node: 'field', path: 'finalCta.title', label: 'Heading', help: 'Two lines on phones.' },
        { node: 'field', path: 'finalCta.line', label: 'Line under it' },
      ],
    },
    {
      id: 'gate-off',
      title: 'Without prices',
      help: 'Used when the home page can’t draw its live desk: while the site shows no prices (see it with “Gate off” in the preview), or without market data.',
      nodes: [
        {
          node: 'field',
          path: 'gateOff.homeScreen',
          label: 'Home screenshot',
          help: `Beside the headline from 1024 px, in place of the live desk. Without one, the headline has the band to itself. ${SCREEN_HELP}`,
        },
      ],
    },
  ],
};

/* ── features (§3.3) ──────────────────────────────────────────────────────── */

export const FEATURES_FORM: FormSchema = {
  limitsKey: 'features',
  sectionPrefix: true,
  sections: [
    {
      id: 'head',
      title: 'Page head',
      help: 'The H1 and the summary at the top of /features.',
      nodes: [
        { node: 'field', path: 'head.title', label: 'Title (H1)' },
        { node: 'field', path: 'head.summary', label: 'Summary' },
      ],
    },
    {
      id: 'fact-file',
      title: 'The account at a glance',
      help: 'The fact file beside the head. Its rows are fixed; on phones it sits in a disclosure.',
      nodes: [
        { node: 'field', path: 'factFile.caption', label: 'Caption' },
        { node: 'field', path: 'factFile.phoneSummary', label: 'Disclosure summary on phones' },
      ],
    },
    {
      id: 'chapters',
      title: 'Chapters',
      help: 'Six chapters, fixed in order: prices, orders, F&O, portfolio, learning, account. The chart sits in the first, the two diagrams in the second and third.',
      nodes: [
        {
          node: 'list',
          path: 'chapters',
          label: 'Chapters',
          itemName: 'chapter',
          itemTitle: title('title'),
          fixed: true,
          newItem: () => ({}),
          children: [
            { node: 'field', path: 'title', label: 'Title', help: 'The H2, and the label of its jump link.' },
            { node: 'field', path: 'tailName', label: 'Name in the phone tail', help: '“Show {n} more about {this}” on phones.' },
            { node: 'field', path: 'intro', label: 'Intro', help: 'Two or three sentences under the heading.' },
            {
              node: 'list',
              path: 'items',
              label: 'Items',
              help: 'Most important first: phones show two, the rest in the tail.',
              itemName: 'item',
              itemTitle: title('title'),
              newItem: (items) => ({ id: newId(items, 'item'), title: '', body: emptyFact() }),
              children: [
                { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
                { node: 'field', path: 'title', label: 'Title' },
                { node: 'field', path: 'body', label: 'Text' },
              ],
            },
            { node: 'field', path: 'screen', label: 'Screenshot', help: `The sticky phone frame beside the chapter. ${SCREEN_HELP}` },
            {
              node: 'field',
              path: 'screenWhat',
              label: 'What the screenshot shows',
              help: 'Its caption: “{this}, captured on {date}.” Needed with a screenshot.',
            },
          ],
        },
      ],
    },
    {
      id: 'close',
      title: 'Closing link',
      help: 'After “What it won’t do” (a shared block, edited on its own page).',
      nodes: [{ node: 'field', path: 'close.faqLinkLabel', label: 'FAQ link label', help: 'A quiet link to /faq (the target is fixed).' }],
    },
    SEO_SECTION,
  ],
};

/* ── about (§3.4) ─────────────────────────────────────────────────────────── */

export const ABOUT_FORM: FormSchema = {
  limitsKey: 'about',
  sectionPrefix: true,
  sections: [
    {
      id: 'head',
      title: 'Page head',
      help: 'The H1 and the sentence under it.',
      nodes: [
        { node: 'field', path: 'head.title', label: 'Title (H1)' },
        { node: 'field', path: 'head.summary', label: 'Summary' },
      ],
    },
    {
      id: 'why',
      title: 'Why it exists',
      help: 'The first section (#why-it-exists).',
      nodes: [
        { node: 'field', path: 'why.title', label: 'Heading', help: 'The H2, and its label in the page index.' },
        {
          node: 'list',
          path: 'why.paragraphs',
          label: 'Paragraphs',
          help: 'The first keeps its link to SEBI’s study.',
          itemName: 'paragraph',
          newItem: () => emptyFact(true),
          children: [{ node: 'field', path: '', label: 'Text' }],
        },
      ],
    },
    {
      id: 'founder',
      title: 'Founder letter',
      help: 'Optional, all or nothing: the letter (150–250 words in all), the name, the role and a photo, after “Why it exists”.',
      nodes: [
        {
          node: 'group',
          path: 'founder',
          label: 'Founder letter',
          optional: true,
          empty: () => ({ letter: [[]], name: '', role: '', photo: null }),
          children: [
            { node: 'field', path: 'letter', label: 'Letter' },
            { node: 'field', path: 'name', label: 'Name' },
            { node: 'field', path: 'role', label: 'Role' },
            { node: 'field', path: 'photo', label: 'Photo' },
          ],
        },
      ],
    },
    {
      id: 'principles',
      title: 'How we work',
      help: 'The principles (#how-we-work): a heading and one or two lines each.',
      nodes: [
        { node: 'field', path: 'principles.title', label: 'Heading' },
        {
          node: 'list',
          path: 'principles.items',
          label: 'Principles',
          itemName: 'principle',
          itemTitle: title('title'),
          newItem: (items) => ({ id: newId(items, 'principle'), title: emptyFact(), body: emptyFact(true) }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
            { node: 'field', path: 'title', label: 'Title' },
            { node: 'field', path: 'body', label: 'Text' },
          ],
        },
      ],
    },
    {
      id: 'not-us',
      title: 'What we’re not',
      help: 'The panel (#what-were-not). Its text is legal wording: it shows exactly as written.',
      nodes: [
        { node: 'field', path: 'notUs.title', label: 'Heading' },
        { node: 'field', path: 'notUs.body', label: 'Text', help: 'Keeps its link to /disclaimer.' },
      ],
    },
    {
      id: 'company',
      title: 'The company',
      help: 'The fact file (#the-company). Its other rows (company, email, grievance officer, address) come from Settings.',
      nodes: [
        { node: 'field', path: 'company.caption', label: 'Caption' },
        { node: 'field', path: 'company.product', label: 'Product row' },
        { node: 'field', path: 'company.basedIn', label: 'Based in (optional)', help: 'Empty leaves the row out.' },
        {
          node: 'list',
          path: 'timeline',
          label: 'Timeline (optional)',
          help: '“{Month YYYY}: {event}” under the fact file; none leaves it out.',
          itemName: 'event',
          itemTitle: title('event'),
          newItem: (items) => ({ id: newId(items, 'event'), month: '', event: '' }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
            { node: 'field', path: 'month', label: 'Month' },
            { node: 'field', path: 'event', label: 'What happened' },
          ],
        },
      ],
    },
    {
      id: 'write',
      title: 'Write to us',
      help: 'The closing line (#write-to-us).',
      nodes: [
        { node: 'field', path: 'writeToUs.title', label: 'Heading', help: 'Also its label in the page index.' },
        { node: 'field', path: 'writeToUs.text', label: 'Text', help: 'Keeps its link to /contact.' },
      ],
    },
    SEO_SECTION,
  ],
};

/* ── faq (§3.5) ───────────────────────────────────────────────────────────── */

export const FAQ_FORM: FormSchema = {
  limitsKey: 'faq',
  sectionPrefix: true,
  sections: [
    {
      id: 'head',
      title: 'Page head',
      help: 'The H1 and the line under it.',
      nodes: [
        { node: 'field', path: 'head.title', label: 'Title (H1)' },
        { node: 'field', path: 'head.summary', label: 'Summary' },
      ],
    },
    {
      id: 'groups',
      title: 'Questions',
      help: 'Two to five groups, with 4–18 questions in all. Each group has an H2 and a place in the sticky index; each question opens to its answer.',
      nodes: [
        {
          node: 'list',
          path: 'groups',
          label: 'Groups',
          itemName: 'group',
          itemTitle: title('title'),
          newItem: (items) => ({
            id: newId(items, 'group'),
            title: '',
            items: [{ id: newId([], 'question'), question: '', answer: [emptyFact(true)] }],
          }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: 'The group’s anchor on /faq.' },
            { node: 'field', path: 'title', label: 'Heading', help: 'The H2, and its label in the index.' },
            {
              node: 'list',
              path: 'items',
              label: 'Questions',
              itemName: 'question',
              itemTitle: title('question'),
              newItem: (items) => ({ id: newId(items, 'question'), question: '', answer: [emptyFact(true)] }),
              children: [
                {
                  node: 'field',
                  path: 'id',
                  label: 'Link name',
                  help: 'Links to /faq#{this} and the search engines’ FAQ data use it; /download quotes questions by it.',
                },
                { node: 'field', path: 'question', label: 'Question', help: 'The row people tap; one line on phones where it can.' },
                {
                  node: 'list',
                  path: 'answer',
                  label: 'Answer',
                  itemName: 'paragraph',
                  newItem: () => emptyFact(true),
                  children: [{ node: 'field', path: '', label: 'Paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'not-found',
      title: 'Closing line',
      help: 'Under the questions.',
      nodes: [{ node: 'field', path: 'notFound', label: 'Text', help: '“Didn’t find it? Write to us”, with its link to /contact.' }],
    },
    SEO_SECTION,
  ],
};

/* ── download (§3.6) ──────────────────────────────────────────────────────── */

export const DOWNLOAD_FORM: FormSchema = {
  limitsKey: 'download',
  sectionPrefix: true,
  sections: [
    {
      id: 'head',
      title: 'Page head',
      help: 'The H1 and the lead beside the Google Play badge.',
      nodes: [
        { node: 'field', path: 'head.title', label: 'Title (H1)' },
        { node: 'field', path: 'head.lead', label: 'Lead', help: 'Two lines from 1024 px.' },
      ],
    },
    {
      id: 'play',
      title: 'From the Play listing',
      help: 'The two rows under the badge. Empty leaves a row out. Copy them from the live Google Play listing.',
      nodes: [
        { node: 'field', path: 'play.minAndroid', label: 'Needs Android (optional)', help: '“Needs: Android {this} or later”, e.g. 8.0.' },
        { node: 'field', path: 'play.sizeMb', label: 'Size in MB (optional)', help: '“Size: {this} MB”: digits, with one decimal at most (e.g. 18 or 18.5).' },
        { node: 'field', path: 'panelScreen', label: 'Panel screenshot', help: `Under the QR code, from 1024 px. ${SCREEN_HELP}` },
      ],
    },
    {
      id: 'first-five',
      title: 'Your first five minutes',
      help: 'Three columns from 768 px, stacked on phones.',
      nodes: [
        { node: 'field', path: 'firstFive.title', label: 'Heading' },
        {
          node: 'list',
          path: 'firstFive.items',
          label: 'Steps',
          help: 'Exactly three.',
          itemName: 'step',
          itemTitle: title('lead'),
          newItem: (items) => ({ id: newId(items, 'step'), lead: '', body: emptyFact(), screen: null, screenWhat: '' }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: ID_HELP },
            { node: 'field', path: 'lead', label: 'Lead', help: 'The bold start of the step.' },
            { node: 'field', path: 'body', label: 'Text' },
            { node: 'field', path: 'screen', label: 'Screenshot', help: SCREEN_HELP },
            {
              node: 'field',
              path: 'screenWhat',
              label: 'What the screenshot shows',
              help: 'Its caption: “{this}, captured on {date}.” Needed with a screenshot.',
            },
          ],
        },
      ],
    },
    {
      id: 'before-install',
      title: 'Before you install',
      help: 'Questions from the FAQ, answered word for word from it.',
      nodes: [
        { node: 'field', path: 'beforeInstall.title', label: 'Heading' },
        {
          node: 'custom',
          path: 'beforeInstall.faqIds',
          label: 'Questions',
          help: 'One to four, from the published FAQ (its built-in questions until it is published). A question that leaves the FAQ is skipped here.',
          component: FaqIdsField,
        },
      ],
    },
    {
      id: 'iphone',
      title: 'iPhone note',
      help: 'The note at the end, with its link to /contact. Without a confirmed fact it isn’t shown.',
      nodes: [{ node: 'field', path: 'iphoneNote', label: 'Text' }],
    },
    SEO_SECTION,
  ],
};

/* ── contact (§3.7) ───────────────────────────────────────────────────────── */

export const CONTACT_FORM: FormSchema = {
  limitsKey: 'contact',
  sectionPrefix: true,
  sections: [
    {
      id: 'head',
      title: 'Page head',
      help: 'The H1 and the line under it. The form’s labels, hints and messages are fixed.',
      nodes: [
        { node: 'field', path: 'head.title', label: 'Title (H1)' },
        { node: 'field', path: 'head.summary', label: 'Summary' },
      ],
    },
    {
      id: 'form',
      title: 'Under the form',
      help: 'The collection notice under the Send button. It is legal wording: it shows exactly as written.',
      nodes: [{ node: 'field', path: 'form.collectionNotice', label: 'Collection notice', help: 'Keeps its link to /privacy.' }],
    },
    {
      id: 'aside',
      title: 'Other ways',
      help: 'Beside the form from 1024 px, under it on phones. The email and company rows come from Settings.',
      nodes: [
        { node: 'field', path: 'aside.title', label: 'Heading' },
        {
          node: 'group',
          path: 'aside.privacy',
          label: 'Your data',
          children: [
            { node: 'field', path: 'title', label: 'Title' },
            { node: 'field', path: 'text', label: 'Text' },
            { node: 'field', path: 'linkLabel', label: 'Link label', help: 'Links to /privacy/requests (the target is fixed).' },
          ],
        },
        {
          node: 'group',
          path: 'aside.mistake',
          label: 'A mistake in a story',
          children: [
            { node: 'field', path: 'title', label: 'Title' },
            { node: 'field', path: 'text', label: 'Text' },
          ],
        },
      ],
    },
    SEO_SECTION,
  ],
};

export const DESIGNED_FORMS: Readonly<Record<DesignedKey, FormSchema>> = {
  home: HOME_FORM,
  features: FEATURES_FORM,
  about: ABOUT_FORM,
  faq: FAQ_FORM,
  download: DOWNLOAD_FORM,
  contact: CONTACT_FORM,
};

/** The form of a designed page, or null for any other key. */
export function designedForm(key: string): FormSchema | null {
  return Object.prototype.hasOwnProperty.call(DESIGNED_FORMS, key) ? DESIGNED_FORMS[key as DesignedKey] : null;
}
