/**
 * A visitor's choice about the public site's optional cookies (DPDP Act:
 * consent for each purpose, withdrawable as easily as it was given). Kept in a
 * first-party cookie so the server and the page agree; nothing optional loads
 * until the visitor has said yes to its purpose.
 *
 * Purposes:
 *  - necessary: signing in, security, remembering this choice (always on);
 *  - analytics: Google Analytics, Google Tag Manager, Microsoft Clarity;
 *  - advertising: personalised Google ads and the Meta Pixel.
 */
export const CONSENT_COOKIE = 'sv_consent';
/// Bump when the purposes or the services behind them change: everyone is asked again.
export const CONSENT_VERSION = 1;
/// A choice lasts this long; then the banner asks again.
export const CONSENT_DAYS = 180;
/** Fired on window when the choice changes (detail: Consent). */
export const CONSENT_EVENT = 'sv:consent';
/** Fired on window to open the cookie settings. */
export const OPEN_SETTINGS_EVENT = 'sv:consent-open';

export interface Consent {
  version: number;
  /** Random; ties the choice to its entry in the consent log. */
  id: string;
  analytics: boolean;
  advertising: boolean;
  /** When it was made (ms). */
  at: number;
}

/** "1.<id>.<analytics>.<advertising>.<at>"; anything else is no choice. */
export function parseConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null;
  const m = /^(\d+)\.([a-z0-9]{8,40})\.([01])\.([01])\.(\d{10,15})$/.exec(
    decodeURIComponent(raw),
  );
  if (!m) return null;
  const consent = {
    version: Number(m[1]),
    id: m[2],
    analytics: m[3] === '1',
    advertising: m[4] === '1',
    at: Number(m[5]),
  };
  const expired = Date.now() - consent.at > CONSENT_DAYS * 86_400_000;
  return consent.version === CONSENT_VERSION && !expired ? consent : null;
}

export function serializeConsent(c: Consent): string {
  return [
    c.version,
    c.id,
    c.analytics ? 1 : 0,
    c.advertising ? 1 : 0,
    c.at,
  ].join('.');
}

/** The saved choice in this browser, or null when there is none (or it lapsed). */
export function readConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  const hit = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(hit?.slice(CONSENT_COOKIE.length + 1));
}

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Saves a choice, tells the page, and returns it. */
export function saveConsent(choice: {
  analytics: boolean;
  advertising: boolean;
}): Consent {
  const consent: Consent = {
    version: CONSENT_VERSION,
    id: readConsent()?.id ?? newId(),
    analytics: choice.analytics,
    advertising: choice.advertising,
    at: Date.now(),
  };
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(consent)}; Max-Age=${
    CONSENT_DAYS * 86_400
  }; Path=/; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: consent }));
  return consent;
}

/** Opens the cookie settings (footer link). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}

/** Cookies the optional services set; removed when their purpose is switched off. */
const OPTIONAL_COOKIES: Record<'analytics' | 'advertising', RegExp> = {
  analytics: /^(_ga|_ga_.*|_gid|_gat.*|_clck|_clsk|CLID|MUID|ANONCHK|SM)$/,
  advertising: /^(_fbp|_fbc|__gads|__gpi|__eoi|_gcl_.*)$/,
};

/** Deletes this site's cookies for a purpose that was just switched off. */
export function clearOptionalCookies(purpose: 'analytics' | 'advertising') {
  const host = location.hostname;
  const domains = ['', host, `.${host}`];
  const parts = host.split('.');
  if (parts.length > 2) domains.push(`.${parts.slice(-2).join('.')}`);
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0];
    if (!OPTIONAL_COOKIES[purpose].test(name)) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}`;
    }
  }
}
