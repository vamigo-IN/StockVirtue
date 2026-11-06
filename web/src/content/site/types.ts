/**
 * The content contract of the admin-managed public site (W7 addendum §3, §4,
 * §6, §7.1): one type per editable item, written from the addendum's tables.
 * W1 and W2 type their page defaults against these (`src/content/site/<key>.ts`),
 * the portal edits them, and the API (backend/src/site-content/schemas/**)
 * validates the same shapes with the limits in ./limits.ts.
 *
 * Shapes are the PUBLIC ones: what `GET /api/v1/site/content/:key` returns
 * and what a page's view receives. Media are already resolved there
 * (`SiteScreen`, `SitePhoto`, or `null` for a missing asset); the stored
 * forms with media ids are `ScreenRef` and `PhotoRef` (portal and API only).
 *
 * Rules every default follows (so `mergeContent` can do its job, §3.11):
 * - every key of the type is present, also the optional ones: `null` for an
 *   absent object (a screen, a photo, the founder letter), `''` for an empty
 *   optional line, `[]` for an empty list. The merge ignores keys the default
 *   doesn't have, so a key missing from the default can never be published;
 * - rich text is never an HTML string: `Inline` is TipTap/ProseMirror JSON
 *   (the content array of one paragraph), rendered by `RichInline` into React
 *   elements;
 * - a slot that states a product fact is a `Fact<…>` with its fact ids as
 *   data (`facts: ['F1']`), rendered by `FactText` through `withFacts`.
 *
 * Plain data: no imports beyond types, so server and client code (the
 * portal) can both use it.
 */

import type { FactId } from '@/content/app';

/* ── Keys and kinds (§0.1, §2.1) ──────────────────────────────────────────── */

export const DESIGNED_KEYS = ['home', 'features', 'about', 'faq', 'download', 'contact'] as const;
export const SHARED_KEYS = ['wont-do'] as const;
export const CHROME_KEY = 'chrome' as const;
export const LEGAL_KEYS = ['privacy', 'privacy-hi', 'terms', 'disclaimer', 'privacy-requests'] as const;

/** The six designed pages (kind DESIGNED). */
export type DesignedKey = (typeof DESIGNED_KEYS)[number];
/** Shared blocks (kind SHARED): "What it won't do" on the home page and /features. */
export type SharedKey = (typeof SHARED_KEYS)[number];
/** Menus, footer texts and the root 404's heading and line (kind CHROME). */
export type ChromeKey = typeof CHROME_KEY;
/** The five legal documents (kind LEGAL). */
export type LegalKey = (typeof LEGAL_KEYS)[number];
/** Every fixed key. Custom pages are keyed by their row's UUID and found by slug. */
export type FixedKey = DesignedKey | SharedKey | ChromeKey | LegalKey;
/** The keys `GET /api/v1/site/content/:key` serves (every fixed key but `chrome`). */
export type ContentKey = DesignedKey | SharedKey | LegalKey;

/** `SiteContentKind` in the Prisma schema. */
export type ContentKind = 'DESIGNED' | 'SHARED' | 'CHROME' | 'LEGAL' | 'CUSTOM';
/** `SiteRevisionChange` in the Prisma schema. */
export type RevisionChange = 'SEED' | 'EDIT' | 'MINOR' | 'MATERIAL' | 'SETTINGS';

/* ── Field kinds (§3.1) ───────────────────────────────────────────────────── */

/** `line(min–max)`: trimmed, no line breaks or control characters. */
export type Line = string;
/** `text(min–max)`: as `line`, one paragraph. */
export type Text = string;
/** `id`: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, at most 60, not reserved (./reserved-ids.ts). */
export type ContentId = string;
/** 'YYYY-MM' (About's timeline). */
export type YearMonth = string;

/**
 * The closed token catalogue (§4.2). Which names a field allows is in
 * ./limits.ts (`tokens`); legal documents resolve them from the revision's
 * `liveValues`, designed pages from `resolveLiveValues(settings)`
 * (src/lib/site-content/tokens.ts).
 */
export type TokenName =
  | 'site.name'
  | 'site.url'
  | 'site.company'
  | 'site.email'
  | 'contact.email'
  | 'company.legalName'
  | 'company.postalAddress'
  | 'officer.name'
  | 'officer.email'
  | 'officer.phone'
  | 'privacy.responseDays'
  | 'notice.version'
  | 'cookies.servicesInUse';

