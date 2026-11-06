/**
 * The portal side of the admin-managed public site (W7 addendum §7.2, §7.6,
 * §8): the staff API calls, the error messages people see, and small
 * helpers the Pages, editor, history and menus screens share.
 *
 * Every call goes through the portal proxy (/admin/api/staff/…). No W7 route
 * uses DELETE: the proxy drops request bodies on DELETE, so discarding a
 * draft is a POST with its draftVersion (§2.3).
 */

import { api, ApiError, errorMessage } from './api';
import { can } from './access';
import type {
  NoticeGateView,
  PrivacyNoticePublished,
  SiteContentItem,
  SiteContentTypes,
  SiteDraftSaved,
  SiteFieldError,
  SiteItemKind,
  SitePerson,
  SitePreview,
  SiteRevisionChange,
  SiteRevisionInfo,
  StaffMe,
} from './types';

const enc = encodeURIComponent;

/* ── Permissions (§7.3) ──────────────────────────────────────────────────── */

type Me = Pick<StaffMe, 'isSuperAdmin' | 'permissions'>;

/** Who may open the Pages list and read any item. */
export const canReadSite = (me: Me) =>
  can(me, 'site.manage') || can(me, 'legal.manage') || can(me, 'settings.read');

/** Who may save drafts, restore, preview and publish an item of this kind. */
export function canWriteKind(me: Me, kind: SiteItemKind): boolean {
  return kind === 'LEGAL' ? can(me, 'legal.manage') : can(me, 'site.manage');
}

/** Legal-locked fields (footer lines, About's "What we're not", the contact notice). */
export const canEditLocked = (me: Me) => can(me, 'legal.manage');

/** Material notice changes, minor ones bigger than a small fix, the app notice gate. */
export const canPublishMaterial = (me: Me) => can(me, 'legal.material');

/* ── Errors (§7.6): never a raw code ─────────────────────────────────────── */

const TOO_LARGE = 'This page is too large to save. Shorten it, or split it into two pages.';

/** What the portal says when the API sends a code without a usable sentence. */
const CODE_MESSAGES: Record<string, string> = {
  invalid_content: 'Some fields need attention before this can be saved.',
  stale_draft: 'Someone saved this page after you opened it. Reload to see their changes.',
  nothing_to_publish: 'Nothing has changed since the last publish.',
  missing_hook: 'This page is missing something it must keep. Check the highlighted part and try again.',
  slug_reserved: 'That address is used by the site itself. Pick another.',
  slug_taken: 'Another page already uses that address. Pick another.',
  legal_field_locked: 'Changing this text needs the legal.manage permission.',
  material_needs_both_languages:
    'A material change publishes the English and Hindi notices together. Update the Hindi notice and its summary first.',
  material_questions_required:
    'Answer both questions (app analytics, and the website’s cookies) before publishing a material change.',
  version_confirmation_mismatch: 'Type the new version exactly as it is shown to confirm.',
  material_required:
    'This text belongs to an older notice version. Publishing it again is a material change.',
  minor_needs_super_admin:
    'This is more than a small fix. A Super Admin must publish it, as a minor or a material change.',
  announcement_required:
    'Tell users first (the terms promise it), then publish on or after the day the change should take effect.',
  announcement_in_future: 'The date users were told can’t be in the future.',
  announcement_too_recent: 'Users must be told earlier, before the change takes effect.',
  gate_confirmation_required:
    'Tick that app 1.4.0 or later has been on Google Play’s production track at 100% for at least 2 days, then switch the gate on.',
  page_in_menu:
    'This page is linked from the menus. Remove the link and publish the menus first.',
  page_not_live: 'A menu links a page that isn’t published. Publish that page first, or remove its link.',
  too_large: TOO_LARGE,
  preview_expired: 'The preview expired. It starts again with your latest changes.',
  preview_busy: 'Preview paused for a moment.',
  privacy_notice_flow: 'The privacy notice is published from its own dialog.',
  not_published: 'This page still uses its built-in text.',
  not_found: 'That page doesn’t exist.',
  not_allowed: 'Your roles don’t allow that.',
  site_cms_unavailable: 'Website content is not available right now. Try again in a minute.',
};

/** The API's sentence when it is one; Nest's "Cannot PUT /api/…" and fallbacks are not. */
function usable(message: string): boolean {
  return !!message && !/^Cannot (GET|POST|PUT|PATCH|DELETE) \//.test(message) && !/^The request failed \(\d+\)\.$/.test(message);
}

