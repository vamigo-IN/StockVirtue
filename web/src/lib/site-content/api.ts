import 'server-only';
import type {
  ContentKey,
  DesignedContentMap,
  DesignedKey,
  LegalKey,
  SharedContentMap,
  SharedKey,
} from '@/content/site/types';
import { DESIGNED_KEYS, SHARED_KEYS } from '@/content/site/types';
import { isValidSlug } from '@/content/site/reserved-ids';
import { WONT_DO_DEFAULT } from '@/content/site/wont-do';
import { API_V1, backendHeaders, type ClientInfo } from '@/portal/backend';
import { getSettings } from '@/lib/settings';
import {
  EMPTY_CONTENT_INDEX,
  isLegalKey,
  isRec,
  parseContentIndex,
  parseCustomPage,
  parseLegalAnswer,
  parsePreview,
  type ContentIndex,
  type CustomPageDoc,
  type CustomPageMoved,
  type LegalDoc,
  type PreviewAnswer,
} from './answers';
import { mergeContent } from './merge';
import { DEFAULT_SITE_CHROME, resolveChrome, type SiteChrome } from './site-chrome';
import { resolveLiveValues } from './tokens';

/**
 * Site content for server-rendered pages (W7 addendum §3.11, §7.1, §7.5,
 * §8.9). Every public fetch is tagged (a publish refreshes exactly the pages
 * that read the item) and bounded by `revalidate: 60`, with a 3 s timeout
 * during `next build` and 5 s otherwise. Next's data cache keeps only 200
 * answers, so a 404 is asked again at each regeneration.
 *
 * NEVER THROW (the getSettings() contract): designed pages, the shared
 * block, the chrome and the content index.
 * - 200 → the published content (merged over the default you pass), and
 *   remembered in this process's memo (keyed by URL);
 * - 404 (`not_published`, or an API without the endpoint) → the default,
 *   quietly;
 * - a network error, a timeout, a 5xx or any other answer → this process's
 *   last good answer, else the default, with one console.warn per key per
 *   outage.
 *
 * NEVER FALL BACK AT RUN TIME: legal documents and custom pages.
 * - 200 → the answer (and the memo);
 * - an outage (or, for a legal key, any 404) → the memo, else THROW, so an
 *   ISR regeneration fails and Next keeps serving the last good page;
 * - only during `next build` does a legal key fall back to its seed
 *   (src/content/legal/<key>.json, with the web token resolver), logging
 *   `legal fallback in use for <key>`, which W6's deploy check refuses;
 * - a custom page's 404 is real absence (null → notFound()).
 *
 * Usage (a page's Promise.all):
 *   getPageContent('faq', FAQ_DEFAULT)   // → FaqContent
 *   getSharedContent('wont-do')          // → WontDoContent (its default is built in)
 *   getChrome()                          // → SiteChrome (menus resolved to { href, label, … })
 *   getLegalDoc('terms')                 // → LegalDoc (content, revision, liveValues, notice)
 *   getCustomPage('refund-policy')       // → CustomPageDoc | { movedTo } | null
 *   getContentIndex()                    // → ContentIndex (sitemap, generateStaticParams)
 *   getPreview(token, session, client)   // → PreviewResult (staff only, no-store)
 */

/** Seconds a content answer is reused before it is asked again (tags refresh it sooner). */
export const SITE_CONTENT_REVALIDATE = 60;

/** The tag of one item's public read: `content:<key>` (§7.5, Appendix B). */
export const contentTag = (key: ContentKey): `content:${ContentKey}` => `content:${key}`;
/** Menus, footer texts, the 404 texts and the footer's notice line. */
export const SITE_CHROME_TAG = 'site-chrome';
/** The content index: the sitemap and custom pages' generateStaticParams. */
export const SITE_PAGES_TAG = 'site-pages';
/** One custom page. */
export const customTag = (slug: string) => `custom:${slug}`;