/** Token values by name: the API's `liveValues`, or the web resolver's. */
export type LiveValues = Partial<Record<TokenName, string>>;

/**
 * A token's attributes (§4.1). Rendered as `before + value + after` when the
 * value is non-empty, else `else` (or nothing). `as: 'mailto'` makes the
 * value a mailto: link. Each string is plain text, at most 120 characters.
 * TipTap writes unset attributes as null.
 */
export type TokenAttrs = {
  name: TokenName;
  before?: string | null;
  after?: string | null;
  else?: string | null;
  as?: 'text' | 'mailto' | null;
};

/** A link mark: `href` by the site-content href rule (src/lib/site-content/href.ts). */
export type LinkMark = { type: 'link'; attrs: { href: string; lang?: 'en' | 'hi' | null } };
/** Marks allowed in designed-page `inline` fields. */
export type InlineMark = { type: 'bold' } | { type: 'italic' } | LinkMark;

/** A run of text (TipTap's text node). */
export type InlineText = { type: 'text'; text: string; marks?: InlineMark[] };
/** A live value (§4.2). Like a text node, it may carry marks (a bold value). */
export type InlineToken = { type: 'token'; attrs: TokenAttrs; marks?: InlineMark[] };
export type InlineNode = InlineText | InlineToken;

/**
 * `inline(min–max, tokens?)`: one paragraph of rich text, as TipTap stores a
 * paragraph's `content`. Example (About's "Write to us" line):
 *   [{ type: 'text', text: 'For questions about the app, a story or your data, ' },
 *    { type: 'text', text: 'write to us', marks: [{ type: 'link', attrs: { href: '/contact' } }] },
 *    { type: 'text', text: '.' }]
 */
export type Inline = InlineNode[];

/** `paras(a–b, each min–max)`: one `<p>` per item. */
export type Paras = Inline[];

/** Inline with no marks: text and tokens only (legal heads, headings). */
export type PlainText = { type: 'text'; text: string };
export type PlainToken = { type: 'token'; attrs: TokenAttrs };
export type PlainInline = (PlainText | PlainToken)[];

/**
 * `fact<K>`: copy that states product facts. `withFacts(facts, value,
 * fallback)` renders `value` while every fact is confirmed, else `fallback`;
 * a `null` (or absent) fallback drops the element. Ids are F1–F42
 * (src/content/app.ts). Example:
 *   { value: 'An iPhone version is planned, with no date yet.', facts: ['F15'], fallback: null }
 */
export type Fact<V> = { value: V; facts: FactId[]; fallback?: V | null };
export type FactLine = Fact<Line>;
export type FactTextField = Fact<Text>;
export type FactInline = Fact<Inline>;

/**
 * `screen`, as served (resolved by the API; `null` when the asset is missing
 * or none is set). Structurally a `Screen` (src/content/screens.ts), so it
 * can go straight to DeviceFrame. Views: content first, `SCREENS` second,
 * else the text-only layout (§11.3).
 */
export type SiteScreen = {
  src: string;
  width: number;
  height: number;
  srcSet?: string;
  alt: string;
  /** Capture date, YYYY-MM-DD. */
  captured: string;
  theme: 'light' | 'dark';
};
/** `screen` as stored (portal and API). `noPersonalData` must be true (M0.S rule). */
export type ScreenRef = {
  mediaId: string;
  alt: string;
  captured: string;
  theme: 'light' | 'dark';
  noPersonalData: true;
};

/** `photo`, as served (the w480 variant), or `null`. */
export type SitePhoto = {
  src: string;
  width: number | null;
  height: number | null;
  srcSet?: string;
  alt: string;
};
/** `photo` as stored (portal and API). */
export type PhotoRef = { mediaId: string; alt: string };

/** `seo` (designed pages): through `pageMetadata()`. */
export type Seo = { title: Line; description: Line };

/** A numbered callout on a home-stage screen, in % of the screen. */
export type Callout = { x: number; y: number; label: Line };

/* ── home (§3.2). Title and description come from Settings → General. ─────── */

export type HomeStep = {
  /** `search`, `order`, `pnl` in the seed. */
  id: ContentId;
  label: Line;
  body: FactTextField;
  screen: SiteScreen | null;
  /** Shown only with a screen. */
  callouts: Callout[];
};

