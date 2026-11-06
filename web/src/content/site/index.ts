/**
 * Key → built-in default, for the portal (which lists an item as editable
 * only once its default is here, and starts a first draft from it) and the
 * preview route (W7 addendum §3.11). Pages never import this: each page
 * passes its own default to getPageContent(key, default).
 *
 * Every fixed item with a code default is here since M7.4b: the six designed
 * pages (W1's home.ts, W2's features, about, faq, download and contact), the
 * shared "What it won't do" and the chrome. The legal documents aren't: they
 * are seeded by the API (their build-only fallbacks are content/legal/*.json),
 * and custom pages start from the portal's template. Every default is plain
 * data (types only), so the portal's server pages can import this file.
 */

import { ABOUT_DEFAULT } from './about';
import { CHROME_DEFAULT } from './chrome';
import { CONTACT_DEFAULT } from './contact';
import { DOWNLOAD_DEFAULT } from './download';
import { FAQ_DEFAULT } from './faq';
import { FEATURES_DEFAULT } from './features';
import { HOME_DEFAULT } from './home';
import type {
  AboutContent,
  ChromeContent,
  ContactContent,
  DownloadContent,
  FaqContent,
  FeaturesContent,
  HomeContent,
  WontDoContent,
} from './types';
import { WONT_DO_DEFAULT } from './wont-do';

export interface SiteContentDefaults {
  home: HomeContent;
  features: FeaturesContent;
  about: AboutContent;
  faq: FaqContent;
  download: DownloadContent;
  contact: ContactContent;
  'wont-do': WontDoContent;
  chrome: ChromeContent;
}

export type DefaultKey = keyof SiteContentDefaults;

export const SITE_CONTENT_DEFAULTS: Readonly<SiteContentDefaults> = {
  home: HOME_DEFAULT,
  features: FEATURES_DEFAULT,
  about: ABOUT_DEFAULT,
  faq: FAQ_DEFAULT,
  download: DOWNLOAD_DEFAULT,
  contact: CONTACT_DEFAULT,
  'wont-do': WONT_DO_DEFAULT,
  chrome: CHROME_DEFAULT,
};

/** Whether `key` has a built-in default yet. */
export function hasDefault(key: string): key is DefaultKey {
  return Object.prototype.hasOwnProperty.call(SITE_CONTENT_DEFAULTS, key);
}

/** The built-in default of `key`. */
export function defaultContent<K extends DefaultKey>(key: K): SiteContentDefaults[K] {
  return SITE_CONTENT_DEFAULTS[key];
}
