/**
 * The site-content href rule (W7 addendum §3.1, §9.1), for inline links,
 * document links and menus; web/src/lib/site-content/href.ts applies the same
 * rule again at render. The newsroom's `safeHref` is not used: it lets
 * "/\evil.example" and "/<TAB>/evil.example" through, which browsers resolve
 * to another host. A link is accepted when it is:
 * - a site path: "/…" with no "//", "/\", whitespace or control characters,
 *   that resolves to the site's own origin;
 * - "mailto:" with one address; or
 * - an absolute http(s) URL to another host (use a site path for the site).
 */

export type HrefKind = 'path' | 'mailto' | 'external';

export type HrefCheck =
  | { ok: true; href: string; kind: HrefKind }
  | { ok: false; message: string };

const SITE_PATH = /^\/(?![/\\])[^\s\\]*$/;
const MAILTO = /^mailto:[^\s@]+@[^\s@]+$/;
// C0 controls, DEL and the C1 range: never in an href.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

const hostOf = (siteUrl: string) => {
  try {
    return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'stockvirtue.com';
  }
};

export function checkHref(href: unknown, siteUrl: string, maxLength = 500): HrefCheck {
  if (typeof href !== 'string' || href.length === 0) {
    return { ok: false, message: 'A link needs an address.' };
  }
  if (href.length > maxLength) {
    return { ok: false, message: `A link address can be at most ${maxLength} characters.` };
  }
  if (CONTROL.test(href)) {
    return { ok: false, message: 'This link address has hidden characters in it. Type it again.' };
  }
  let origin: string;
  try {
    origin = new URL(siteUrl).origin;
  } catch {
    origin = 'https://stockvirtue.com';
  }
  if (href.startsWith('/')) {
    if (!SITE_PATH.test(href)) {
      return { ok: false, message: 'Links on this site start with a single "/" and have no spaces or backslashes.' };
    }
    try {
      const resolved = new URL(href, origin);
      if (resolved.origin !== origin) throw new Error('other host');
      // "/a/..//x" resolves to the path "//x", which a browser would read as
      // another host once it is written into a page (the web refuses it too).
      if (resolved.pathname.startsWith('//')) throw new Error('protocol-relative');
    } catch {
      return { ok: false, message: 'This link would leave the site. Use the full address of the other site instead.' };
    }
    return { ok: true, href, kind: 'path' };
  }
  if (/^mailto:/i.test(href)) {
    if (!MAILTO.test(href)) {
      return { ok: false, message: 'An email link has one address, like mailto:name@example.com.' };
    }
    return { ok: true, href, kind: 'mailto' };
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { ok: false, message: 'Links are a site path ("/news"), an email address (mailto:) or a full web address (https://…).' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: 'Links are a site path ("/news"), an email address (mailto:) or a full web address (https://…).' };
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === hostOf(siteUrl)) {
    return { ok: false, message: 'This link points at this site: use the page’s path instead (for example "/faq").' };
  }
  return { ok: true, href, kind: 'external' };
}

/** A file the menus link as a plain <a> (the footer's RSS feed). */
export const isFileHref = (href: string) => /\.(xml|txt|json)(#.*)?$/i.test(href);
