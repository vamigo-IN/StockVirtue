import type { FormNode, FormSchema } from './SchemaForm';

/**
 * The forms of the items M7.6a edits (W7 addendum §3.9, §3.12, §3.1
 * legalHead, §6.1): sections in page order, labels, and the one-line "where
 * this shows" help. Kinds and limits come from src/content/site/limits.ts.
 * The six designed pages get theirs in M7.6b, once their views exist.
 */

const newId = (items: unknown[], base: string) => {
  const taken = new Set(items.map((i) => (i as { id?: string })?.id));
  let n = items.length + 1;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

/** "What it won't do": the shared block on the home page and /features (§3.9). */
export const WONT_DO_FORM: FormSchema = {
  limitsKey: 'wont-do',
  sections: [
    {
      id: 'block',
      title: 'What it won’t do',
      help: 'Shared: /features shows it in full (id “wont-do”); the home page shows it compact below 768 px, leads only. One edit changes both.',
      nodes: [
        { node: 'field', path: 'heading', label: 'Heading' },
        { node: 'field', path: 'intro', label: 'Intro', help: 'One sentence under the heading.' },
        {
          node: 'list',
          path: 'items',
          label: 'Limits',
          help: 'In this order on both pages.',
          itemName: 'limit',
          itemTitle: (it) => String((it as { lead?: string })?.lead ?? ''),
          newItem: (items) => ({ id: newId(items, 'limit'), lead: '', body: { value: '', facts: [], fallback: null } }),
          children: [
            { node: 'field', path: 'id', label: 'Link name', help: 'Used for the list’s keys; never shown.' },
            { node: 'field', path: 'lead', label: 'Lead', help: 'The bold run-in: one line at 292 px. The compact form shows only leads.' },
            {
              node: 'field',
              path: 'body',
              label: 'Body',
              help: 'Follows the lead. With no other words for an unconfirmed fact, the lead shows alone.',
            },
          ],
        },
        { node: 'field', path: 'moreLabel', label: 'Link label', help: 'The compact form’s link to /features#wont-do (target fixed).' },
      ],
    },
  ],
};

/** The head of every legal document (§3.1 legalHead): metadata, H1, summary. */
export const LEGAL_HEAD_FORM: FormSchema = {
  limitsKey: 'legal',
  sections: [
    {
      id: 'head',
      title: 'Title and summary',
      help: 'The H1 and the summary under it, at the top of the page.',
      nodes: [
        { node: 'field', path: 'title', label: 'Title', help: 'The H1. On /privacy/hi and /privacy/requests also the last breadcrumb.' },
        { node: 'field', path: 'summary', label: 'Summary', plain: true, help: 'Text and the site name only.' },
      ],
    },
    {
      id: 'seo',
      title: 'Search and sharing',
      help: 'What search engines and link previews show.',
      nodes: [
        { node: 'field', path: 'seo.title', label: 'Page title', help: 'Shown as “{title} · StockVirtue”.' },
        { node: 'field', path: 'seo.description', label: 'Description', plain: true },
      ],
    },
  ],
};

/** A custom page's template (§3.12). */
export const CUSTOM_FORM: FormSchema = {
  limitsKey: 'custom',
  sections: [
    {
      id: 'head',
      title: 'Title and intro',
      help: 'The H1 and the summary under it. With two or more headings the page gets a contents list.',
      nodes: [
        { node: 'field', path: 'title', label: 'Title', help: 'The H1, and the name in the Pages list.' },
        { node: 'field', path: 'intro', label: 'Intro (optional)', rows: 3 },
        { node: 'field', path: 'showUpdated', label: 'Show “Updated {date}”', help: 'The date of the latest publish, under the title.' },
      ],
    },
    {
      id: 'seo',
      title: 'Search and sharing',
      help: 'Empty fields use the title and the intro.',
      nodes: [
        { node: 'field', path: 'seo.title', label: 'Page title (optional)' },
        { node: 'field', path: 'seo.description', label: 'Description (optional)', rows: 2 },
        { node: 'field', path: 'seo.noindex', label: 'Hide from search engines', help: 'Adds noindex and leaves the page out of the sitemap.' },
      ],
    },
  ],
};

/** The chrome's texts (§6.1, §6.3): the footer lines and the root 404. */
export const CHROME_TEXTS_FORM: FormSchema = {
  limitsKey: 'chrome',
  sections: [
    {
      id: 'footer-lines',
      title: 'Footer lines',
      help: 'The three lines are legal text: they render as written (data-verbatim) and need the legal.manage permission.',
      nodes: [
        { node: 'field', path: 'footer.legalLine', label: 'Line on the home and site pages', rows: 2 },
        { node: 'field', path: 'footer.newsLine', label: 'Line on news pages', rows: 2 },
        { node: 'field', path: 'footer.notBrokerLine', label: 'Not-a-broker line (every page)' },
        { node: 'field', path: 'footer.companyTail', label: 'After the company name', help: '“© {year} {company} · {this}”, e.g. “Made in India”.' },
      ],
    },
    {
      id: 'not-found',
      title: '404 page',
      help: 'The root “page not found” page. Its links and search box stay as they are.',
      nodes: [
        { node: 'field', path: 'notFound.title', label: 'Heading' },
        { node: 'field', path: 'notFound.line', label: 'Line under it' },
      ],
    },
  ],
};

const LINK_LABELS: FormNode[] = [
  { node: 'field', path: 'label', label: 'Label' },
  { node: 'field', path: 'target', label: 'Link' },
  { node: 'field', path: 'lang', label: 'Language' },
  { node: 'field', path: 'alsoCurrentOn', label: 'Also current on' },
];
const linkList = (path: string, label: string): FormNode => ({
  node: 'list',
  path,
  label,
  itemName: 'link',
  newItem: () => ({}),
  children: LINK_LABELS,
});

/**
 * Labels only, for the history's and the publish dialog's "what changed"
 * lines of the chrome (the Menus & footer editor draws its own controls).
 */
export const CHROME_LABEL_FORM: FormSchema = {
  limitsKey: 'chrome',
  sections: [
    { id: 'header', title: 'Header', nodes: [linkList('primary', 'Header menu')] },
    {
      id: 'phone',
      title: 'Phone menu',
      nodes: [linkList('drawerMore', 'Phone menu › More'), linkList('drawerLegal', 'Phone menu › legal row')],
    },
    {
      id: 'footer',
      title: 'Footer',
      nodes: [
        {
          node: 'list',
          path: 'footer.columns',
          label: 'Footer column',
          itemName: 'column',
          newItem: () => ({}),
          children: [{ node: 'field', path: 'title', label: 'Title' }, linkList('links', 'Links')],
        },
      ],
    },
    ...CHROME_TEXTS_FORM.sections,
  ],
};
