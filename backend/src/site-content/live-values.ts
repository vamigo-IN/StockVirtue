import { readConfig, SiteConfig } from '../site/site-config';

/**
 * The one resolver of the live values legal documents show (W7 addendum
 * §4.2): a pure function of the settings row and the API's config. It ports
 * the website's `privacyContact()` (web/src/lib/settings.ts) and
 * `optionalServices()` (web/src/lib/consent-services.ts) and the SITE
 * constants (web/src/lib/site.ts); `site.url` comes from PUBLIC_SITE_URL,
 * never from the portal's origin. The web resolves designed pages and the
 * build-time legal fallback with its own copy of the same rules; the parity
 * spec (live-values.spec.ts) keeps them equal.
 */

/** web/src/lib/site.ts `SITE`: the values the seeds name (§4.2). */
export const SITE = {
  name: 'StockVirtue',
  company: 'Vamigo Media (OPC) Pvt. Ltd.',
  email: 'support@stockvirtue.com',
  url: 'https://stockvirtue.com',
} as const;

export const TOKEN_NAMES = [
  'site.name',
  'site.url',
  'site.company',
  'site.email',
  'contact.email',
  'company.legalName',
  'company.postalAddress',
  'officer.name',
  'officer.email',
  'officer.phone',
  'privacy.responseDays',
  'notice.version',
  'cookies.servicesInUse',
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type LiveValues = Partial<Record<TokenName, string>>;

export const isTokenName = (s: unknown): s is TokenName =>
  typeof s === 'string' && (TOKEN_NAMES as readonly string[]).includes(s);

/** The settings a value comes from, for "Settings changed: …" (§4.2). */
export const TOKEN_SOURCES: Readonly<Record<TokenName, string>> = {
  'site.name': 'site name',
  'site.url': 'website address',
  'site.company': 'company',
  'site.email': 'site email',
  'contact.email': 'contact email',
  'company.legalName': 'legal name',
  'company.postalAddress': 'address',
  'officer.name': 'grievance officer',
  'officer.email': 'grievance officer',
  'officer.phone': 'grievance officer',
  'privacy.responseDays': 'response days',
  'notice.version': 'notice version',
  'cookies.servicesInUse': 'services in use',
};

/** The settings row as the API stores it. */
export interface SettingsRow {
  contactEmail?: string | null;
  config?: unknown;
}

/** web `privacyContact(s)`: until an officer is named, mail goes to the contact address. */
export function privacyContact(row: SettingsRow | null | undefined) {
  const p = readConfig(row?.config).privacy;
  const contactEmail = row?.contactEmail ?? '';
  return {
    legalName: p.legalName || SITE.company,
    postalAddress: p.postalAddress,
    name: p.officerName,
    email: p.officerEmail || contactEmail || SITE.email,
    phone: p.officerPhone,
    responseDays: Math.min(90, Math.max(1, p.responseDays || 30)),
  };
}

// The same formats the API accepts and the website re-checks.
const GA4 = /^G-[A-Z0-9]{4,15}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;
const PIXEL = /^\d{6,20}$/;
const CLARITY = /^[a-z0-9]{6,20}$/;
const ADSENSE = /^ca-pub-\d{10,20}$/;

export interface ServicesInUse {
  analytics: string[];
  advertising: string[];
}

/** web `optionalServices(config)`: the optional services switched on, by purpose, as the banner names them. */
export function optionalServices(config: SiteConfig): ServicesInUse {
  const { ga4Id, gtmId, metaPixelId, clarityId } = config.analytics;
  const { adsenseClient, autoAds } = config.ads;
  return {
    analytics: [
      GA4.test(ga4Id) && 'Google Analytics',
      GTM.test(gtmId) && 'Google Tag Manager',
      CLARITY.test(clarityId) && 'Microsoft Clarity',
    ].filter((s): s is string => !!s),
    advertising: [
      autoAds && ADSENSE.test(adsenseClient) && 'Google AdSense',
      PIXEL.test(metaPixelId) && 'Meta Pixel',
    ].filter((s): s is string => !!s),
  };
}

/** A configured PUBLIC_SITE_URL, else the web's own default. */
export function publicSiteUrl(configured: string | null | undefined): string {
  const raw = (configured ?? '').trim().replace(/\/+$/, '');
  if (!raw) return SITE.url;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return SITE.url;
    return raw;
  } catch {
    return SITE.url;
  }
}

/**
 * Every token's value from the settings row and config. `notice.version` is
 * the revision's own notice version (privacy documents), never a setting.
 */
export function resolveAll(
  row: SettingsRow | null | undefined,
  siteUrl: string,
  noticeVersion: string | null = null,
): Record<TokenName, string> {
  const c = privacyContact(row);
  const services = optionalServices(readConfig(row?.config));
  return {
    'site.name': SITE.name,
    'site.url': publicSiteUrl(siteUrl),
    'site.company': SITE.company,
    'site.email': SITE.email,
    'contact.email': (row?.contactEmail ?? '') || SITE.email,
    'company.legalName': c.legalName,
    'company.postalAddress': c.postalAddress,
    'officer.name': c.name,
    'officer.email': c.email,
    'officer.phone': c.phone,
    'privacy.responseDays': String(c.responseDays),
    'notice.version': noticeVersion ?? '',
    'cookies.servicesInUse': [...services.analytics, ...services.advertising].join(', '),
  };
}

/** Only the values a document uses: what its revision records. */
export function pickValues(
  all: Record<TokenName, string>,
  used: Iterable<TokenName>,
): LiveValues {
  const out: LiveValues = {};
  for (const name of [...new Set(used)].sort()) out[name] = all[name];
  return out;
}

/** The names whose values differ between two records. */
export function changedTokens(a: LiveValues, b: LiveValues): TokenName[] {
  const names = new Set([...Object.keys(a), ...Object.keys(b)] as TokenName[]);
  return [...names].filter((n) => (a[n] ?? '') !== (b[n] ?? '')).sort();
}
