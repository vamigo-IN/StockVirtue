'use client';

import { CookieSettingsButton } from './CookieSettingsButton';

/**
 * The privacy notice's own "Cookie settings" button (the document's
 * `cookieSettings` island, set as an inline link). The footers render
 * CookieSettingsButton itself.
 *
 * A client module of its own on purpose: Next merges a parent page's
 * client-reference manifest into its child routes, so when /privacy
 * rendered CookieSettingsButton, the footer's button on /privacy/hi and
 * /privacy/requests was mapped to /privacy's chunk and every visit there
 * downloaded the notice's code as well (about 3 KB gzip).
 */
export function NoticeCookieSettings() {
  return <CookieSettingsButton className="inline-link" />;
}