/**
 * The words to show for a failed website-content call. `bytes` is the size
 * of the content that was sent: the API's JSON parser refuses a body over
 * 100 KB with a bare 500 today (W6 owns the fix to 413), so a 500 for a
 * draft near the 90 KB cap means "too large".
 */
export function siteError(err: unknown, bytes?: number): string {
  if (!(err instanceof ApiError)) return errorMessage(err);
  if (err.status === 413) return TOO_LARGE;
  if (err.status === 500 && !err.code && bytes !== undefined && bytes >= MAX_CONTENT_BYTES * 0.9) return TOO_LARGE;
  if (err.code && !usable(err.message) && CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code];
  if (usable(err.message)) return err.message;
  if (err.code && CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code];
  if (err.status === 404) return 'This part of the website editor isn’t available on the server yet.';
  if (err.status === 403) return 'Your roles don’t allow that.';
  return errorMessage(err);
}

/** The same error, with the portal's words, for helpers that toast errorMessage(). */
export function friendly(err: unknown): unknown {
  if (err instanceof ApiError) return new ApiError(err.status, siteError(err), err.code, err.body);
  return err;
}

/** The fields a 400 invalid_content (or missing_hook) names. */
export function fieldErrors(err: unknown): SiteFieldError[] {
  if (!(err instanceof ApiError)) return [];
  const inner = (err.body as { message?: { errors?: unknown } } | null)?.message;
  const list = inner && typeof inner === 'object' ? (inner as { errors?: unknown }).errors : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .filter((e): e is SiteFieldError => !!e && typeof e === 'object' && typeof e.path === 'string' && typeof e.message === 'string')
    .slice(0, 100);
}

/** Whether a call failed because the endpoint isn't on this API yet (or was removed). */
export function isMissingEndpoint(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && !usable(err.message);
}

export const isStale = (err: unknown) => err instanceof ApiError && err.code === 'stale_draft';

/* ── Labels ──────────────────────────────────────────────────────────────── */

/** A name for "by …" lines. */
export function personName(p: SitePerson | undefined): string | null {
  if (!p) return null;
  if (typeof p === 'string') return p || null;
  return p.displayName || p.email || null;
}

export const CHANGE_LABELS: Record<SiteRevisionChange, string> = {
  SEED: 'Original text',
  EDIT: 'Edit',
  MINOR: 'Minor',
  MATERIAL: 'Material',
  SETTINGS: 'Settings changed',
};

export const KIND_GROUPS: { kind: SiteItemKind; title: string; help: string }[] = [
  { kind: 'DESIGNED', title: 'Designed pages', help: 'The site’s own pages: words and pictures, in the redesign’s layout.' },
  { kind: 'SHARED', title: 'Shared blocks', help: 'Shown on more than one page; one edit changes every page.' },
  { kind: 'LEGAL', title: 'Legal', help: 'Versioned documents. Every publish is kept in the history.' },
  { kind: 'CUSTOM', title: 'Your pages', help: 'Pages you add, such as a refund policy or careers.' },
];

/** The editor of an item. */
export function editorHref(item: Pick<SiteContentItem, 'key' | 'kind'>): string {
  return item.kind === 'CHROME' ? '/admin/menus' : `/admin/pages/${enc(item.key)}`;
}

export function historyHref(key: string): string {
  return `/admin/pages/${enc(key)}/history`;
}

/** Where the live item shows on the public site. */
export function liveHref(item: Pick<SiteContentItem, 'key' | 'kind' | 'path' | 'slug'>): string | null {
  if (item.kind === 'SHARED') return '/features#wont-do';
  if (item.kind === 'CHROME') return '/';
  if (item.path) return item.path;
  if (item.kind === 'CUSTOM' && item.slug) return `/${item.slug}`;
  return null;
}

export const isPrivacyKey = (key: string) => key === 'privacy' || key === 'privacy-hi';

/** The live-value tokens as editors name them (§4.2). */
export const TOKEN_LABELS: Record<string, string> = {
  'site.name': 'Site name',
  'site.url': 'Site address',
  'site.company': 'Company name',
  'site.email': 'Site email',
  'contact.email': 'Contact email',
  'company.legalName': 'Legal name',
  'company.postalAddress': 'Postal address',
  'officer.name': 'Officer name',
  'officer.email': 'Officer email',
  'officer.phone': 'Officer phone',
  'privacy.responseDays': 'Response days',
  'notice.version': 'Notice version',
  'cookies.servicesInUse': 'Services in use',
};

