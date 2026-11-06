import type { LiveValues, TokenName } from '@/content/site/types';
import { optionalServices } from '@/lib/consent-services';
import { privacyContact, type SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';

/**
 * The web's token resolver (W7 addendum §4.2): the live values a token in
 * site content shows. The API has the one authoritative resolver
 * (backend/src/site-content/live-values.ts), and legal documents render from
 * the values it recorded with their revision (`liveValues`). The web uses
 * this one, with the same rules, only where there is no API answer to take
 * them from: designed pages and the shared block (often built-in), and the
 * build-time legal fallback.
 *
 * The rules are today's: `privacyContact()` and `optionalServices()`
 * (src/lib/settings.ts, src/lib/consent-services.ts) and the SITE constants.
 *
 *   const values = resolveLiveValues(settings);
 *   <RichInline value={answer} values={values} />
 */

/** The closed catalogue, in §4.2's order. */
export const TOKEN_NAMES: readonly TokenName[] = [
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
];

export function isTokenName(v: unknown): v is TokenName {
  return typeof v === 'string' && (TOKEN_NAMES as readonly string[]).includes(v);
}

/** The tokens that need no settings: the SITE constants. */
export const STATIC_VALUES: Readonly<LiveValues> = Object.freeze({
  'site.name': SITE.name,
  'site.url': SITE.url,
  'site.company': SITE.company,
  'site.email': SITE.email,
});

/**
 * Every token's value from the site settings. `notice.version` is the
 * revision's own notice version, so only the caller knows it (the
 * build-time legal fallback passes its seed's); without it the token is
 * empty.
 */
export function resolveLiveValues(
  settings: SiteSettings,
  o: { noticeVersion?: string | null } = {},
): LiveValues {
  const contact = privacyContact(settings);
  const services = optionalServices(settings.config);
  const values: LiveValues = {
    ...STATIC_VALUES,
    'contact.email': settings.contactEmail || SITE.email,
    'company.legalName': contact.legalName,
    'company.postalAddress': contact.postalAddress,
    'officer.name': contact.name,
    'officer.email': contact.email,
    'officer.phone': contact.phone,
    'privacy.responseDays': String(contact.responseDays),
    // analytics names, then advertising names (as /privacy lists them today)
    'cookies.servicesInUse': [...services.analytics, ...services.advertising].join(', '),
  };
  if (o.noticeVersion) values['notice.version'] = o.noticeVersion;
  return values;
}

/**
 * A token's value: from `values`, else the SITE constants for the four
 * static tokens, else ''. An unknown name is ''.
 */
export function tokenValue(values: LiveValues | null | undefined, name: unknown): string {
  if (!isTokenName(name)) return '';
  const v = values?.[name] ?? STATIC_VALUES[name];
  return typeof v === 'string' ? v : '';
}