/** The four fact cards under the hero (Emerald Terminal, 6 Nov 2026): ids and order fixed. */
export const HOME_FACT_CARD_IDS = ['money', 'stamped', 'lessons', 'no-risk'] as const;
/** The three "What you can trade" cards: ids and order fixed. */
export const HOME_TRADE_CARD_IDS = ['equity', 'derivatives', 'commodities'] as const;
/** The six feature tiles: ids and order fixed (each has its icon in code). */
export const HOME_FEATURE_IDS = ['live-data', 'order-types', 'charges', 'fno-mcx', 'academy', 'rooms'] as const;

/** A fact card: the big figure, its name and one line. Its small extra (balance, stamps, modules, shield) is code. */
export type HomeFactCard = { id: ContentId; figure: FactLine; title: Line; body: FactTextField };
/** A "What you can trade" card. Its panel (real prices while the site shows them, else words) is code. */
export type HomeTradeCard = { id: ContentId; title: Line; body: FactTextField };
/** A feature tile. */
export type HomeFeature = { id: ContentId; title: Line; body: FactTextField };
/** A home FAQ item (a `<details>`; the first one opens). */
export type HomeQuestion = { id: ContentId; question: Line; answer: FactTextField };

export type HomeContent = {
  hero: {
    title: Line;
    lead: FactTextField;
    /** The secondary button to #inside-the-app, "How a trade works" (target fixed in code). */
    howLink: Line;
    smallPrint: FactTextField;
    /** The mono label above the H1. */
    eyebrow: Line;
  };
  /** The four fact cards over the hero's bottom edge. */
  facts: { cards: HomeFactCard[] };
  market: {
    label: Line;
    title: Line;
    /** The news section's heading while the site shows no prices. */
    titleGateOff: Line;
    newsTitle: Line;
    /** The news section's mono label. */
    newsLabel: Line;
    /** The quiet link to /news (target fixed). */
    newsLink: Line;
    /** One line under the market overview's heading. */
    lead: Text;
    /** The link to /news/markets (target fixed). */
    allLink: Line;
  };
  /** The Nifty 50 heatmap band (shown only under a LIVE licence). */
  heatmap: { label: Line; title: Line; lead: Text };
  /** "What you can trade": equity, F&O and MCX. */
  trade: { label: Line; title: Line; lead: FactTextField; cards: HomeTradeCard[] };
  /** The grid of six features. */
  features: { label: Line; title: Line; items: HomeFeature[] };
  stage: {
    label: Line;
    title: Line;
    /** Exactly three. */
    steps: HomeStep[];
  };
  /** IPO watch's heading (the data is the IPO board's). */
  ipos: { label: Line; title: Line; lead: Text };
  learning: {
    label: Line;
    title: FactLine;
    /** Exactly two (desktop P1 and P2). */
    paragraphs: FactTextField[];
    board: {
      /** The rooms section's mono label. */
      label: Line;
      title: Line;
      body: FactTextField;
      phoneBody: FactTextField;
      /** The quiet link to /features#learning (target fixed). */
      linkLabel: Line;
    };
    lessonScreen: SiteScreen | null;
  };
  answers: {
    pricesTitle: Line;
    label: Line;
    title: Line;
    /** Three to eight questions; the first one opens. */
    items: HomeQuestion[];
  };
  finalCta: { title: FactLine; line: FactTextField };
  gateOff: { homeScreen: SiteScreen | null };
};

/* ── features (§3.3) ──────────────────────────────────────────────────────── */

/** The six chapters' ids and order are fixed. */
export const FEATURES_CHAPTER_IDS = ['prices', 'orders', 'fno', 'portfolio', 'learning', 'account'] as const;
export type FeaturesChapterId = (typeof FEATURES_CHAPTER_IDS)[number];

export type FeaturesItem = { id: ContentId; title: Line; body: FactTextField };

export type FeaturesChapter = {
  id: FeaturesChapterId;
  title: Line;
  /** "Show {n} more about {tailName}" on phones. */
  tailName: Line;
  intro: FactTextField;
  /** 3–5, most important first; phones show two, the rest in the tail. */
  items: FeaturesItem[];
  screen: SiteScreen | null;
  /** "{screenWhat}, captured on {date}." Required with a screen. */
  screenWhat: Line;
};