export type { ContentIndex, CustomPageDoc, CustomPageMoved, LegalDoc, PreviewAnswer, SiteChrome };

const SHARED_DEFAULTS: SharedContentMap = { 'wont-do': WONT_DO_DEFAULT };

const isBuild = () => process.env.NEXT_PHASE === 'phase-production-build';

type Answer =
  | { status: 'ok'; body: unknown }
  | { status: 'absent' }
  | { status: 'failed'; reason: string };

async function ask(url: string, tag: string): Promise<Answer> {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      next: { revalidate: SITE_CONTENT_REVALIDATE, tags: [tag] },
      signal: AbortSignal.timeout(isBuild() ? 3_000 : 5_000),
    });
    if (res.status === 404) return { status: 'absent' };
    if (!res.ok) return { status: 'failed', reason: `HTTP ${res.status}` };
    return { status: 'ok', body: await res.json() };
  } catch (err) {
    const e = err as Error;
    return { status: 'failed', reason: e?.name === 'TimeoutError' ? 'timed out' : e?.message || 'network error' };
  }
}

/** The last good answer per URL, for outages (per process). */
const memo = new Map<string, unknown>();
/** Keys warned about in the current outage. */
const warned = new Set<string>();

function warnOnce(id: string, message: string) {
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(message);
}

const reasonOf = (answer: Answer, what: string) =>
  answer.status === 'failed' ? answer.reason : answer.status === 'absent' ? 'HTTP 404' : `an answer that isn't ${what}`;

/* ── Designed pages and the shared block (never throw) ────────────────────── */

async function readItem<T>(key: string, fallback: T): Promise<T> {
  const url = `${API_V1}/site/content/${encodeURIComponent(key)}`;
  const answer = await ask(url, `content:${key}`);

  if (answer.status === 'ok') {
    const content = isRec(answer.body) ? answer.body.content : undefined;
    if (isRec(content)) {
      memo.set(url, content);
      warned.delete(key);
      return mergeContent(fallback, content);
    }
  } else if (answer.status === 'absent') {
    // Real absence: the item is built-in (or the endpoint isn't deployed yet).
    memo.delete(url);
    warned.delete(key);
    return fallback;
  }

  const last = memo.get(url);
  const reason = answer.status === 'failed' ? answer.reason : 'an answer without content';
  warnOnce(
    key,
    `Site content "${key}" is unavailable (${reason}); showing ${last === undefined ? 'its built-in default' : 'the last good answer'}.`,
  );
  return last === undefined ? fallback : mergeContent(fallback, last);
}

/**
 * A designed page's content: the published version merged over `fallback`
 * (the page's own default from src/content/site/<key>.ts), or `fallback`
 * itself while the page is built-in or the API is unreachable. Never throws.
 */
export async function getPageContent<K extends DesignedKey>(
  key: K,
  fallback: DesignedContentMap[K],
): Promise<DesignedContentMap[K]> {
  if (!(DESIGNED_KEYS as readonly string[]).includes(key)) return fallback;
  return readItem(key, fallback);
}

/** A shared block's content ('wont-do'), merged over its built-in default. Never throws. */
export async function getSharedContent<K extends SharedKey>(key: K): Promise<SharedContentMap[K]> {
  const fallback = SHARED_DEFAULTS[key];
  if (!(SHARED_KEYS as readonly string[]).includes(key)) return fallback;
  return readItem(key, fallback);
}

/* ── The chrome (never throws) ────────────────────────────────────────────── */

/**
 * Menus, footer texts, the root 404's texts and the footer's notice line
 * (`GET /api/v1/site/chrome`, tag `site-chrome`), every menu link resolved
 * to `{ id, href, label, lang?, external?, alsoCurrentOn? }`. Each part the
 * API serves as null (built-in), or that fails the checks, is the built-in
 * default. Never throws: the layouts of every page render it.
 */
