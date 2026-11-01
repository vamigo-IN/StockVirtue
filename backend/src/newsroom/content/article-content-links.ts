// Control characters other than tab never belong in a link.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Accepts http(s) URLs, mailto: and site-relative paths. Anything else
 * (javascript:, data:, protocol-relative //host) is dropped.
 */
export function safeHref(raw: unknown): string | null {
  const href =
    typeof raw === 'string'
      ? raw.replace(CONTROL, '').trim().slice(0, 2000)
      : '';
  if (!href) return null;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