export type FeaturesContent = {
  seo: Seo;
  head: { title: Line; summary: FactTextField };
  /** The fact file's rows are code (FACT_FILE_ROWS). */
  factFile: { caption: Line; phoneSummary: Line };
  /** Exactly six, in FEATURES_CHAPTER_IDS order. */
  chapters: FeaturesChapter[];
  /** The quiet link to /faq (target fixed). */
  close: { faqLinkLabel: Line };
};

/* ── about (§3.4) ─────────────────────────────────────────────────────────── */

/**
 * A "How we work" principle. `title` is a `fact<line>` (not the table's
 * `line`) because the seed's fifth principle (F40) needs a fallback title as
 * well as a fallback body ("We fix mistakes.", spec §9.5.3).
 */
export type AboutPrinciple = { id: ContentId; title: FactLine; body: FactInline };

export type AboutFounder = {
  /** 1–4 paragraphs; 150–250 words in all. */
  letter: Paras;
  name: Line;
  role: Line;
  photo: SitePhoto | null;
};

export type AboutTimelineEntry = { id: ContentId; month: YearMonth; event: Line };

export type AboutContent = {
  seo: Seo;
  head: { title: Line; summary: Text };
  why: {
    title: Line;
    /** 1–3; P1 carries the SEBI link as a link mark. */
    paragraphs: FactInline[];
  };
  /** Optional, all or nothing; `null` until the owner supplies it. */
  founder: AboutFounder | null;
  principles: { title: Line; items: AboutPrinciple[] };
  /** `body` is legal-locked (legal.manage) and renders with data-verbatim. */
  notUs: { title: Line; body: Inline };
  company: {
    caption: Line;
    product: Line;
    /** '' = the row is omitted. */
    basedIn: Line;
  };
  /** [] = the block is omitted. */
  timeline: AboutTimelineEntry[];
  writeToUs: { title: Line; text: Inline };
};

/* ── faq (§3.5) ───────────────────────────────────────────────────────────── */

export type FaqItem = {
  /** Unique page-wide: the `<details id>`, shared links /faq#…, FAQPage JSON-LD. */
  id: ContentId;
  question: Line;
  /** 1–3 paragraphs; tokens: contact.email. */
  answer: FactInline[];
};

export type FaqGroup = { id: ContentId; title: Line; items: FaqItem[] };

export type FaqContent = {
  seo: Seo;
  head: { title: Line; summary: Text };
  /** 2–5 groups, 4–24 items in all. */
  groups: FaqGroup[];
  /** "Didn't find it? Write to us" (link to /contact). */
  notFound: Inline;
};

/* ── download (§3.6) ──────────────────────────────────────────────────────── */

export type DownloadMinute = {
  id: ContentId;
  lead: Line;
  body: FactTextField;
  screen: SiteScreen | null;
  /** Required with a screen. */
  screenWhat: Line;
};

export type DownloadContent = {
  seo: Seo;
  head: { title: Line; lead: FactTextField };
  /** The two Play-listing rows; '' = the row is omitted. `sizeMb` matches ^\d{1,4}(\.\d)?$. */
  play: { minAndroid: Line; sizeMb: Line };
  panelScreen: SiteScreen | null;
  /** Exactly three items. */
  firstFive: { title: Line; items: DownloadMinute[] };
  /** FAQ item ids (1–4), answered word for word from the FAQ; a missing one is skipped. */
  beforeInstall: { title: Line; faqIds: ContentId[] };
  iphoneNote: FactInline;
};

/* ── contact (§3.7) ───────────────────────────────────────────────────────── */

export type ContactContent = {
  seo: Seo;
  head: { title: Line; summary: Text };
  /** Legal-locked, data-verbatim. */
  form: { collectionNotice: Inline };
  aside: {
    title: Line;
    /** The link target is fixed: /privacy/requests. */
    privacy: { title: Line; text: FactTextField; linkLabel: Line };
    mistake: { title: Line; text: Text };
  };
};

/* ── wont-do (§3.9; shared by the home page and /features) ────────────────── */

export type WontDoItem = {
  id: ContentId;
  /** The bold run-in lead (one line at 292 px: the compact form shows only leads). */
  lead: Line;
  /** A `null` fallback leaves the lead alone. */
  body: FactTextField;
};

