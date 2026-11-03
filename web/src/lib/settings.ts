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
/** A media library image (logo, favicon, share image). */
export interface SiteImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
}

/**
 * Branding, search & indexing, analytics and advertising, edited under Site
 * settings in the portal. The API has already checked every id's format.
 */
export interface SiteConfig {
  branding: {
    logo: SiteImage | null;
    favicon: SiteImage | null;
    shareImage: SiteImage | null;
    /** Blank = the site's own colours. */
    themeColor: string;
  };
  search: {
    /** %s = the page's own title; blank = the default. */
    titleTemplate: string;
    keywords: string;
    twitterHandle: string;
    googleVerification: string;
    bingVerification: string;
    yandexVerification: string;
    noindex: boolean;
    blockAiCrawlers: boolean;
    robotsExtra: string;
    sitemapCategories: boolean;
    sitemapTags: boolean;
    sitemapAuthors: boolean;
    googleNewsSitemap: boolean;
    llmsEnabled: boolean;
    llmsSummary: string;
    llmsArticles: number;
  };
  analytics: {
    ga4Id: string;
    gtmId: string;
    metaPixelId: string;
    clarityId: string;
  };
  ads: {
    adsenseClient: string;
    autoAds: boolean;
    adsTxt: string;
    /** Visitors who haven't allowed advertising cookies: non-personalised ads, or none. */
    withoutConsent: 'non_personalised' | 'off';
  };
  /** Who answers for personal data (DPDP Act), from the Privacy tab. */
  privacy: {
    legalName: string;
    postalAddress: string;
    officerName: string;
    officerEmail: string;
    officerPhone: string;
    /** Days within which requests and grievances are answered (at most 90). */
    responseDays: number;
  };
}

export const DEFAULT_CONFIG: SiteConfig = {
  branding: { logo: null, favicon: null, shareImage: null, themeColor: '' },
  search: {
    titleTemplate: '',
    keywords: '',
    twitterHandle: '',
    googleVerification: '',
    bingVerification: '',
    yandexVerification: '',
    noindex: false,
    blockAiCrawlers: false,
    robotsExtra: '',
    sitemapCategories: true,
    sitemapTags: true,
    sitemapAuthors: true,
    googleNewsSitemap: true,
    llmsEnabled: true,
    llmsSummary: '',
    llmsArticles: 50,
  },
  analytics: { ga4Id: '', gtmId: '', metaPixelId: '', clarityId: '' },
  ads: {
    adsenseClient: '',
    autoAds: false,
    adsTxt: '',
    withoutConsent: 'non_personalised',
  },
  privacy: {
    legalName: SITE.company,
    postalAddress: '',
    officerName: '',
    officerEmail: '',
    officerPhone: '',
    responseDays: 30,
  },
};

/** Saving settings in the portal refreshes everything tagged with this. */
export const SETTINGS_TAG = 'site-settings';

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
  config: SiteConfig;
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
  config: DEFAULT_CONFIG,
};

function mergeConfig(c: Partial<SiteConfig> | undefined): SiteConfig {
  return {
    branding: { ...DEFAULT_CONFIG.branding, ...(c?.branding ?? {}) },
    search: { ...DEFAULT_CONFIG.search, ...(c?.search ?? {}) },
    analytics: { ...DEFAULT_CONFIG.analytics, ...(c?.analytics ?? {}) },
    ads: { ...DEFAULT_CONFIG.ads, ...(c?.ads ?? {}) },
    privacy: { ...DEFAULT_CONFIG.privacy, ...(c?.privacy ?? {}) },
  };
}

/**
 * The grievance officer as readers see them: until one is named, privacy
 * questions go to the site's contact address.
 */
export function privacyContact(s: SiteSettings) {
  const p = s.config.privacy;
  return {
    legalName: p.legalName || SITE.company,
    postalAddress: p.postalAddress,
    name: p.officerName,
    email: p.officerEmail || s.contactEmail || SITE.email,
    phone: p.officerPhone,
    responseDays: Math.min(90, Math.max(1, p.responseDays || 30)),
  };
}

/** The saved logo, or the built-in one. */
export const logoUrl = (s: SiteSettings) =>
  s.config.branding.logo?.url ?? '/logo.png';

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
      next: { revalidate: 60, tags: [SETTINGS_TAG] },
    });
    if (!res.ok) return DEFAULT_SETTINGS;
    const data = (await res.json()) as Partial<SiteSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...data,
      social: { ...DEFAULT_SETTINGS.social, ...(data.social ?? {}) },
      config: mergeConfig(data.config),
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
