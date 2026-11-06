import type {
  ContentKind,
  ContentRevisionInfo,
  LegalContent,
  LegalKey,
  LiveValues,
  PrivacyNoticeInfo,
  RevisionChange,
  SiteDoc,
} from '@/content/site/types';
import { LEGAL_KEYS } from '@/content/site/types';
import { isValidSlug } from '@/content/site/reserved-ids';
import { isTokenName } from './tokens';

/**
 * The public API's answers for legal documents, custom pages, the content
 * index and previews (W7 addendum §7.1, §7.2), as the web uses them, and the
 * checks that turn a JSON body into them. The fetchers in ./api.ts call
 * these; anything that fails a check counts as a failed answer there.
 *
 * Plain types and functions (no server-only import), so the portal and
 * tests can use them too.
 */

/** A legal document as its page renders it (`GET /api/v1/site/content/:key`, a LEGAL key). */
export type LegalDoc = {
  key: LegalKey;
  lang: 'en' | 'hi';
  content: LegalContent;
  revision: ContentRevisionInfo;
  /** The revision's recorded token values (§4.2): the page renders from these, never from Settings. */
  liveValues: LiveValues;
  /** privacy and privacy-hi: the "We updated this notice" line's data while it shows; else null. */
  notice: PrivacyNoticeInfo | null;
  /** 'api', or 'seed' for the build-time fallback (next build only, §3.11). */
  source: 'api' | 'seed';
};

/** A LIVE custom page (`GET /api/v1/site/pages/:slug`, §3.12). */
export type CustomPageDoc = {
  slug: string;
  /** The H1. */
  title: string;
  /** The PageHead summary; '' for none. */
  intro: string;
  /** doc('simple'), with images resolved by the API. */
  body: SiteDoc;
  seo: { title: string; description: string; noindex: boolean };
  showUpdated: boolean;
  revision: ContentRevisionInfo;
  /** Resolved by the API when it serves the page. */
  liveValues: LiveValues;
};

/** An old slug: the route answers with a permanent redirect to `/<movedTo>`. */
export type CustomPageMoved = { movedTo: string };

/** `GET /api/v1/site/content-index` (§7.1): the sitemap's dates and the custom pages' slugs. */
export type ContentIndex = {
  fixed: { key: string; path: string; updatedAt: string | null }[];
  custom: { slug: string; title: string; updatedAt: string | null; noindex: boolean }[];
};

export const EMPTY_CONTENT_INDEX: ContentIndex = Object.freeze({ fixed: [], custom: [] }) as ContentIndex;

/** `GET staff/site/previews/:token` (§7.2, §8.9): an unsaved draft, for the preview route. */
export type PreviewAnswer = {
  key: string;
  kind: ContentKind;
  lang: 'en' | 'hi';
  /** The draft, as the editor holds it (lengths not enforced; shapes, links and ids are). */
  content: Record<string, unknown>;
  /** LEGAL and CUSTOM: the values the API resolves now. */
  liveValues: LiveValues | null;
  /** CHROME: the draft chrome as GET /site/chrome would serve it ({ menus, footer, notFound }). */
  chrome: unknown;
};

type Rec = Record<string, unknown>;
export const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const REVISION_CHANGES: readonly RevisionChange[] = ['SEED', 'EDIT', 'MINOR', 'MATERIAL', 'SETTINGS'];
const KINDS: readonly ContentKind[] = ['DESIGNED', 'SHARED', 'CHROME', 'LEGAL', 'CUSTOM'];

export function isLegalKey(v: unknown): v is LegalKey {
  return typeof v === 'string' && (LEGAL_KEYS as readonly string[]).includes(v);
}