export type WontDoContent = {
  heading: Line;
  intro: Text;
  /** 3–5, in this order on both pages. */
  items: WontDoItem[];
  /** The compact form's link (target fixed: /features#wont-do). */
  moreLabel: Line;
};

/* ── chrome (§6.1): menus, footer texts, the root 404 ─────────────────────── */

export type MenuTarget =
  /** A site route, e.g. "/news/markets" or "/news/feed.xml". */
  | { type: 'path'; path: string }
  /** A custom page by id; the API resolves it to "/<slug>". */
  | { type: 'page'; pageId: string }
  /** A news category: newsPath.category(slug). */
  | { type: 'category'; slug: string }
  /** External, https only. */
  | { type: 'url'; url: string };

export type MenuLink = {
  /** Stable, for React keys and diffs. */
  id: ContentId;
  label: Line;
  target: MenuTarget;
  /** The label's language when it isn't English (the Hindi notice). */
  lang?: 'hi' | 'en';
  /** Primary items only: extra paths that make it current (at most 3). */
  alsoCurrentOn?: string[];
};

export type FooterColumnKey = 'news' | 'app' | 'company' | 'legal';

export type ChromeFooterColumn = { key: FooterColumnKey; title: Line; links: MenuLink[] };

export type ChromeContent = {
  /** The header nav, the drawer's primary rows and the 404 header. */
  primary: MenuLink[];
  /** The drawer's "More" rows. */
  drawerMore: MenuLink[];
  /** The drawer's legal mini-row. */
  drawerLegal: MenuLink[];
  footer: {
    /** Exactly four, keyed news, app, company, legal, in this order. */
    columns: ChromeFooterColumn[];
    /** Home and site pages. Legal-locked, data-verbatim. */
    legalLine: Line;
    /** News pages. Legal-locked, data-verbatim. */
    newsLine: Line;
    /** Every page. Legal-locked, data-verbatim. */
    notBrokerLine: Line;
    /** "© {year} {SITE.company} · {companyTail}". */
    companyTail: Line;
  };
  /** The root 404's heading and line. */
  notFound: { title: Line; line: Line };
};

/* ── Rich documents (§4.1): legal documents and custom pages ──────────────── */

/** Marks in documents: the inline set plus `code`. */
export type DocMark = InlineMark | { type: 'code' };
export type DocText = { type: 'text'; text: string; marks?: DocMark[] };
export type DocToken = { type: 'token'; attrs: TokenAttrs; marks?: DocMark[] };
/** withFullStop on the text rendered before it: trailing whitespace dropped, then "." unless it already ends with one. */
export type DocStop = { type: 'stop'; marks?: DocMark[] };
export type DocHardBreak = { type: 'hardBreak' };
/** privacy-en only: `before` + the Cookie settings button + `after`, while optional services are on. */
export type DocCookieSettings = {
  type: 'cookieSettings';
  attrs?: { before?: string | null; after?: string | null };
};
export type DocInlineNode = DocText | DocToken | DocStop | DocHardBreak | DocCookieSettings;
/** A paragraph's content in a document (a superset of `Inline`). */
export type DocInline = DocInlineNode[];

export type DocParagraph = {
  type: 'paragraph';
  /** 'note': the small muted style of the terms' template note. */
  attrs?: { variant?: 'note' | null };
  content?: DocInline;
};
export type DocHeading = {
  type: 'heading';
  /** `anchor` is required on H2 (stored, server-rendered as the id). */
  attrs: { level: 2 | 3; anchor?: string | null };
  /** Text without marks, and tokens; no links. */
  content?: PlainInline;
};
export type DocListItem = { type: 'listItem'; content: (DocParagraph | DocBulletList | DocOrderedList)[] };
export type DocBulletList = { type: 'bulletList'; content: DocListItem[] };
export type DocOrderedList = { type: 'orderedList'; attrs?: { start?: number | null }; content: DocListItem[] };
/** Header cells hold one paragraph of plain text (TipTap's cell content, restricted). */
export type DocTableHeader = { type: 'tableHeader'; content: DocParagraph[] };
/** Body cells hold paragraphs of inline content. */
export type DocTableCell = { type: 'tableCell'; content: DocParagraph[] };
/** The first row holds only tableHeader cells, the rest only tableCell cells. */
export type DocTableRow = { type: 'tableRow'; content: (DocTableHeader | DocTableCell)[] };
/** At most 6 columns and 60 rows; rendered with LegalTable. */
export type DocTable = { type: 'table'; attrs: { caption: string }; content: DocTableRow[] };
/** simple profile only. `src`, sizes and `srcSet` are added by the API when it serves the page. */
export type DocImage = {
  type: 'image';
  attrs: {
    mediaId: string;
    alt: string;
    caption?: string | null;
    credit?: string | null;
    src?: string | null;
    width?: number | null;
    height?: number | null;
    srcSet?: string | null;
  };
};
/** requests profile only: the existing RequestForm island, exactly once. */
export type DocRequestForm = { type: 'requestForm' };

