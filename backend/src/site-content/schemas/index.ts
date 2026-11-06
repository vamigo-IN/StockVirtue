import type { SiteContentKind } from '@prisma/client';
import { TOKEN_NAMES } from '../live-values';
import { DESIGNED_KEYS, FIXED_ITEMS, isFixedKey, type DocProfile } from '../registry';
import { DOC_LIMITS, PROFILES } from '../rich/legal-doc';
import { MAX_CONTENT_BYTES } from '../canonical';
import { ANNOUNCED_VIA, TERMS_MIN_NOTICE_DAYS } from '../terms-notice';
import {
  CHROME,
  FOOTER_KEYS,
  MENU_FIXED_PATHS,
  MENU_PATH_PATTERNS,
  PRIMARY_WIDTH_BUDGET_PX,
} from './chrome';
import { describe, flatRules, FORBIDDEN_MENU_LABELS, MENU_URL_MAX_LENGTH, type GroupField } from './fields';
import { ABOUT, CONTACT, CUSTOM, DOWNLOAD, FAQ, FEATURES, HOME, legalSchema, WONT_DO } from './pages';
import {
  ID_MAX_LENGTH,
  ID_PATTERN,
  RESERVED_ID_MESSAGE,
  RESERVED_ID_PREFIXES,
  RESERVED_IDS,
  RESERVED_SLUGS,
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
} from './reserved-ids';

/** Shape version of every schema below (`schemaVersion` on rows and revisions). */
export const SCHEMA_VERSION = 1;

const DESIGNED: Readonly<Record<(typeof DESIGNED_KEYS)[number], GroupField>> = {
  home: HOME,
  features: FEATURES,
  about: ABOUT,
  faq: FAQ,
  download: DOWNLOAD,
  contact: CONTACT,
};

const LEGAL = {
  'privacy-en': legalSchema('privacy-en'),
  'privacy-hi': legalSchema('privacy-hi'),
  terms: legalSchema('terms'),
  disclaimer: legalSchema('disclaimer'),
  requests: legalSchema('requests'),
} as const;

/** The schema of an item, by its kind and key. */
export function schemaFor(kind: SiteContentKind, key: string): GroupField | null {
  switch (kind) {
    case 'DESIGNED':
      return (DESIGNED as Record<string, GroupField>)[key] ?? null;
    case 'SHARED':
      return key === 'wont-do' ? WONT_DO : null;
    case 'CHROME':
      return CHROME;
    case 'LEGAL': {
      const profile = isFixedKey(key) ? FIXED_ITEMS[key].profile : undefined;
      return profile && profile !== 'simple' ? LEGAL[profile] : null;
    }
    case 'CUSTOM':
      return CUSTOM;
  }
}

/** The document profile of an item (legal keys, custom pages). */
export function profileFor(kind: SiteContentKind, key: string): DocProfile | null {
  if (kind === 'CUSTOM') return 'simple';
  if (kind === 'LEGAL' && isFixedKey(key)) return FIXED_ITEMS[key].profile ?? null;
  return null;
}

/**
 * Shape upgraders, by kind, run on read in the API (and in the web merge).
 * Version 1 is the only shape so far.
 */
export function upgradeContent(_kind: SiteContentKind, _from: number, content: unknown): unknown {
  return content;
}

/* ── The legal-locked fields' built-in text (§3.1) ──────────────────────────
 * Until an item has a row, its "current" text is the web's built-in default.
 * The API keeps these few verbatim lines (spec §9.8: never rewritten) so that
 * someone without legal.manage can still save the first draft of a page as
 * long as the locked text is unchanged. From the web: chrome.ts (from
 * footer-body.tsx), and the about and contact copy of spec §9.5.3 / §9.5.6
 * (W2's about.ts and contact.ts; M7.2b re-checks them). */

const t = (text: string) => ({ type: 'text', text });
const bold = (text: string) => ({ type: 'text', text, marks: [{ type: 'bold' }] });
const link = (text: string, href: string) => ({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] });

export const LOCKED_DEFAULTS: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  chrome: {
    'footer.legalLine':
      'StockVirtue is an educational stock-market simulator. Every trade uses virtual money — not real funds. Nothing here is investment advice.',
    'footer.newsLine':
      'News and explainers on Indian and global markets, from the StockVirtue newsroom. For information and learning only: nothing here is investment advice.',
    'footer.notBrokerLine': 'StockVirtue is an educational trading simulator, not a broker.',
  },
  about: {
    'notUs.body': [
      t('StockVirtue is an educational simulator. It is '),
      bold('not a broker'),
      t(', is not registered with SEBI, and does not facilitate real securities transactions or provide investment advice. See our '),
      link('Risk Disclaimer', '/disclaimer'),
      t(' for details.'),
    ],
  },
  contact: {
    'form.collectionNotice': [
      t('We use your name, email and message only to reply to you, and delete them a year after our last reply. See our '),
      link('privacy notice', '/privacy'),
      t('.'),
    ],
  },
};