export async function getChrome(): Promise<SiteChrome> {
  const url = `${API_V1}/site/chrome`;
  const answer = await ask(url, SITE_CHROME_TAG);
  if (answer.status === 'ok' && isRec(answer.body)) {
    memo.set(url, answer.body);
    warned.delete('chrome');
    return resolveChrome(answer.body);
  }
  if (answer.status === 'absent') {
    memo.delete(url);
    warned.delete('chrome');
    return DEFAULT_SITE_CHROME;
  }
  const last = memo.get(url);
  warnOnce(
    'chrome',
    `Site chrome is unavailable (${reasonOf(answer, 'a chrome')}); showing ${last === undefined ? 'the built-in menus and footer' : 'the last good answer'}.`,
  );
  return last === undefined ? DEFAULT_SITE_CHROME : resolveChrome(last);
}

/* ── The content index (never throws) ─────────────────────────────────────── */

/**
 * The live items' dates and the LIVE custom pages (`GET
 * /api/v1/site/content-index`, tag `site-pages`). Empty lists when the API
 * has no answer and this process none remembered (so at a build with the API
 * down no custom page is prerendered). Never throws.
 */
export async function getContentIndex(): Promise<ContentIndex> {
  const url = `${API_V1}/site/content-index`;
  const answer = await ask(url, SITE_PAGES_TAG);
  if (answer.status === 'ok') {
    const index = parseContentIndex(answer.body);
    if (index) {
      memo.set(url, index);
      warned.delete('content-index');
      return index;
    }
  } else if (answer.status === 'absent') {
    memo.delete(url);
    warned.delete('content-index');
    return EMPTY_CONTENT_INDEX;
  }
  const last = memo.get(url) as ContentIndex | undefined;
  warnOnce(
    'content-index',
    `The site's content index is unavailable (${reasonOf(answer, 'an index')}); ${last ? 'using the last good answer' : 'listing no custom pages'}.`,
  );
  return last ?? EMPTY_CONTENT_INDEX;
}

/* ── Legal documents (never fall back at run time) ────────────────────────── */

/** The build-time seeds: today's legal pages converted (Appendix C), equal to the API's seed. */
const LEGAL_SEEDS: Record<LegalKey, () => Promise<unknown>> = {
  privacy: () => import('@/content/legal/privacy.json').then((m) => m.default),
  'privacy-hi': () => import('@/content/legal/privacy-hi.json').then((m) => m.default),
  terms: () => import('@/content/legal/terms.json').then((m) => m.default),
  disclaimer: () => import('@/content/legal/disclaimer.json').then((m) => m.default),
  'privacy-requests': () => import('@/content/legal/privacy-requests.json').then((m) => m.default),
};

/**
 * The seed as a LegalDoc, with the web resolver's values (the Settings the
 * build can read) and the seed's own notice version. Build only.
 */
async function seedDoc(key: LegalKey): Promise<LegalDoc> {
  const [seed, settings] = await Promise.all([LEGAL_SEEDS[key](), getSettings()]);
  const s = isRec(seed) ? seed : {};
  const revision = isRec(s.revision) ? s.revision : {};
  const noticeVersion = typeof revision.noticeVersion === 'string' ? revision.noticeVersion : null;
  const doc = parseLegalAnswer(
    key,
    {
      key,
      lang: s.lang,
      content: s.content,
      revision: { number: 1, change: 'SEED', publishedAt: revision.dateShown, ...revision },
      liveValues: resolveLiveValues(settings, { noticeVersion }),
      notice: null,
    },
    'seed',
  );
  if (!doc) throw new Error(`The legal seed for "${key}" is malformed (src/content/legal/${key}.json).`);
  return doc;
}

/**
 * A legal document: its live revision's content, dates and recorded token
 * values (`GET /api/v1/site/content/<key>`, tag `content:<key>`).
 *
 * At run time it never falls back: an outage (or a 404) gives this
 * process's last good answer, else it THROWS, so the regeneration fails and
 * Next keeps serving the published page. During `next build` only, with no
 * answer, it uses the seed and logs `legal fallback in use for <key>`.
 */