export type DocBlock =
  | DocParagraph
  | DocHeading
  | DocBulletList
  | DocOrderedList
  | DocTable
  | DocImage
  | DocRequestForm;

/** `doc(profile)`: a TipTap document. Canonical JSON ≤ 90 KB (UTF-8), ≤ 60 H2s, ≤ 10 tables. */
export type SiteDoc = { type: 'doc'; content: DocBlock[] };

/** The document profiles (§4.4) and the item each belongs to. */
export type DocProfile = 'privacy-en' | 'privacy-hi' | 'terms' | 'disclaimer' | 'requests' | 'simple';
export const LEGAL_PROFILES: Record<LegalKey, DocProfile> = {
  privacy: 'privacy-en',
  'privacy-hi': 'privacy-hi',
  terms: 'terms',
  disclaimer: 'disclaimer',
  'privacy-requests': 'requests',
};

/* ── Legal documents (§3.8, §4) ───────────────────────────────────────────── */

/** `legalHead`: the same for all five legal documents. */
export type LegalHead = {
  seo: { title: Line; description: PlainInline };
  /** The H1 (and the second breadcrumb on /privacy/hi and /privacy/requests). */
  title: Line;
  summary: PlainInline;
};

/**
 * A legal document's content. Whether the page shows "Updated" is fixed in
 * code per key (/privacy/requests never does).
 */
export type LegalContent = LegalHead & { body: SiteDoc };

/* ── Custom pages (§3.12) ─────────────────────────────────────────────────── */

export type CustomPageContent = {
  /** The H1. */
  title: Line;
  /** The PageHead summary; '' for none. */
  intro: Text;
  /** doc('simple'). */
  body: SiteDoc;
  /** An empty title or description falls back to `title` / `intro`. */
  seo: { title: Line; description: Line; noindex: boolean };
  /** "Updated {date of the latest revision}". */
  showUpdated: boolean;
};

/* ── Content by key ───────────────────────────────────────────────────────── */

export interface DesignedContentMap {
  home: HomeContent;
  features: FeaturesContent;
  about: AboutContent;
  faq: FaqContent;
  download: DownloadContent;
  contact: ContactContent;
}

export interface SharedContentMap {
  'wont-do': WontDoContent;
}

export type LegalContentMap = Record<LegalKey, LegalContent>;

export interface FixedContentMap extends DesignedContentMap, SharedContentMap, LegalContentMap {
  chrome: ChromeContent;
}

/* ── Public API answers (§7.1) ────────────────────────────────────────────── */

export type ContentRevisionInfo = {
  number: number;
  publishedAt: string;
  /** The "Updated" date the page shows (ISO). */
  dateShown: string;
  /** SEED revisions only: today's literal date text. */
  dateLabel: string | null;
  /** privacy and privacy-hi only. */
  noticeVersion: string | null;
  change: RevisionChange;
};

export type PrivacyNoticeInfo = {
  version: string;
  materialAt: string;
  summaryEn: string;
  summaryHi: string;
  /** The "We updated our privacy notice" lines show until then. */
  showUntil: string;
};

/** `GET /api/v1/site/content/:key` → 200. 404 `{ code: 'not_published' }` = built-in. */
export type SiteContentResponse<K extends ContentKey = ContentKey> = {
  key: K;
  kind: ContentKind;
  lang: 'en' | 'hi';
  content: FixedContentMap[K];
  revision: ContentRevisionInfo;
  /** The five legal keys: the live revision's resolved token values. */
  liveValues?: LiveValues;
  /** privacy and privacy-hi. */
  notice?: PrivacyNoticeInfo | null;
};