export const tokenLabel = (name: string) => TOKEN_LABELS[name] ?? name;

/**
 * TERMS_MIN_NOTICE_DAYS, from the terms profile of GET …/types (the API is
 * the only copy, §4.5). 0 until the owner and a lawyer decide (W7 decision 5).
 */
export function termsMinNoticeDays(types: SiteContentTypes | undefined): number {
  const n = types?.terms?.minNoticeDays ?? 0;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/* ── Size (§4.1): canonical JSON in UTF-8 bytes ──────────────────────────── */

export const MAX_CONTENT_BYTES = 90 * 1024;

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/** The JSON the API measures and hashes (sorted keys). */
export const canonicalJson = (v: unknown) => JSON.stringify(canonical(v));

export function contentBytes(v: unknown): number {
  return new TextEncoder().encode(canonicalJson(v)).length;
}

export const sameContent = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/* ── Calls (§7.2) ────────────────────────────────────────────────────────── */

const item = (key: string) => `staff/site/content/${enc(key)}`;

export function saveDraft(
  key: string,
  body: { draftVersion: number; content: unknown; autosave?: boolean; renameIds?: boolean },
) {
  return api<SiteDraftSaved>(`${item(key)}/draft`, { method: 'PUT', body });
}

export function discardDraft(key: string, draftVersion: number) {
  return api<SiteDraftSaved>(`${item(key)}/draft/discard`, { method: 'POST', body: { draftVersion } });
}

export interface PublishBody {
  draftVersion: number;
  summary?: string;
  keepDate?: boolean;
  factsSnapshot?: Record<string, string>;
  /** terms only (§4.5) */
  mattersToUsers?: boolean;
  announcedAt?: string;
  announcedVia?: 'app' | 'email' | 'app+email';
}

export function publishItem(key: string, body: PublishBody) {
  return api<{ revision: SiteRevisionInfo }>(`${item(key)}/publish`, { method: 'POST', body });
}

export function restoreRevision(key: string, revisionId: string, draftVersion: number) {
  return api<SiteDraftSaved>(`${item(key)}/revisions/${enc(revisionId)}/restore`, {
    method: 'POST',
    body: { draftVersion },
  });
}

export function createCustomPage(slug: string, title: string) {
  return api<{ key: string }>('staff/site/pages', { method: 'POST', body: { slug, title } });
}

export function updateCustomPage(key: string, body: { draftVersion: number; slug?: string; title?: string }) {
  return api<{ item: SiteContentItem }>(`staff/site/pages/${enc(key)}`, { method: 'PATCH', body });
}

export function unpublishPage(key: string) {
  return api<{ item: SiteContentItem }>(`staff/site/pages/${enc(key)}/unpublish`, { method: 'POST', body: {} });
}

export function archivePage(key: string) {
  return api<{ item: SiteContentItem }>(`staff/site/pages/${enc(key)}/archive`, { method: 'POST', body: {} });
}

export function createPreview(key: string, content: unknown) {
  return api<SitePreview>('staff/site/previews', { method: 'POST', body: { key, content } });
}

export function updatePreview(token: string, content: unknown) {
  return api<null>(`staff/site/previews/${enc(token)}`, { method: 'PUT', body: { content } });
}

export interface NoticePublishBody {
  change: 'MINOR' | 'MATERIAL';
  en?: { draftVersion: number };
  hi?: { draftVersion: number };
  summaryEn?: string;
  summaryHi?: string;
  keepDate?: boolean;
  confirmVersion?: string;
  affectsAnalytics?: boolean;
  affectsCookies?: boolean;
}

export function publishPrivacyNotice(body: NoticePublishBody) {
  return api<PrivacyNoticePublished>('staff/site/privacy-notice/publish', { method: 'POST', body });
}

export function setNoticeGate(enabled: boolean, playConfirmed?: boolean) {
  return api<{ gate: NoticeGateView }>('staff/site/privacy-notice/gate', {
    method: 'PUT',
    body: enabled ? { enabled, playConfirmed: !!playConfirmed } : { enabled },
  });
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

/** "3 Dec 2027" in India's time zone (absolute, never relative). */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);
}

/** Today in India as YYYY-MM-DD (for date inputs). */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date shifted by whole days. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