export async function getLegalDoc(key: LegalKey): Promise<LegalDoc> {
  if (!isLegalKey(key)) throw new Error(`"${String(key)}" is not a legal document.`);
  const url = `${API_V1}/site/content/${key}`;
  const answer = await ask(url, contentTag(key));
  if (answer.status === 'ok') {
    const doc = parseLegalAnswer(key, answer.body);
    if (doc) {
      memo.set(url, doc);
      warned.delete(`legal:${key}`);
      return doc;
    }
  }
  const reason = reasonOf(answer, 'a legal document');
  const last = memo.get(url) as LegalDoc | undefined;
  if (last) {
    warnOnce(`legal:${key}`, `Legal document "${key}" is unavailable (${reason}); serving the last good answer.`);
    return last;
  }
  if (isBuild()) {
    console.error(`legal fallback in use for ${key}`);
    return seedDoc(key);
  }
  throw new Error(`Legal document "${key}" is unavailable (${reason}); keeping the last published page.`);
}

/* ── Custom pages (never fall back at run time) ───────────────────────────── */

/**
 * A LIVE custom page (`GET /api/v1/site/pages/<slug>`, tag `custom:<slug>`):
 * the page, `{ movedTo }` for an old slug (the route redirects), or null
 * when there is none (a 404: the route's notFound()). A slug that fails the
 * slug rule is null without a request. An outage gives the last good answer,
 * else it THROWS (Next keeps the last good page).
 */
export async function getCustomPage(slug: string): Promise<CustomPageDoc | CustomPageMoved | null> {
  if (!isValidSlug(slug)) return null;
  const url = `${API_V1}/site/pages/${slug}`;
  const answer = await ask(url, customTag(slug));
  if (answer.status === 'absent') {
    memo.delete(url);
    warned.delete(`custom:${slug}`);
    return null;
  }
  if (answer.status === 'ok') {
    const page = parseCustomPage(slug, answer.body);
    if (page) {
      memo.set(url, page);
      warned.delete(`custom:${slug}`);
      return page;
    }
  }
  const reason = reasonOf(answer, 'a page');
  const last = memo.get(url) as CustomPageDoc | CustomPageMoved | undefined;
  if (last) {
    warnOnce(`custom:${slug}`, `Custom page "${slug}" is unavailable (${reason}); serving the last good answer.`);
    return last;
  }
  throw new Error(`Custom page "${slug}" is unavailable (${reason}); keeping the last published page.`);
}

/* ── Previews (staff only, never cached) ──────────────────────────────────── */

/** A preview token: 32 random bytes, base64url (43 characters). */
export const PREVIEW_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type PreviewResult =
  | { status: 'ok'; preview: PreviewAnswer }
  /** 429 preview_busy: the per-staff read limit; the portal tries again. */
  | { status: 'busy' }
  /** No session, another person's or an expired token, or any other failure: the route's 404. */
  | { status: 'none' };

/**
 * An unsaved draft for /preview/<token> (`GET staff/site/previews/<token>`
 * with the staff session and the site key, `no-store`). Anything but a
 * well-formed 200 is `none`, and the route answers 404.
 */
export async function getPreview(
  token: string,
  session: string | undefined,
  client: ClientInfo = { ip: null, userAgent: null },
): Promise<PreviewResult> {
  if (!PREVIEW_TOKEN.test(token) || !session) return { status: 'none' };
  try {
    const res = await fetch(`${API_V1}/staff/site/previews/${token}`, {
      headers: backendHeaders(session, client, false),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status === 429) return { status: 'busy' };
    if (!res.ok) return { status: 'none' };
    const preview = parsePreview(await res.json());
    return preview ? { status: 'ok', preview } : { status: 'none' };
  } catch {
    return { status: 'none' };
  }
}
