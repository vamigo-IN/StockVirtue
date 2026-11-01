import { SITE } from './site';

/**
 * Runtime-editable site settings, edited in the newsroom portal
 * (/admin/settings) and persisted in the backend (`/site/settings`). Fetched
 * server-side only.
 *
 * `headCode` / `bodyStartCode` / `bodyEndCode` are raw HTML snippets injected
 * into the page — used for search-engine / domain verification, analytics tags,
 * and other third-party scripts. They are intentionally trusted: changing them
 * needs the settings.code_injection permission, and every change is audited.
 */
export interface SiteSettings {
  siteTitle: string;
  siteDescription: string;
  contactEmail: string;
  playStoreUrl: string;
  /** Social profile URLs (blank = hidden). */
  social: {
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
    facebook?: string;
  };
  /** Raw HTML injected at the end of <head> (verification meta, analytics). */
  headCode: string;
  /** Raw HTML injected right after <body> opens. */
  bodyStartCode: string;
  /** Raw HTML injected right before </body> closes. */
  bodyEndCode: string;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteTitle: SITE.name,
  siteDescription: SITE.description,
  contactEmail: SITE.email,
  playStoreUrl: SITE.playUrl,
  social: {},
  headCode: '',
  bodyStartCode: '',
  bodyEndCode: '',
};

/**
 * Backend base URL. The NestJS backend serves every route under a global
 * `/api` prefix (the mobile app uses `…/api` too). We normalise here so the
 * prefix is always present whether or not API_BASE already includes it —
 * otherwise calls 404 and the contact form / settings silently fail.
 */
const API_BASE = (() => {
  const raw = (process.env.API_BASE || 'https://api.stockvirtue.com').replace(
    /\/+$/,
    '',
  );
  return /\/api$/.test(raw) ? raw : `${raw}/api`;
})();

/**
 * Server-side fetch of live settings, merged over defaults. Never throws — if
 * the backend is unreachable or the endpoint isn't deployed yet, the site still
 * renders with sensible defaults. Cached for 60s (ISR-style) to stay fast.
 */
export async function getSettings(): Promise<SiteSettings> {
  try {
    const res = await fetch(`${API_BASE}/site/settings`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return DEFAULT_SETTINGS;
    const data = (await res.json()) as Partial<SiteSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      social: { ...DEFAULT_SETTINGS.social, ...(data.social ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Server-to-server: forward a contact-form submission to the backend. */
export async function sendContact(payload: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/site/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, error: `Backend returned ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
