import { SiteContentKind } from '@prisma/client';
import type { PermissionKey } from '../rbac/rbac.catalog';

/**
 * The fixed items of the admin-managed public site (W7 addendum §1.1, §2.1):
 * which kind each key is, where it shows, which cache tag its web fetch
 * carries (§7.5, Appendix B), and the document profile of the legal ones
 * (§4.4). Custom pages are keyed by their row's UUID and found by slug.
 */

export const DESIGNED_KEYS = [
  'home',
  'features',
  'about',
  'faq',
  'download',
  'contact',
] as const;
export const SHARED_KEYS = ['wont-do'] as const;
export const CHROME_KEY = 'chrome' as const;
export const LEGAL_KEYS = [
  'privacy',
  'privacy-hi',
  'terms',
  'disclaimer',
  'privacy-requests',
] as const;

export type DesignedKey = (typeof DESIGNED_KEYS)[number];
export type SharedKey = (typeof SHARED_KEYS)[number];
export type LegalKey = (typeof LEGAL_KEYS)[number];
export type FixedKey = DesignedKey | SharedKey | typeof CHROME_KEY | LegalKey;

/** The document profiles (§4.4). */
export type DocProfile =
  | 'privacy-en'
  | 'privacy-hi'
  | 'terms'
  | 'disclaimer'
  | 'requests'
  | 'simple';

export interface FixedItem {
  key: FixedKey;
  kind: SiteContentKind;
  /** The page it renders on; null for the shared block and the chrome. */
  path: string | null;
  lang: 'en' | 'hi';
  /** The name shown in the portal's Pages list. */
  title: string;
  /** LEGAL only. */
  profile?: DocProfile;
  /** Whether the page shows "Updated {date}" (LEGAL only). */
  showUpdated?: boolean;
}

const item = (i: FixedItem) => i;

export const FIXED_ITEMS: Readonly<Record<FixedKey, FixedItem>> = {
  home: item({ key: 'home', kind: 'DESIGNED', path: '/', lang: 'en', title: 'Home' }),
  features: item({ key: 'features', kind: 'DESIGNED', path: '/features', lang: 'en', title: 'The app' }),
  about: item({ key: 'about', kind: 'DESIGNED', path: '/about', lang: 'en', title: 'About' }),
  faq: item({ key: 'faq', kind: 'DESIGNED', path: '/faq', lang: 'en', title: 'FAQ' }),
  download: item({ key: 'download', kind: 'DESIGNED', path: '/download', lang: 'en', title: 'Download' }),
  contact: item({ key: 'contact', kind: 'DESIGNED', path: '/contact', lang: 'en', title: 'Contact' }),
  'wont-do': item({ key: 'wont-do', kind: 'SHARED', path: null, lang: 'en', title: "What it won't do" }),
  chrome: item({ key: 'chrome', kind: 'CHROME', path: null, lang: 'en', title: 'Menus & footer' }),
  privacy: item({ key: 'privacy', kind: 'LEGAL', path: '/privacy', lang: 'en', title: 'Privacy notice', profile: 'privacy-en', showUpdated: true }),
  'privacy-hi': item({ key: 'privacy-hi', kind: 'LEGAL', path: '/privacy/hi', lang: 'hi', title: 'Privacy notice (Hindi)', profile: 'privacy-hi', showUpdated: true }),
  terms: item({ key: 'terms', kind: 'LEGAL', path: '/terms', lang: 'en', title: 'Terms & Conditions', profile: 'terms', showUpdated: true }),
  disclaimer: item({ key: 'disclaimer', kind: 'LEGAL', path: '/disclaimer', lang: 'en', title: 'Risk Disclaimer', profile: 'disclaimer', showUpdated: true }),
  'privacy-requests': item({ key: 'privacy-requests', kind: 'LEGAL', path: '/privacy/requests', lang: 'en', title: 'Privacy requests and grievances', profile: 'requests', showUpdated: false }),
};

export const FIXED_KEYS = Object.keys(FIXED_ITEMS) as FixedKey[];

export const isFixedKey = (k: string): k is FixedKey =>
  Object.prototype.hasOwnProperty.call(FIXED_ITEMS, k);
export const isLegalKey = (k: string): k is LegalKey =>
  (LEGAL_KEYS as readonly string[]).includes(k);
/** The two privacy notices publish through the privacy-notice flow (M7.3). */
export const PRIVACY_KEYS = ['privacy', 'privacy-hi'] as const;
export const isPrivacyKey = (k: string) =>
  (PRIVACY_KEYS as readonly string[]).includes(k);

/** The tag a web fetch of this item carries (§7.5, Appendix B). */
export function itemTag(key: string, kind: SiteContentKind, slug?: string | null) {
  if (kind === 'CHROME') return 'site-chrome';
  if (kind === 'CUSTOM') return slug ? `custom:${slug}` : null;
  return `content:${key}`;
}

/** Tags of the content index: the sitemap and generateStaticParams. */
export const SITE_PAGES_TAG = 'site-pages';
export const SITE_CHROME_TAG = 'site-chrome';
export const SITE_SETTINGS_TAG = 'site-settings';

/** Who may read, and who may change, an item of each kind (§7.3). */
export const READ_PERMISSIONS: readonly PermissionKey[] = [
  'site.manage',
  'legal.manage',
  'settings.read',
];
export function writePermission(kind: SiteContentKind): PermissionKey {
  return kind === 'LEGAL' ? 'legal.manage' : 'site.manage';
}