/** A flat map of known token names to strings; anything else is dropped. */
export function parseLiveValues(raw: unknown): LiveValues {
  const out: LiveValues = {};
  if (!isRec(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    if (isTokenName(name) && typeof value === 'string') out[name] = value;
  }
  return out;
}

/** A revision's public info; null when it lacks the dates a page needs. */
export function parseRevision(raw: unknown): ContentRevisionInfo | null {
  if (!isRec(raw)) return null;
  const dateShown = str(raw.dateShown);
  const publishedAt = str(raw.publishedAt, dateShown);
  if (!dateShown && !publishedAt) return null;
  const change = REVISION_CHANGES.includes(raw.change as RevisionChange) ? (raw.change as RevisionChange) : 'EDIT';
  return {
    number: typeof raw.number === 'number' && Number.isFinite(raw.number) ? raw.number : 0,
    publishedAt,
    dateShown: dateShown || publishedAt,
    dateLabel: strOrNull(raw.dateLabel),
    noticeVersion: strOrNull(raw.noticeVersion),
    change,
  };
}

/** The privacy documents' notice info, or null. */
export function parseNotice(raw: unknown): PrivacyNoticeInfo | null {
  if (!isRec(raw)) return null;
  const version = str(raw.version);
  const materialAt = str(raw.materialAt);
  const showUntil = str(raw.showUntil);
  if (!version || !materialAt || !showUntil) return null;
  return { version, materialAt, summaryEn: str(raw.summaryEn), summaryHi: str(raw.summaryHi), showUntil };
}

/** A TipTap document: `{ type: 'doc', content: [...] }` (its nodes are checked by the renderer). */
export function isSiteDoc(v: unknown): v is SiteDoc {
  return isRec(v) && v.type === 'doc' && Array.isArray(v.content);
}

/** A legal document's content: the head (seo, title, summary) and the body. */
export function parseLegalContent(raw: unknown): LegalContent | null {
  if (!isRec(raw) || !isSiteDoc(raw.body) || typeof raw.title !== 'string') return null;
  const seo = isRec(raw.seo) ? raw.seo : {};
  return {
    seo: {
      title: str(seo.title, raw.title),
      description: Array.isArray(seo.description) ? (seo.description as LegalContent['seo']['description']) : [],
    },
    title: raw.title,
    summary: Array.isArray(raw.summary) ? (raw.summary as LegalContent['summary']) : [],
    body: raw.body,
  };
}

/** A 200 answer for a legal key, or null when it isn't one. */
export function parseLegalAnswer(key: LegalKey, body: unknown, source: LegalDoc['source'] = 'api'): LegalDoc | null {
  if (!isRec(body)) return null;
  const content = parseLegalContent(body.content);
  const revision = parseRevision(body.revision);
  if (!content || !revision) return null;
  const lang = body.lang === 'hi' || body.lang === 'en' ? body.lang : key === 'privacy-hi' ? 'hi' : 'en';
  return {
    key,
    lang,
    content,
    revision,
    liveValues: parseLiveValues(body.liveValues),
    notice: key === 'privacy' || key === 'privacy-hi' ? parseNotice(body.notice) : null,
    source,
  };
}

/** A custom page's 200 answer: the page, a move, or null when it is neither. */
export function parseCustomPage(slug: string, body: unknown): CustomPageDoc | CustomPageMoved | null {
  if (!isRec(body)) return null;
  if (typeof body.movedTo === 'string') return isValidSlug(body.movedTo) ? { movedTo: body.movedTo } : null;
  if (typeof body.title !== 'string' || !isSiteDoc(body.body)) return null;
  const revision = parseRevision(body.revision);
  if (!revision) return null;
  const seo = isRec(body.seo) ? body.seo : {};
  return {
    slug: typeof body.slug === 'string' && isValidSlug(body.slug) ? body.slug : slug,
    title: body.title,
    intro: str(body.intro),
    body: body.body,
    seo: { title: str(seo.title), description: str(seo.description), noindex: seo.noindex === true },
    showUpdated: body.showUpdated !== false,
    revision,
    liveValues: parseLiveValues(body.liveValues),
  };
}

/** The content index; null when the body isn't one. Custom slugs that fail the slug rule are dropped. */
export function parseContentIndex(body: unknown): ContentIndex | null {
  if (!isRec(body) || !Array.isArray(body.fixed) || !Array.isArray(body.custom)) return null;
  const fixed = body.fixed
    .filter(isRec)
    .filter((f) => typeof f.key === 'string' && typeof f.path === 'string')
    .map((f) => ({ key: f.key as string, path: f.path as string, updatedAt: strOrNull(f.updatedAt) }));
  const custom = body.custom
    .filter(isRec)
    .filter((c) => isValidSlug(c.slug))
    .map((c) => ({
      slug: c.slug as string,
      title: str(c.title),
      updatedAt: strOrNull(c.updatedAt),
      noindex: c.noindex === true,
    }));
  return { fixed, custom };
}

/** A preview's answer, or null. */
export function parsePreview(body: unknown): PreviewAnswer | null {
  if (!isRec(body) || typeof body.key !== 'string' || !isRec(body.content)) return null;
  if (!KINDS.includes(body.kind as ContentKind)) return null;
  return {
    key: body.key,
    kind: body.kind as ContentKind,
    lang: body.lang === 'hi' ? 'hi' : 'en',
    content: body.content,
    liveValues: 'liveValues' in body ? parseLiveValues(body.liveValues) : null,
    chrome: 'chrome' in body ? body.chrome : null,
  };
}