/* ── GET staff/site/content/types ─────────────────────────────────────────── */

const HOOKS: Readonly<Record<DocProfile, string[]>> = {
  'privacy-en': [
    'exactly one section heading with the link name "cookies"',
    'at least two tables',
    'a link to /privacy/hi marked as Hindi',
    'a link to /privacy/requests',
    'the notice version, once',
    'the grievance officer’s email',
    'the texts "Digital Personal Data Protection Act, 2023" and "Data Protection Board of India"',
  ],
  'privacy-hi': [
    'exactly one section heading with the link name "cookies"',
    'a link to /privacy marked as English',
    'the notice version, once',
    'the grievance officer’s email',
    'the texts "गोपनीयता" and "डेटा संरक्षण बोर्ड"',
  ],
  terms: ['at least one section heading', 'a link to /privacy'],
  disclaimer: ['at least one section heading'],
  requests: [
    'exactly one request form',
    'the response days',
    'a link to /privacy',
    'the text "Data Protection Board of India"',
  ],
  simple: [],
};

export function typesPayload() {
  const item = (key: string, schema: GroupField) => {
    const fixed = isFixedKey(key) ? FIXED_ITEMS[key] : null;
    return {
      key,
      kind: fixed?.kind ?? 'CUSTOM',
      title: fixed?.title ?? 'Custom page',
      path: fixed?.path ?? null,
      lang: fixed?.lang ?? 'en',
      schema: describe(schema),
      limits: flatRules(schema),
    };
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    maxBytes: MAX_CONTENT_BYTES,
    items: {
      home: item('home', HOME),
      features: item('features', FEATURES),
      about: item('about', ABOUT),
      faq: item('faq', FAQ),
      download: item('download', DOWNLOAD),
      contact: item('contact', CONTACT),
      'wont-do': item('wont-do', WONT_DO),
      chrome: item('chrome', CHROME),
      custom: item('custom', CUSTOM),
    },
    legal: {
      keys: Object.values(FIXED_ITEMS)
        .filter((i) => i.kind === 'LEGAL')
        .map((i) => ({ key: i.key, title: i.title, path: i.path, lang: i.lang, profile: i.profile, showUpdated: i.showUpdated })),
      head: { schema: describe(LEGAL.terms.fields.seo, 'seo'), limits: flatRules(LEGAL.terms) },
      profiles: Object.fromEntries(
        (Object.keys(PROFILES) as DocProfile[]).map((p) => [
          p,
          {
            tokens: PROFILES[p].tokens,
            cookieSettings: PROFILES[p].cookieSettings,
            images: PROFILES[p].images,
            requestForm: PROFILES[p].requestForm,
            requiredAnchors: PROFILES[p].requiredAnchors,
            hooks: HOOKS[p],
          },
        ]),
      ),
      docLimits: DOC_LIMITS,
    },
    terms: {
      /** W7 decision 5: no minimum notice yet (0 = today or earlier). */
      minNoticeDays: TERMS_MIN_NOTICE_DAYS,
      announcedVia: ANNOUNCED_VIA,
    },
    tokens: TOKEN_NAMES,
    reservedIds: {
      pattern: ID_PATTERN.source,
      maxLength: ID_MAX_LENGTH,
      exact: RESERVED_IDS,
      prefixes: RESERVED_ID_PREFIXES,
      message: RESERVED_ID_MESSAGE,
    },
    slugs: {
      pattern: ID_PATTERN.source,
      length: [SLUG_MIN_LENGTH, SLUG_MAX_LENGTH],
      reserved: RESERVED_SLUGS,
    },
    chrome: {
      widthBudgetPx: PRIMARY_WIDTH_BUDGET_PX,
      menuUrlMaxLength: MENU_URL_MAX_LENGTH,
      forbiddenLabels: FORBIDDEN_MENU_LABELS,
      footerKeys: FOOTER_KEYS,
      paths: MENU_FIXED_PATHS,
      pathPatterns: MENU_PATH_PATTERNS.map((r) => r.source),
    },
    facts: { pattern: '^F([1-9]|[1-3]\\d|4[0-2])$' },
  };
}
